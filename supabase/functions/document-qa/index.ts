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
    const { documentId, question, userProfile } = await req.json()
    
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get document analysis
    const { data: document, error: docError } = await supabase
      .from('document_analysis')
      .select('*')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      throw new Error('Dokument nicht gefunden')
    }

    // Check if user has access to this document
    const { data: profile } = await supabase
      .from('profiles')
      .select(`
        *,
        permissions!inner(permission_lvl)
      `)
      .eq('user_id', userProfile.user_id)
      .single()

    if (!profile) {
      throw new Error('Benutzer nicht gefunden')
    }

    // Get document content for context
    const documentContext = document.analysis_result?.full_analysis || document.content_summary || 'Keine Analyse verfügbar'

    // Call Ollama API for Q&A using generate endpoint
    const prompt = `Du bist ein KI-Assistent, der Fragen zu hochgeladenen Dokumenten beantwortet. Du hast Zugang zu einer Analyse des Dokuments "${document.file_name}".

Dokument-Informationen:
- Dateiname: ${document.file_name}
- Fach: ${document.subject || 'Nicht spezifiziert'}
- Klassenstufe: ${document.grade_level || 'Nicht spezifiziert'}
- Dateityp: ${document.file_type}

Dokumenteninhalt/Analyse:
${documentContext}

Beantworte die Frage des Benutzers basierend auf diesem Dokument. Wenn es sich um mathematische Aufgaben handelt, löse sie Schritt für Schritt. Bei anderen Fächern gib detaillierte, hilfreiche Antworten.

Frage des Benutzers:
${question}`;

    const qaResponse = await fetch('http://79.243.42.245:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'Redbear/e.d.u.a.r.d.',
        prompt,
        stream: false
      })
    })

    if (!qaResponse.ok) {
      throw new Error('Fehler bei der KI-Antwort')
    }

    const qaData = await qaResponse.json()
    const answer = qaData.response || qaData.message?.content || 'Antwort nicht verfügbar'

    // Log the Q&A interaction (optional - you could create a qa_interactions table)
    const { error: logError } = await supabase
      .from('document_analysis')
      .update({
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId)

    return new Response(
      JSON.stringify({
        success: true,
        answer,
        document: {
          file_name: document.file_name,
          subject: document.subject,
          grade_level: document.grade_level
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in document Q&A:', error)
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