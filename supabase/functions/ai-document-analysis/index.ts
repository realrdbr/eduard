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
    const { fileName, fileContent, userProfile } = await req.json()
    
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Call Ollama API (generate endpoint) for document analysis
    const prompt = `Du bist ein KI-Assistent, der Schuldokumente analysiert. Analysiere das Dokument und extrahiere wichtige Informationen wie Fach, Klassenstufe, Themen und erstelle eine Zusammenfassung.

Dokument: ${fileName}

Inhalt:
${fileContent}

Gib eine strukturierte Analyse mit den Feldern: Fach, Klassenstufe, Themen (Liste), Zusammenfassung.`;

    const analysisResponse = await fetch('http://79.243.42.245:11434/api/generate', {
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

    if (!analysisResponse.ok) {
      throw new Error('Fehler bei der KI-Analyse')
    }

    const analysisData = await analysisResponse.json()
    const analysisResult = analysisData.response || analysisData.message?.content || 'Analyse nicht verfügbar'

    // Extract structured information (basic parsing)
    const extractSubject = (text: string) => {
      const subjectMatch = text.match(/fach[:\s]*([a-zA-ZäöüÄÖÜß\s]+)/i)
      return subjectMatch ? subjectMatch[1].trim() : null
    }

    const extractGradeLevel = (text: string) => {
      const gradeMatch = text.match(/klasse[:\s]*(\d+[a-zA-Z]?)/i)
      return gradeMatch ? gradeMatch[1].trim() : null
    }

    const subject = extractSubject(analysisResult)
    const gradeLevel = extractGradeLevel(analysisResult)

    // Save analysis to database
    const { data, error } = await supabase
      .from('document_analysis')
      .insert({
        file_name: fileName,
        file_path: `documents/${fileName}`,
        file_type: fileName.split('.').pop() || 'unknown',
        subject: subject,
        grade_level: gradeLevel,
        content_summary: analysisResult.substring(0, 500),
        analysis_result: {
          full_analysis: analysisResult,
          extracted_info: {
            subject,
            grade_level,
            topics: []
          }
        },
        uploaded_by: userProfile.user_id
      })

    if (error) {
      throw new Error(`Fehler beim Speichern der Analyse: ${error.message}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        analysis: analysisResult,
        metadata: {
          subject,
          grade_level,
          file_name: fileName
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in document analysis:', error)
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