import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { text, voice_id = 'Aria', title, description, user_id } = await req.json();
    
    if (!text) {
      throw new Error('Text ist erforderlich');
    }

    const elevenLabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!elevenLabsApiKey) {
      throw new Error('ElevenLabs API Key ist nicht konfiguriert');
    }

    // ElevenLabs Voice IDs
    const voiceIds: { [key: string]: string } = {
      'Aria': '9BWtsMINqrJLrRacOk9x',
      'Roger': 'CwhRBWXzGAHq8TQ4Fs17', 
      'Sarah': 'EXAVITQu4vr4xnSDxMaL',
      'Laura': 'FGY2WhTYpPnrIDTdsKH5',
      'Charlie': 'IKne3meq5aSn9XLyUdCD',
      'George': 'JBFqnCBsd6RMkjVDRZzb',
      'Callum': 'N2lVS1w4EtoT3dr4eOWO',
      'River': 'SAz9YHcvj6GT2YYXdXww',
      'Liam': 'TX3LPaxmHKxFdv7VOQHJ',
      'Charlotte': 'XB0fDUnXU5powFXDhCwa'
    };

    const selectedVoiceId = voiceIds[voice_id] || voiceIds['Aria'];

    // Generate speech with ElevenLabs
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': elevenLabsApiKey,
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API Error:', errorText);
      throw new Error(`ElevenLabs API Fehler: ${response.status}`);
    }

    // Convert to base64
    const audioBuffer = await response.arrayBuffer();
    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));

    // Save to Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Permission check via custom permissions (by username) and use level, not UUID
    if (!user_id) {
      throw new Error('Nicht authentifiziert - user_id fehlt');
    }
    const { data: profile, error: permErr } = await supabase
      .from('permissions')
      .select('permission_lvl')
      .eq('username', user_id)
      .maybeSingle();
    if (permErr) {
      console.error('Permission lookup error:', permErr);
    }
    if (!profile || profile.permission_lvl < 10) {
      throw new Error('Keine Berechtigung für Audio-Ankündigungen - Level 10 erforderlich');
    }

    const { data, error } = await supabase
      .from('audio_announcements')
      .insert({
        title: title || 'TTS-Durchsage',
        description: description || `TTS-Durchsage erstellt`,
        is_tts: true,
        tts_text: text,
        voice_id: voice_id,
        is_active: true,
        created_by: null,
        duration_seconds: Math.ceil(text.length / 15), // Rough estimation
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase Error:', error);
      throw error;
    }

    return new Response(
      JSON.stringify({
        success: true,
        audioContent: base64Audio,
        announcement: data,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('TTS Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Unbekannter Fehler' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});