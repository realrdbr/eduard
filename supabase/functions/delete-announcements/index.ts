import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeleteRequest {
  id?: string;
  all?: boolean;
  sessionId: string;
}

function sanitizeStoragePath(path: string): string {
  return path.replace(/^(audio-announcements|audio-files)\//, '').replace(/^\/+/, '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { id, all, sessionId }: DeleteRequest = await req.json();

    // Validate sessionId is present
    if (!sessionId || typeof sessionId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Session-ID erforderlich' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      return new Response(
        JSON.stringify({ error: 'Ungültiges Session-Format' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve actor from session server-side
    const { data: actorData, error: actorError } = await supabaseClient.rpc('get_actor_from_session_secure', {
      v_session_id: sessionId
    });

    if (actorError || !actorData || actorData.length === 0) {
      console.error('Session validation failed:', actorError);
      return new Response(
        JSON.stringify({ error: 'Ungültige oder abgelaufene Session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const actor = actorData[0];

    if (actor.permission_lvl < 10) {
      return new Response(
        JSON.stringify({ error: 'Keine Berechtigung für diese Aktion' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔧 Delete request: ${all ? 'ALL' : `ID: ${id}`} by user: ${actor.username} (ID: ${actor.id})`);

    if (all) {
      const { data: announcements, error: fetchError } = await supabaseClient
        .from('audio_announcements')
        .select('*');

      if (fetchError) {
        console.error('Failed to fetch announcements:', fetchError);
        throw new Error('Fehler beim Abrufen der Durchsagen');
      }

      const audioAnnouncementFiles: string[] = [];
      const audioFiles: string[] = [];

      announcements?.forEach(announcement => {
        if (announcement.audio_file_path) {
          const sanitizedPath = sanitizeStoragePath(announcement.audio_file_path);
          if (announcement.is_tts) {
            audioAnnouncementFiles.push(sanitizedPath);
          } else {
            audioFiles.push(sanitizedPath);
          }
        }
      });

      console.log(`🗑️ Deleting ${audioAnnouncementFiles.length} TTS files and ${audioFiles.length} uploaded files`);

      if (audioAnnouncementFiles.length > 0) {
        const { error: storageError1 } = await supabaseClient.storage
          .from('audio-announcements')
          .remove(audioAnnouncementFiles);
        if (storageError1) {
          console.warn('Storage deletion error (audio-announcements):', storageError1);
        }
      }

      if (audioFiles.length > 0) {
        const { error: storageError2 } = await supabaseClient.storage
          .from('audio-files')
          .remove(audioFiles);
        if (storageError2) {
          console.warn('Storage deletion error (audio-files):', storageError2);
        }
      }

      const { error: dbError } = await supabaseClient
        .from('audio_announcements')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (dbError) {
        console.error('Database deletion error:', dbError);
        throw new Error('Fehler beim Löschen aus der Datenbank');
      }

      console.log(`✅ Successfully deleted all ${announcements?.length || 0} announcements`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          deleted: announcements?.length || 0,
          message: 'Alle Durchsagen wurden gelöscht'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else {
      if (!id) {
        return new Response(
          JSON.stringify({ error: 'ID erforderlich für Einzellöschung' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: announcement, error: fetchError } = await supabaseClient
        .from('audio_announcements')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) {
        console.error('Failed to fetch announcement:', fetchError);
        throw new Error('Durchsage nicht gefunden');
      }

      if (announcement.audio_file_path) {
        const bucket = announcement.is_tts ? 'audio-announcements' : 'audio-files';
        const sanitizedPath = sanitizeStoragePath(announcement.audio_file_path);
        
        console.log(`🗑️ Deleting file from bucket "${bucket}": ${sanitizedPath}`);

        const { error: storageError } = await supabaseClient.storage
          .from(bucket)
          .remove([sanitizedPath]);

        if (storageError) {
          console.warn('Storage deletion error (continuing with DB deletion):', storageError);
        } else {
          console.log(`✅ Successfully deleted file from storage: ${sanitizedPath}`);
        }
      }

      const { error: dbError } = await supabaseClient
        .from('audio_announcements')
        .delete()
        .eq('id', id);

      if (dbError) {
        console.error('Database deletion error:', dbError);
        throw new Error('Fehler beim Löschen aus der Datenbank');
      }

      console.log(`✅ Successfully deleted announcement: ${id}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Durchsage wurde gelöscht'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error: any) {
    console.error('Error in delete-announcements function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unbekannter Fehler' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
