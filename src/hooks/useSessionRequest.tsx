import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

// Custom hook for making session-based database requests
export const useSessionRequest = () => {
  const { sessionId } = useAuth();

  const withSession = async <T,>(
    operation: () => Promise<T>
  ): Promise<T> => {
    if (!sessionId) {
      throw new Error('No active session');
    }

    console.log('Setting session context:', sessionId);
    
    // Set session context for the database to use in RLS policies
    const { data: contextResult, error: contextError } = await supabase.rpc('set_session_context', {
      session_id_param: sessionId
    });
    
    console.log('Session context result:', { contextResult, contextError });

    try {
      return await operation();
    } finally {
      // Do not clear the session context here to avoid breaking subsequent RLS-guarded operations.
      // The context is per-connection; we rely on setting it before sensitive operations.
    }
  };

  return { withSession };
};