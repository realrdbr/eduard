import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

interface SecurityEvent {
  type: 'session_timeout' | 'permission_change' | 'session_error';
  timestamp: Date;
  details: string;
}

/**
 * Security middleware for session validation
 * NOTE: Client-side security checks are NOT a security boundary - they only improve UX.
 * All actual security enforcement happens server-side via RLS policies and Edge Functions.
 * 
 * REMOVED: Client-side "suspicious activity" monitoring (security theater - not effective)
 * - Clipboard monitoring
 * - Developer tools detection
 * - Navigation pattern analysis
 * These checks can be easily bypassed and provide false sense of security.
 */
export const useSecurityMiddleware = () => {
  const { profile, signOut } = useAuth();
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  // Session validation (UX only - security enforced server-side)
  useEffect(() => {
    if (!profile) return;

    const validateSession = async () => {
      try {
        const storedSession = localStorage.getItem('sessionToken');
        if (!storedSession) {
          await cleanupSession();
          return;
        }

        // Validate session with server
        const { data, error } = await supabase.rpc('validate_session_security', {
          session_id_param: storedSession
        });
        
        if (error || !data) {
          logSecurityEvent('session_timeout', 'Session validation failed - auto logout');
          await cleanupSession();
          return;
        }
      } catch (error) {
        console.error('Session validation error:', error);
        logSecurityEvent('session_error', 'Critical session validation error');
        await cleanupSession();
      }
    };

    const cleanupSession = async () => {
      localStorage.removeItem('sessionToken');
      localStorage.removeItem('profile');
      localStorage.removeItem('lastRoute');
      sessionStorage.clear();
      await signOut();
    };

    // Validate session every 5 minutes (reduced from 3 - less aggressive)
    const interval = setInterval(validateSession, 5 * 60 * 1000);
    validateSession();

    return () => clearInterval(interval);
  }, [profile, signOut]);

  const logSecurityEvent = async (type: SecurityEvent['type'], details: string) => {
    const event: SecurityEvent = {
      type,
      timestamp: new Date(),
      details
    };
    
    setSecurityEvents(prev => [...prev.slice(-9), event]);
    console.warn('Security Event:', event);
    
    // Log to audit trail
    if (profile?.id) {
      try {
        await supabase.from('security_audit_log').insert({
          user_id: profile.id,
          event_type: type,
          event_details: { details, timestamp: event.timestamp.toISOString() },
          ip_address: null,
          user_agent: navigator.userAgent
        });
      } catch (error) {
        console.error('Failed to log security event:', error);
      }
    }
  };

  const clearSecurityEvents = () => {
    setSecurityEvents([]);
  };

  return {
    securityEvents,
    sessionToken,
    clearSecurityEvents,
    logSecurityEvent
  };
};