import { useState, useEffect, createContext, useContext } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  id: number;
  user_id: string;
  username: string;
  name: string;
  permission_lvl: number;
  password: string;
  created_at: string;
  must_change_password?: boolean;
  // Extended fields from permissions table
  user_class?: string | null;
  keycard_number?: string | null;
  keycard_active?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signInWithUsername: (username: string, password: string) => Promise<{ error: any; mustChangePassword?: boolean }>;
  signOut: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string, isForced?: boolean) => Promise<{ error: any }>;
  createUser: (username: string, password: string, fullName: string, permissionLevel: number, keycardNumber?: string, keycardActive?: boolean) => Promise<{ error: any }>;
  sessionId: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    // Check for stored login data in cookies
    const initializeAuth = async () => {
      const storedProfile = localStorage.getItem('school_profile');
      const storedSessionId = localStorage.getItem('school_session_id');
      
      if (storedProfile && storedSessionId) {
        try {
          const profile = JSON.parse(storedProfile);
          
          // Validate session before using it
          const { data: isValid } = await supabase.rpc('validate_session_security', {
            session_id_param: storedSessionId
          });
          
          if (isValid) {
            let enrichedProfile = profile;
            // Attempt to enrich stored profile with keycard info if missing
            try {
              if (!('keycard_number' in profile)) {
                const { data: selfData } = await supabase.functions.invoke('admin-users', {
                  body: {
                    action: 'get_self',
                    sessionId: storedSessionId
                  }
                });
                if (selfData?.user) {
                  enrichedProfile = {
                    ...profile,
                    user_class: selfData.user.user_class ?? null,
                    keycard_number: selfData.user.keycard_number ?? null,
                    keycard_active: selfData.user.keycard_active ?? true,
                  } as any;
                  localStorage.setItem('school_profile', JSON.stringify(enrichedProfile));
                }
              }
            } catch (e) {
              console.warn('Profile enrichment skipped:', e);
            }

            setProfile(enrichedProfile);
            setSessionId(storedSessionId);
            setUser({
              id: profile.username,
              app_metadata: {},
              user_metadata: { username: profile.username, full_name: profile.name },
              aud: 'authenticated',
              created_at: new Date().toISOString(),
              email: `${profile.username}@internal.school`
            });
          } else {
            // Session invalid, clear stored data
            localStorage.removeItem('school_profile');
            localStorage.removeItem('school_session_id');
          }
        } catch (error) {
          console.error('Error loading stored profile:', error);
          localStorage.removeItem('school_profile');
          localStorage.removeItem('school_session_id');
        }
      }
      setLoading(false);
    };
    
    initializeAuth();
  }, []);

  const signInWithUsername = async (username: string, password: string) => {
    try {
      setLoading(true);
      
      // Get user's user agent for security logging
      const userAgent = navigator.userAgent;
      
      // Use the secure password verification function with brute force protection
      const { data, error } = await supabase.rpc('verify_user_login_secure', {
        username_input: username,
        password_input: password,
        ip_address_input: null, // Frontend can't get real IP
        user_agent_input: userAgent
      });

      if (error) {
        setLoading(false);
        return { error: { message: error.message || 'Anmeldung fehlgeschlagen' } };
      }

      if (!data || data.length === 0) {
        setLoading(false);
        return { error: { message: 'Ungültiger Benutzername oder Passwort' } };
      }

      const userData = data[0];

      // Check for error message from brute force protection
      if ((userData as any).error_message) {
        setLoading(false);
        return { error: { message: (userData as any).error_message } };
      }

      if (!userData.user_id) {
        setLoading(false);
        return { error: { message: 'Ungültige Anmeldedaten' } };
      }

      // Create a dummy user for internal auth
      const dummyUser: User = {
        id: username,
        app_metadata: {},
        user_metadata: { username, full_name: userData.full_name },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        email: `${username}@internal.school`
      };

      let profileData = {
        id: userData.user_id,
        user_id: userData.user_id.toString(),
        username: username,
        name: userData.full_name,
        permission_lvl: userData.permission_level,
        password: 'encrypted',
        created_at: new Date().toISOString(),
        must_change_password: userData.must_change_password || false
      };

      // Create session for user
      const { data: sessionData, error: sessionError } = await supabase.rpc('create_user_session', {
        user_id_param: userData.user_id
      });

      if (sessionError) {
        console.error('Session creation error:', sessionError);
        setLoading(false);
        return { error: { message: 'Sitzung konnte nicht erstellt werden' } };
      }

      // Enrich profile with keycard info via edge function
      try {
        const { data: selfData } = await supabase.functions.invoke('admin-users', {
          body: {
            action: 'get_self',
            sessionId: sessionData
          }
        });
        if (selfData?.user) {
          profileData = {
            ...profileData,
            user_class: selfData.user.user_class ?? null,
            keycard_number: selfData.user.keycard_number ?? null,
            keycard_active: selfData.user.keycard_active ?? true,
          } as any;
        }
      } catch (e) {
        console.warn('Could not enrich profile with keycard info:', e);
      }

      // Set user and profile state
      setUser(dummyUser);
      setProfile(profileData);
      setSessionId(sessionData);
      
      // Store login data and session in localStorage for persistence
      localStorage.setItem('school_profile', JSON.stringify(profileData));
      localStorage.setItem('school_session_id', sessionData);
      localStorage.setItem('fresh_login', 'true');
      
      // Clear any stored last route from all sources to ensure fresh start
      localStorage.removeItem('eduard_last_route');
      document.cookie = 'eduard_last_route=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
       
       setLoading(false);
       return { 
         error: null, 
         mustChangePassword: userData.must_change_password || false 
       };
    } catch (error) {
      setLoading(false);
      return { error };
    }
  };

  const changePassword = async (oldPassword: string, newPassword: string, isForced: boolean = false) => {
    if (!user || !profile) return { error: { message: 'Nicht angemeldet' } };

    try {
      let data, error;
      
      if (isForced || profile.must_change_password) {
        // For forced password changes, don't require old password
        ({ data, error } = await supabase.rpc('change_user_password_forced_secure', {
          user_id_input: profile.id,
          new_password: newPassword
        }));
      } else {
        // Normal password change requires old password
        ({ data, error } = await supabase.rpc('change_user_password_secure', {
          user_id_input: profile.id,
          old_password: oldPassword,
          new_password: newPassword
        }));
      }

      if (error) {
        console.error('Password change error:', error);
        return { error: { message: 'Fehler beim Ändern des Passworts' } };
      }

      if ((data as any)?.success) {
        // Update local profile state
        setProfile({ ...profile, must_change_password: false });
        return { error: null };
      } else {
        return { error: { message: (data as any)?.error || 'Passwort konnte nicht geändert werden' } };
      }
    } catch (error) {
      console.error('Change password error:', error);
      return { error };
    }
  };

  const createUser = async (username: string, password: string, fullName: string, permissionLevel: number, keycardNumber?: string, keycardActive: boolean = true) => {
    if (!user || !profile) return { error: { message: 'Nicht angemeldet' } };

    // Check if creator has permission level 10 (Schulleitung)
    if (profile.permission_lvl < 10) {
      return { error: { message: 'Keine Berechtigung zum Erstellen von Benutzern' } };
    }

    try {
      const { data, error } = await supabase.rpc('create_school_user_secure', {
        username_input: username,
        password_input: password,
        full_name_input: fullName,
        permission_level_input: permissionLevel,
        creator_user_id: profile.id,
        keycard_number_input: keycardNumber || null,
        keycard_active_input: keycardActive
      });

      if (error) {
        console.error('Create user error:', error);
        return { error: { message: error.message } };
      }

      if ((data as any)?.success) {
        return { error: null };
      } else {
        return { error: { message: (data as any)?.error || 'Benutzer konnte nicht erstellt werden' } };
      }
    } catch (error) {
      console.error('Create user error:', error);
      return { error };
    }
  };

  const signOut = async () => {
    setUser(null);
    setSession(null);
    setProfile(null);
    setSessionId(null);
    // Clear stored login data
    localStorage.removeItem('school_profile');
    localStorage.removeItem('school_session_id');
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      loading,
      signInWithUsername,
      signOut,
      changePassword,
      createUser,
      sessionId
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};