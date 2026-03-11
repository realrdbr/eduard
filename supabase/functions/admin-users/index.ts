import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { action, sessionId } = payload;
    console.log('[admin-users] input', { action, hasSessionId: !!sessionId });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const deny = (status = 401, message = "Unauthorized") =>
      new Response(JSON.stringify({ success: false, error: message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status,
      });

    if (!action) return deny(400, "Missing action");

    // SECURITY FIX: Validate sessionId format and resolve actor from session
    // Instead of trusting client-provided actorUserId/actorUsername
    if (!sessionId || typeof sessionId !== 'string' || !UUID_REGEX.test(sessionId)) {
      return deny(400, "Missing or invalid sessionId (must be UUID)");
    }

    // Resolve actor from session using secure RPC function
    const { data: actorData, error: actorErr } = await supabase.rpc('get_actor_from_session_secure', {
      v_session_id: sessionId
    });

    if (actorErr) {
      console.error("admin-users session resolution error:", actorErr);
      return deny(500, "Session resolution failed");
    }

    if (!actorData || actorData.length === 0) {
      return deny(401, "Invalid or expired session");
    }

    const actor = actorData[0];
    console.log('[admin-users] actor resolved from session', { 
      id: actor.id, 
      username: actor.username, 
      permission_lvl: actor.permission_lvl 
    });

    switch (action) {
      case "list_users": {
        if ((actor.permission_lvl ?? 0) < 10) return deny(403, "Insufficient permissions");
        const { data, error } = await supabase
          .from("permissions")
          .select("id, username, name, permission_lvl, created_at, user_class, keycard_number, keycard_active")
          .order("permission_lvl", { ascending: false })
          .order("name", { ascending: true });
        
        console.log('[admin-users] list_users result', { count: data?.length, error });
        
        if (error) throw error;
        return new Response(
          JSON.stringify({ success: true, users: data || [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "update_user": {
        if ((actor.permission_lvl ?? 0) < 10) return deny(403, "Insufficient permissions");
        const { targetUserId, targetUsername, updates } = payload;
        console.log('[admin-users] update_user input', { targetUserId, targetUsername, updates });

        if (!targetUserId && !targetUsername) return deny(400, "Missing target identifier");

        // Resolve target user by id or username
        let targetUserIdResolved = targetUserId;
        if (!targetUserIdResolved && targetUsername) {
          const { data: targetByName, error: targetByNameErr } = await supabase
            .from("permissions")
            .select("id, username, name")
            .eq("username", targetUsername)
            .maybeSingle();
          if (targetByNameErr) {
            console.error("Target user lookup by username error:", targetByNameErr);
            return deny(500, `Fehler beim Suchen des Benutzers: ${targetByNameErr.message}`);
          }
          if (!targetByName) return deny(404, "Benutzer nicht gefunden");
          targetUserIdResolved = targetByName.id;
        }

        // Check if target user exists
        const { data: targetUser, error: targetError } = await supabase
          .from("permissions")
          .select("id, username, name")
          .eq("id", targetUserIdResolved)
          .maybeSingle();

        console.log('[admin-users] target user check', { targetUser, targetError });

        if (targetError) {
          console.error("Target user lookup error:", targetError);
          return deny(500, `Fehler beim Suchen des Benutzers: ${targetError.message}`);
        }

        if (!targetUser) {
          return deny(404, "Benutzer nicht gefunden");
        }

        const updatePayload: Record<string, unknown> = {};
        
        // Handle class update
        if ("user_class" in updates) {
          updatePayload.user_class = updates.user_class ?? null;
        }
        
        // Handle keycard updates
        if ("keycard_number" in updates) {
          updatePayload.keycard_number = updates.keycard_number || null;
        }
        
        if ("keycard_active" in updates) {
          updatePayload.keycard_active = updates.keycard_active ?? true;
        }
        
        // Handle password update using secure function with session validation
        if (updates?.new_password && updates.new_password.trim()) {
          // Use the new secure admin password change function that validates session ownership
          const { data: result, error: pwError } = await supabase.rpc('admin_change_user_password_secure', {
            v_session_id: sessionId,
            target_user_id: targetUserIdResolved,
            new_password: updates.new_password.trim()
          });

          if (pwError || !result?.success) {
            console.error('[admin-users] Password change error:', pwError, result);
            return deny(500, result?.error || 'Fehler beim Ändern des Passworts');
          }
        }

        if (Object.keys(updatePayload).length === 0) {
          // No-op update: nothing to change, but consider it a success for idempotency
          return new Response(
            JSON.stringify({ success: true, user: targetUser }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log('[admin-users] updating with payload', updatePayload);

        const { data: updatedUser, error } = await supabase
          .from("permissions")
          .update(updatePayload)
          .eq("id", targetUserIdResolved)
          .select("id, username, name, user_class, keycard_number, keycard_active")
          .maybeSingle();

        if (error) {
          console.error("Update error:", error);
          return deny(500, `Fehler beim Aktualisieren: ${error.message}`);
        }
        if (!updatedUser) {
          return deny(404, "Benutzer nicht gefunden");
        }

        console.log('[admin-users] update successful', { updatedUser });

        return new Response(
          JSON.stringify({ success: true, user: updatedUser }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete_user": {
        if ((actor.permission_lvl ?? 0) < 10) return deny(403, "Insufficient permissions");
        const { targetUserId, targetUsername } = payload;
        console.log('[admin-users] delete_user input', { targetUserId, targetUsername });
        if (!targetUserId && !targetUsername) return deny(400, "Missing target identifier");

        // Resolve target id if only username provided
        let targetIdResolved = targetUserId;
        if (!targetIdResolved && targetUsername) {
          const { data: targetByName, error: targetByNameErr } = await supabase
            .from("permissions")
            .select("id")
            .eq("username", targetUsername)
            .maybeSingle();
          if (targetByNameErr) {
            console.error("Target user lookup by username error:", targetByNameErr);
            return deny(500, `Fehler beim Suchen des Benutzers: ${targetByNameErr.message}`);
          }
          if (!targetByName) return deny(404, "Benutzer nicht gefunden");
          targetIdResolved = targetByName.id;
        }

        const { error } = await supabase
          .from("permissions")
          .delete()
          .eq("id", targetIdResolved);

        if (error) {
          console.error('Delete error:', error);
          return deny(500, `Fehler beim Löschen: ${error.message}`);
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_self": {
        return new Response(
          JSON.stringify({ success: true, user: actor }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_user_by_id": {
        // Allow librarians (6+) to view keycard info
        if ((actor.permission_lvl ?? 0) < 6) return deny(403, "Insufficient permissions");
        const { targetUserId } = payload;
        if (!targetUserId) return deny(400, "Missing targetUserId");
        const { data: userRow, error: userErr } = await supabase
          .from('permissions')
          .select('id, username, name, keycard_number, keycard_active')
          .eq('id', targetUserId)
          .maybeSingle();
        if (userErr) {
          console.error('[admin-users] get_user_by_id error', userErr);
          return deny(500, `Fehler beim Suchen des Benutzers: ${userErr.message}`);
        }
        if (!userRow) return deny(404, 'Benutzer nicht gefunden');
        return new Response(
          JSON.stringify({ success: true, user: userRow }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'search_by_keycard': {
        // Allow librarians and above to search by keycard (Level 6+)
        if ((actor.permission_lvl ?? 0) < 6) {
          return deny(403, "Bibliotheks-Berechtigung erforderlich");
        }
        
        if (!payload.keycard_number) {
          return deny(400, 'Keycard-Nummer fehlt');
        }
        
        const searchResult = await supabase
          .from('permissions')
          .select('id, name, username, keycard_number, keycard_active')
          .eq('keycard_number', payload.keycard_number)
          .eq('keycard_active', true)
          .maybeSingle();
        
        if (searchResult.error) {
          console.error('Search error:', searchResult.error);
          return deny(500, `Fehler bei der Suche: ${searchResult.error.message}`);
        }
        
        if (!searchResult.data) {
          return deny(404, 'Keycard nicht gefunden oder deaktiviert');
        }
        
        return new Response(JSON.stringify({ 
          success: true, 
          user: searchResult.data 
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      case 'list_keycards': {
        // Admins can list all keycards (Level 10+)
        if ((actor.permission_lvl ?? 0) < 10) {
          return deny(403, "Schulleitung-Berechtigung erforderlich");
        }
        
        const { data: keycards, error: kcErr } = await supabase
          .from('permissions')
          .select('id, name, username, permission_lvl, keycard_number, keycard_active')
          .not('keycard_number', 'is', null)
          .order('name', { ascending: true });
        
        if (kcErr) {
          console.error('[admin-users] list_keycards error:', kcErr);
          return deny(500, `Fehler beim Laden der Keycards: ${kcErr.message}`);
        }
        
        return new Response(JSON.stringify({ 
          success: true, 
          keycards: keycards || [] 
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      default:
        return deny(400, "Unknown action");
    }
  } catch (e) {
    console.error("admin-users error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e?.message || "Internal error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
