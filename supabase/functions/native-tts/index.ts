import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// TTS generation using PiperTTS server or browser fallback
async function generateTTSAudio(text: string, voiceId: string = 'alloy', usePiper: boolean = true): Promise<{ audioBuffer: ArrayBuffer, filename: string, usedPiper: boolean }> {
  console.log('TTS Generation:', { sample: text.substring(0, 60), voiceId, usePiper })
  
  if (usePiper) {
    const endpoints = [
      'https://gymolb.eduard.services/pipertts',
      'https://gymolb.eduard.services/pipertts/',
      'http://gymolb.eduard.services/pipertts',
      'http://gymolb.eduard.services/pipertts/',
    ]

    for (const url of endpoints) {
      try {
        console.log('Attempting PiperTTS generation via', url)
        const reqInit: RequestInit = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'audio/wav, application/octet-stream',
          },
          body: JSON.stringify({ text }),
          redirect: 'manual',
        }

        let piperResponse = await fetch(url, reqInit)

        // Handle redirects explicitly to preserve POST
        if ([301, 302, 303, 307, 308].includes(piperResponse.status)) {
          const location = piperResponse.headers.get('location')
          if (location) {
            const redirectedUrl = new URL(location, url).toString()
            console.log('Redirect from PiperTTS:', { from: url, to: redirectedUrl, status: piperResponse.status })
            piperResponse = await fetch(redirectedUrl, reqInit)
          }
        }

        if (piperResponse.ok) {
          const audioBuffer = await piperResponse.arrayBuffer()
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
          const filename = `piper-tts-${timestamp}.wav`
          console.log('PiperTTS generation successful at', url, 'status:', piperResponse.status)
          return { audioBuffer, filename, usedPiper: true }
        } else {
          const errorText = await piperResponse.text().catch(() => '')
          console.warn('PiperTTS failed', { url, status: piperResponse.status, errorText })
        }
      } catch (error) {
        console.warn('PiperTTS request error', { url, error })
      }
    }
  }
  
  // Fallback: Generate simple tone pattern (disabled)
  // console.log('Using fallback tone generation...')
  // const sampleRate = 44100
  // const duration = Math.max(2, Math.min(10, text.length * 0.08))
  // const numSamples = Math.floor(sampleRate * duration)
  // const buffer = new ArrayBuffer(44 + numSamples * 2)
  // const view = new DataView(buffer)
  // const writeString = (offset: number, string: string) => {
  //   for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i))
  // }
  // writeString(0, 'RIFF')
  // view.setUint32(4, 36 + numSamples * 2, true)
  // writeString(8, 'WAVE')
  // writeString(12, 'fmt ')
  // view.setUint32(16, 16, true)
  // view.setUint16(20, 1, true)
  // view.setUint16(22, 1, true)
  // view.setUint32(24, sampleRate, true)
  // view.setUint32(28, sampleRate * 2, true)
  // view.setUint16(32, 2, true)
  // view.setUint16(34, 16, true)
  // writeString(36, 'data')
  // view.setUint32(40, numSamples * 2, true)
  // for (let i = 0; i < numSamples; i++) {
  //   const t = i / sampleRate
  //   const baseFreq = 440
  //   const modulation = Math.sin(2 * Math.PI * 2 * t) * 0.1
  //   const frequency = baseFreq + modulation * 50
  //   const envelope = Math.exp(-t * 0.5)
  //   const amplitude = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.3
  //   const sample = Math.floor(amplitude * 16384)
  //   view.setInt16(44 + i * 2, sample, true)
  // }
  // const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  // const filename = `fallback-tts-${timestamp}.wav`
  // return { audioBuffer: buffer, filename, usedPiper: false }

  // Only PiperTTS allowed now
  throw new Error('PiperTTS unavailable or failed; fallback disabled')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { text, voice_id = 'alloy', title, description, schedule_date, user_id, use_piper = true } = await req.json()
    
    console.log('Native TTS Request received:', { text, user_id, title, use_piper, voice_id })
    
    if (!text) {
      throw new Error('Text ist erforderlich')
    }
    
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    if (!user_id) {
      throw new Error('Nicht authentifiziert - user_id fehlt')
    }

    // Check permissions
    const { data: profile } = await supabase
      .from('permissions')
      .select('permission_lvl')
      .eq('username', user_id)
      .maybeSingle()

    console.log('Permission check:', { user_id, profile })

    if (!profile || profile.permission_lvl < 10) {
      throw new Error('Keine Berechtigung für Audio-Ankündigungen - Level 10 erforderlich')
    }

    // Generate TTS audio
    console.log('Generating TTS audio...')
    const { audioBuffer, filename, usedPiper } = await generateTTSAudio(text, voice_id, use_piper)
    
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('audio-announcements')
      .upload(`tts/${filename}`, audioBuffer, {
        contentType: 'audio/wav',
        cacheControl: '3600'
      })
    
    if (uploadError) {
      console.error('Upload error:', uploadError)
      throw new Error(`Fehler beim Hochladen der Audio-Datei: ${uploadError.message}`)
    }
    
    const audioFilePath = uploadData.path
    console.log('Audio uploaded to:', audioFilePath)

    // Create TTS announcement record in database
    const { data: announcement, error: insertError } = await supabase
      .from('audio_announcements')
      .insert({
        title: title || 'Native TTS Durchsage',
        description: description || `Native Text-to-Speech Durchsage erstellt von ${user_id}`,
        is_tts: true,
        tts_text: text,
        voice_id,
        audio_file_path: audioFilePath,
        schedule_date: schedule_date ? new Date(schedule_date).toISOString() : null,
        is_active: true,
        created_by: null
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
        message: usedPiper ? 'TTS-Durchsage wurde erfolgreich mit PiperTTS erstellt' : 'TTS-Durchsage wurde mit Fallback-Audio erstellt',
        audioFile: audioFilePath
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in Native TTS:', error)
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