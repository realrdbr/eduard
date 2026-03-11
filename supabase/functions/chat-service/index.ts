import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Valid actions whitelist
const VALID_ACTIONS = [
  'list_conversations',
  'list_messages', 
  'create_conversation',
  'add_message',
  'delete_conversation',
  'delete_all_conversations',
  'touch_conversation'
] as const;

type ValidAction = typeof VALID_ACTIONS[number];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const deny = (status = 401, message = "Unauthorized") =>
    new Response(JSON.stringify({ success: false, error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    });

  try {
    const body = await req.json()
    const { action, sessionId } = body

    if (!action) {
      return deny(400, 'Missing action');
    }

    // Input validation: Action whitelist
    if (!VALID_ACTIONS.includes(action as ValidAction)) {
      return deny(400, 'Unknown action');
    }

    // Input validation: Require sessionId for all actions
    if (!sessionId || typeof sessionId !== 'string' || !UUID_REGEX.test(sessionId)) {
      return deny(400, 'Missing or invalid sessionId (must be UUID)');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Resolve actor from session using secure RPC function
    const { data: actorData, error: actorErr } = await supabase.rpc('get_actor_from_session_secure', {
      v_session_id: sessionId
    });

    if (actorErr) {
      console.error("chat-service session resolution error:", actorErr);
      return deny(500, "Session resolution failed");
    }

    if (!actorData || actorData.length === 0) {
      return deny(401, "Invalid or expired session");
    }

    const actor = actorData[0];
    const profileId = actor.id.toString();
    
    console.log('[chat-service] actor resolved', { id: actor.id, username: actor.username, action });

    // Helper: verify conversation belongs to user
    const ensureOwnership = async (conversationId: string) => {
      // Validate conversationId format
      if (!conversationId || typeof conversationId !== 'string' || !UUID_REGEX.test(conversationId)) {
        throw new Error('Invalid conversationId format');
      }
      
      const { data: conv, error } = await supabase
        .from('chat_conversations')
        .select('user_id')
        .eq('id', conversationId)
        .maybeSingle()
      if (error) throw error
      if (!conv || conv.user_id !== profileId) {
        throw new Error('Forbidden')
      }
    }

    // Input validation helper for strings
    const validateString = (value: unknown, fieldName: string, maxLength = 10000): string => {
      if (typeof value !== 'string') {
        throw new Error(`${fieldName} must be a string`);
      }
      if (value.length > maxLength) {
        throw new Error(`${fieldName} exceeds maximum length of ${maxLength}`);
      }
      return value;
    };

    switch (action) {
      case 'list_conversations': {
        const { data, error } = await supabase
          .from('chat_conversations')
          .select('id, title, created_at, updated_at')
          .eq('user_id', profileId)
          .order('updated_at', { ascending: false })
        if (error) throw error
        return new Response(JSON.stringify({ success: true, conversations: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      case 'list_messages': {
        const { conversationId } = body
        if (!conversationId) throw new Error('Missing conversationId')
        await ensureOwnership(conversationId)

        const { data, error } = await supabase
          .from('chat_messages')
          .select('role, content, created_at')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
        if (error) throw error
        return new Response(JSON.stringify({ success: true, messages: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      case 'create_conversation': {
        const title = validateString(body.title, 'title', 200);
        
        const { data, error } = await supabase
          .from('chat_conversations')
          .insert({ user_id: profileId, title })
          .select('id')
          .single()
        if (error) throw error
        return new Response(JSON.stringify({ success: true, conversationId: data.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      case 'add_message': {
        const { conversationId } = body
        const role = validateString(body.role, 'role', 20);
        const content = validateString(body.content, 'content', 100000);
        
        if (!conversationId) throw new Error('Missing conversationId')
        
        // Validate role value
        if (!['user', 'assistant', 'system'].includes(role)) {
          throw new Error('Invalid role value');
        }
        
        await ensureOwnership(conversationId)

        const { error: msgErr } = await supabase
          .from('chat_messages')
          .insert({ conversation_id: conversationId, role, content })
        if (msgErr) throw msgErr

        const { error: updErr } = await supabase
          .from('chat_conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', conversationId)
        if (updErr) throw updErr

        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      case 'delete_conversation': {
        const { conversationId } = body
        if (!conversationId) throw new Error('Missing conversationId')
        await ensureOwnership(conversationId)

        // Delete messages first (FK might not cascade)
        await supabase.from('chat_messages').delete().eq('conversation_id', conversationId)
        await supabase.from('chat_conversations').delete().eq('id', conversationId)
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      case 'delete_all_conversations': {
        // Get all conv ids
        const { data: convs, error: convErr } = await supabase
          .from('chat_conversations')
          .select('id')
          .eq('user_id', profileId)
        if (convErr) throw convErr

        const ids = (convs || []).map(c => c.id)
        if (ids.length > 0) {
          await supabase.from('chat_messages').delete().in('conversation_id', ids)
          await supabase.from('chat_conversations').delete().in('id', ids)
        }
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      case 'touch_conversation': {
        const { conversationId } = body
        if (!conversationId) throw new Error('Missing conversationId')
        await ensureOwnership(conversationId)
        await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId)
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      default:
        return deny(400, 'Unknown action');
    }
  } catch (error) {
    console.error('chat-service error:', error)
    return new Response(JSON.stringify({ success: false, error: error.message || 'Internal error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})