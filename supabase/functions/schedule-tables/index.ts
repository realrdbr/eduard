import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { sessionId, includeSchedules = false } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const deny = (status = 401, message = 'Unauthorized') =>
      new Response(JSON.stringify({ success: false, error: message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status,
      });

    // Validate sessionId format
    if (!sessionId || typeof sessionId !== 'string' || !UUID_REGEX.test(sessionId)) {
      return deny(400, 'Missing or invalid sessionId (must be UUID)');
    }

    // Resolve actor from session using secure RPC function
    const { data: actorData, error: actorErr } = await supabase.rpc('get_actor_from_session_secure', {
      v_session_id: sessionId
    });

    if (actorErr) {
      console.error('[schedule-tables] session resolution error:', actorErr);
      return deny(500, 'Session resolution failed');
    }

    if (!actorData || actorData.length === 0) {
      return deny(401, 'Invalid or expired session');
    }

    const actor = actorData[0];
    console.log('[schedule-tables] actor resolved from session', {
      id: actor.id,
      username: actor.username,
      permission_lvl: actor.permission_lvl
    });

    // All authenticated users can list schedule tables
    const { data: tableData, error: tableErr } = await supabase.rpc('list_schedule_tables');

    if (tableErr) {
      console.error('[schedule-tables] list error:', tableErr);
      throw tableErr;
    }

    const tables = (tableData || []).map((row: { table_name: string }) => {
      const tableName = row.table_name;
      // Extract class name: Stundenplan_<className>_A -> <className>
      const className = tableName.replace(/^Stundenplan_/, '').replace(/_A$/, '');
      return { tableName, className };
    });

    if (includeSchedules) {
      const tablesWithSchedules = await Promise.all(
        tables.map(async ({ tableName, className }) => {
          const { data: schedule, error: scheduleErr } = await supabase
            .from(tableName)
            .select('*')
            .order('Stunde');

          if (scheduleErr) {
            console.error('[schedule-tables] schedule load error:', { tableName, error: scheduleErr });
            return { tableName, className, schedule: [] };
          }

          return { tableName, className, schedule: schedule || [] };
        })
      );

      return new Response(
        JSON.stringify({ success: true, tables: tablesWithSchedules }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, tables }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[schedule-tables] error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
})
