import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { text, voice_id = 'alloy', title, description, schedule_date, user_id } = await req.json()
    
    console.log('Python TTS Request received:', { text, user_id, title })
    
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    if (!user_id) {
      throw new Error('Nicht authentifiziert - user_id fehlt')
    }

    // Check permissions using username instead of UUID
    const { data: profile } = await supabase
      .from('permissions')
      .select('permission_lvl')
      .eq('username', user_id)
      .maybeSingle()

    console.log('Permission check:', { user_id, profile })

    if (!profile || profile.permission_lvl < 10) {
      throw new Error('Keine Berechtigung für Audio-Ankündigungen - Level 10 erforderlich')
    }

    // Execute Python TTS script
    const pythonProcess = new Deno.Command("python3", {
      args: ["./scripts/tts_generator.py", text, title || "TTS Durchsage"],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await pythonProcess.output();
    
    if (code !== 0) {
      const errorOutput = new TextDecoder().decode(stderr);
      console.error('Python script error:', errorOutput);
      throw new Error(`TTS-Script Fehler: ${errorOutput}`);
    }

    const pythonResult = JSON.parse(new TextDecoder().decode(stdout));
    console.log('Python TTS result:', pythonResult);

    if (!pythonResult.success) {
      throw new Error(pythonResult.error);
    }

    // Create TTS announcement record in database (created_by can be null now)
    const { data: announcement, error: insertError } = await supabase
      .from('audio_announcements')
      .insert({
        title: title || 'TTS Durchsage',
        description: description || `Text-to-Speech Durchsage erstellt von ${user_id}`,
        is_tts: true,
        tts_text: text,
        voice_id,
        audio_file_path: pythonResult.audio_file,
        schedule_date: schedule_date ? new Date(schedule_date).toISOString() : null,
        is_active: true
        // created_by is omitted so it defaults to null
      })
      .select()
      .maybeSingle()

    console.log('Database insert result:', { announcement, insertError })

    if (insertError) {
      throw new Error(`Fehler beim Erstellen der Durchsage: ${insertError.message}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        announcement,
        python_result: pythonResult,
        message: 'TTS-Durchsage wurde erfolgreich mit Python erstellt',
        audioFile: pythonResult.audio_file
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in Python TTS:', error)
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