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
    console.log('[loan-book] input', { ...payload, sessionId: payload.sessionId ? '***' : undefined });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const deny = (status = 401, message = "Unauthorized") =>
      new Response(JSON.stringify({ success: false, error: message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status,
      });

    const { book_id, user_id, keycard_number, sessionId } = payload;

    if (!book_id || !user_id) {
      return deny(400, "Missing required fields (book_id, user_id)");
    }

    // SECURITY FIX: Validate sessionId format and resolve actor from session
    if (!sessionId || typeof sessionId !== 'string' || !UUID_REGEX.test(sessionId)) {
      return deny(400, "Missing or invalid sessionId (must be UUID)");
    }

    // Resolve actor from session using secure RPC function
    const { data: actorData, error: actorErr } = await supabase.rpc('get_actor_from_session_secure', {
      v_session_id: sessionId
    });

    if (actorErr) {
      console.error("[loan-book] session resolution error:", actorErr);
      return deny(500, "Session resolution failed");
    }

    if (!actorData || actorData.length === 0) {
      return deny(401, "Invalid or expired session");
    }

    const actor = actorData[0];
    console.log('[loan-book] actor resolved from session', { 
      id: actor.id, 
      username: actor.username, 
      permission_lvl: actor.permission_lvl 
    });

    if ((actor.permission_lvl ?? 0) < 6) {
      return deny(403, "Bibliotheks-Berechtigung erforderlich (Level 6+)");
    }

    // Check if book exists and is available
    const { data: bookData, error: bookError } = await supabase
      .from('books')
      .select('id, title, available_copies, total_copies')
      .eq('id', book_id)
      .maybeSingle();

    if (bookError) {
      console.error('Book lookup error:', bookError);
      return deny(500, `Fehler beim Suchen des Buchs: ${bookError.message}`);
    }

    if (!bookData) {
      return deny(404, "Buch nicht gefunden");
    }

    if (bookData.available_copies <= 0) {
      return deny(400, "Buch ist nicht verfügbar");
    }

    // Check if user exists
    const { data: userData, error: userError } = await supabase
      .from('permissions')
      .select('id, name, username')
      .eq('id', user_id)
      .maybeSingle();

    if (userError) {
      console.error('User lookup error:', userError);
      return deny(500, `Fehler beim Suchen des Benutzers: ${userError.message}`);
    }

    if (!userData) {
      return deny(404, "Benutzer nicht gefunden");
    }

    // Create loan - use actor.id as librarian_id since it's from validated session
    const { data: loanData, error: loanError } = await supabase
      .from('loans')
      .insert({
        book_id: book_id,
        user_id: user_id,
        keycard_number: keycard_number,
        librarian_id: actor.id
      })
      .select()
      .maybeSingle();

    if (loanError) {
      console.error('Loan creation error:', loanError);
      return deny(500, `Fehler beim Erstellen der Ausleihe: ${loanError.message}`);
    }

    // Update available copies
    const { error: updateError } = await supabase
      .from('books')
      .update({ available_copies: bookData.available_copies - 1 })
      .eq('id', book_id);

    if (updateError) {
      console.error('Book update error:', updateError);
      // Try to rollback the loan
      await supabase
        .from('loans')
        .delete()
        .eq('id', loanData.id);
      
      return deny(500, `Fehler beim Aktualisieren der Buchverfügbarkeit: ${updateError.message}`);
    }

    console.log('[loan-book] success', { loanData });

    return new Response(
      JSON.stringify({ 
        success: true, 
        loan: loanData,
        book: bookData,
        user: userData
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("loan-book error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e?.message || "Internal error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
