import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { text, voice_id = 'alloy', title, description, schedule_date, sessionId } = await req.json()
    
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // SECURITY FIX: Validate sessionId format and resolve actor from session
    // Instead of trusting client-provided user_id
    if (!sessionId || typeof sessionId !== 'string' || !UUID_REGEX.test(sessionId)) {
      throw new Error('Missing or invalid sessionId (must be UUID)')
    }

    // Resolve actor from session using secure RPC function
    const { data: actorData, error: actorErr } = await supabase.rpc('get_actor_from_session_secure', {
      v_session_id: sessionId
    });

    if (actorErr) {
      console.error("[audio-tts] session resolution error:", actorErr);
      throw new Error('Session resolution failed')
    }

    if (!actorData || actorData.length === 0) {
      throw new Error('Invalid or expired session')
    }

    const actor = actorData[0];
    console.log('[audio-tts] actor resolved from session', { 
      id: actor.id, 
      username: actor.username, 
      permission_lvl: actor.permission_lvl 
    });

    // Check permissions - Level 10 required for audio announcements
    if ((actor.permission_lvl ?? 0) < 10) {
      throw new Error('Keine Berechtigung für Audio-Ankündigungen - Level 10 erforderlich')
    }

    // Create TTS announcement record
    const { data: announcement, error: insertError } = await supabase
      .from('audio_announcements')
      .insert({
        title,
        description,
        is_tts: true,
        tts_text: text,
        voice_id,
        schedule_date: schedule_date ? new Date(schedule_date).toISOString() : null,
        created_by: null,  // Set to null since we're using username-based auth
        is_active: true
      })
      .select()
      .single()

    if (insertError) {
      throw new Error(`Fehler beim Erstellen der Durchsage: ${insertError.message}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        announcement,
        message: 'TTS-Durchsage wurde erfolgreich erstellt'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in TTS generation:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
