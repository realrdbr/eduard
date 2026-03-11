import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation constants
const VALID_ACTIONS = ['set_user_permission', 'set_level_permission', 'get_permissions'];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse and validate input
    let payload;
    try {
      payload = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON payload' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const { action, sessionId, userId, permissionId, level, allowed } = payload;

    // Validate action
    if (!action || !VALID_ACTIONS.includes(action)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or missing action parameter' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validate sessionId format
    if (!sessionId || typeof sessionId !== 'string' || !UUID_REGEX.test(sessionId)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or missing sessionId (must be UUID)' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Action-specific validation
    if (action === 'set_user_permission') {
      if (typeof userId !== 'number' || userId <= 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid userId (must be positive integer)' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
      if (!permissionId || typeof permissionId !== 'string' || permissionId.length > 100) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid permissionId' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
      if (typeof allowed !== 'boolean') {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid allowed value (must be boolean)' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
    }

    if (action === 'set_level_permission') {
      if (typeof level !== 'number' || level < 1 || level > 10) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid level (must be 1-10)' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
      if (!permissionId || typeof permissionId !== 'string' || permissionId.length > 100) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid permissionId' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
      if (typeof allowed !== 'boolean') {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid allowed value (must be boolean)' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
    }

    // Resolve actor from session (validation already done above)
    const { data: actorId, error: actorErr } = await supabase.rpc('resolve_current_user_from_session', {
      v_session_id: sessionId
    });

    if (actorErr || !actorId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired session' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Fetch actor permission level
    const { data: actor, error: fetchErr } = await supabase
      .from('permissions')
      .select('permission_lvl')
      .eq('id', actorId)
      .maybeSingle();

    if (fetchErr || !actor) {
      return new Response(
        JSON.stringify({ success: false, error: 'Actor not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    if ((actor.permission_lvl ?? 0) < 10) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient permissions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    if (action === 'set_user_permission') {
      const { error } = await supabase
        .from('user_permissions')
        .upsert(
          {
            user_id: userId,
            permission_id: permissionId,
            allowed: allowed,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id,permission_id' }
        );

      if (error) {
        console.error('Error setting user permission:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'set_level_permission') {
      const { error } = await supabase
        .from('level_permissions')
        .upsert(
          {
            level: level,
            permission_id: permissionId,
            allowed: allowed,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'level,permission_id' }
        );

      if (error) {
        console.error('Error setting level permission:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get_permissions') {
      // Return both user and level permissions for UI consumption
      const { data: userPerms, error: userPermsErr } = await supabase
        .from('user_permissions')
        .select('*');
      const { data: levelPerms, error: levelPermsErr } = await supabase
        .from('level_permissions')
        .select('*');

      if (userPermsErr || levelPermsErr) {
        const err = userPermsErr || levelPermsErr;
        console.error('Error fetching permissions:', err);
        return new Response(
          JSON.stringify({ success: false, error: err.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, user_permissions: userPerms ?? [], level_permissions: levelPerms ?? [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ success: false, error: 'Unknown action' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  } catch (error) {
    console.error('Error in permission-manager:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
