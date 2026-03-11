import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Only allow POST requests for chat endpoints
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use POST for chat requests.' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405
      }
    )
  }

  try {
    const requestBody = await req.json()

    // Only use the working chat endpoint URL from curl test
    const url = 'https://gymolb.eduard.services/ai/api/chat';
    console.log(`Connecting to Ollama at: ${url}`);

    // Always use chat format with messages, force streaming like in working version
    const messages = Array.isArray(requestBody?.messages)
      ? requestBody.messages
      : [{ role: 'user', content: requestBody?.prompt || '' }];
    
    const body = {
      model: requestBody.model || 'Redbear/e.d.u.a.r.d.:latest', // Use exact model name with colon like in AIChat.tsx
      messages,
      stream: true,
      options: requestBody.options || undefined,
    };

    console.log(`Request body:`, JSON.stringify(body, null, 2));

    const ollamaResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!ollamaResponse.ok) {
      throw new Error(`Ollama API error: ${ollamaResponse.status} - ${ollamaResponse.statusText}`);
    }

    console.log(`Successfully connected to Ollama at: ${url}`);
    
    // Stream the response directly back to the client - exactly like curl response
    return new Response(ollamaResponse.body, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked'
      },
      status: 200
    })

  } catch (error) {
    console.error('Ollama proxy error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: 'Stelle sicher, dass Ollama auf 127.0.0.1:11434 läuft und das Modell Redbear/e.d.u.a.r.d. installiert ist.'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})