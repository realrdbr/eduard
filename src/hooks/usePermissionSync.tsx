import { useEffect } from 'react';
import { useAuth } from './useAuth';
import { useEnhancedPermissions } from './useEnhancedPermissions';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';

/**
 * Hook für Realtime-Synchronisation von Berechtigungsänderungen
 * Überwacht Änderungen in permissions, user_permissions und level_permissions Tabellen
 */
export const usePermissionSync = () => {
  const { profile, signOut } = useAuth();
  const { hasPermission, reloadPermissions } = useEnhancedPermissions();
  const navigate = useNavigate();
  const location = useLocation();

  // Route-to-permission mapping
  const routePermissions: Record<string, string> = {
    '/stundenplan': 'view_schedule',
    '/announcements': 'view_announcements',
    '/audio-announcements': 'audio_announcements',
    '/document-analysis': 'document_analysis',
    '/user-management': 'user_management',
    '/vertretungsplan': 'view_vertretungsplan',
    '/ai-chat': 'view_chat',
    '/klassenverwaltung': 'manage_schedules',
    '/keycard': 'keycard_system',
    '/settings': 'system_settings',
    '/permissions': 'permission_management',
    '/theme-settings': 'theme_settings',
    '/tts': 'audio_announcements'
  };

  // Check if current route access is lost
  const checkCurrentRouteAccess = async () => {
    const currentRoute = location.pathname;
    const requiredPermission = routePermissions[currentRoute];
    
    if (requiredPermission && profile) {
      // Reload permissions to get latest data
      await reloadPermissions();

      // Server-side permission check to avoid stale client state
      try {
        const { data, error } = await supabase.rpc('check_user_permission', {
          user_id_param: profile.id as any,
          permission_id_param: requiredPermission
        });

        if (error) {
          console.warn('RPC check_user_permission error:', error);
        }

        const allowed = data === true;
        if (!allowed) {
          toast({
            title: "Zugriff verweigert",
            description: "Ihre Berechtigung für diese Seite wurde entfernt.",
            variant: "destructive"
          });
          setTimeout(() => navigate('/', { replace: true }), 300);
        }
      } catch (e) {
        console.warn('RPC check failed, falling back to client state:', e);
        if (!hasPermission(requiredPermission)) {
          toast({
            title: "Zugriff verweigert",
            description: "Ihre Berechtigung für diese Seite wurde entfernt.",
            variant: "destructive"
          });
          setTimeout(() => navigate('/', { replace: true }), 300);
        }
      }
    }
  };

  useEffect(() => {
    if (!profile) return;

    // Subscribe to changes in permissions table (level changes, class changes)
    const permissionsChannel = supabase
      .channel('permission-sync')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'permissions',
          filter: `id=eq.${profile.id}`
        },
        async (payload) => {
          console.log('Permission level/class change detected:', payload);
          
          const newPermissionLevel = payload.new?.permission_lvl;
          const oldPermissionLevel = payload.old?.permission_lvl;
          
          // Check if permission level changed
          if (newPermissionLevel !== oldPermissionLevel) {
            // If user lost admin rights (Level 10)
            if (oldPermissionLevel >= 10 && newPermissionLevel < 10) {
              toast({
                title: "Berechtigung geändert",
                description: "Ihre Admin-Rechte wurden entfernt.",
                variant: "destructive"
              });
            }
            // If user gained admin rights
            else if (oldPermissionLevel < 10 && newPermissionLevel >= 10) {
              toast({
                title: "Berechtigung erweitert",
                description: "Sie haben jetzt Admin-Rechte erhalten.",
              });
            }
            // Other permission level changes
            else {
              toast({
                title: "Berechtigung geändert",
                description: `Ihr Berechtigungslevel wurde auf ${newPermissionLevel} geändert.`,
              });
            }
            
            // Check current route access after level change
            await checkCurrentRouteAccess();
          }
          
          // Check if class assignment changed
          if (payload.new?.user_class !== payload.old?.user_class) {
            const newClass = payload.new?.user_class;
            
            toast({
              title: "Klasse geändert",
              description: newClass 
                ? `Sie wurden der Klasse ${newClass} zugewiesen.`
                : "Ihre Klassenzuweisung wurde entfernt."
            });
          }
        }
      )
      .subscribe();

    // Subscribe to changes in user_permissions table (individual permission grants/revokes)
    const userPermissionsChannel = supabase
      .channel('user-permission-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_permissions',
          filter: `user_id=eq.${profile.id}`
        },
        async (payload) => {
          console.log('User permission change detected:', payload);
          
          const permissionId = (payload.new as any)?.permission_id || (payload.old as any)?.permission_id;
          const isAllowed = (payload.new as any)?.allowed;
          
          if (payload.eventType === 'DELETE') {
            toast({
              title: "Berechtigung entfernt",
              description: `Spezielle Berechtigung für ${permissionId} wurde entfernt.`,
            });
          } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            toast({
              title: isAllowed ? "Berechtigung erteilt" : "Berechtigung entzogen",
              description: `Berechtigung für ${permissionId} wurde ${isAllowed ? 'erteilt' : 'entzogen'}.`,
              variant: isAllowed ? "default" : "destructive"
            });
          }
          
          // Check current route access after permission change
          await checkCurrentRouteAccess();
        }
      )
      .subscribe();

    // Subscribe to changes in level_permissions table (default permissions for levels)
    const levelPermissionsChannel = supabase
      .channel('level-permission-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'level_permissions',
          filter: `level=eq.${profile.permission_lvl}`
        },
        async (payload) => {
          console.log('Level permission change detected:', payload);
          
          const permissionId = (payload.new as any)?.permission_id || (payload.old as any)?.permission_id;
          const isAllowed = (payload.new as any)?.allowed;
          
          if (payload.eventType === 'DELETE') {
            toast({
              title: "Standard-Berechtigung entfernt",
              description: `Standard-Berechtigung für ${permissionId} wurde von Level ${profile.permission_lvl} entfernt.`,
            });
          } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            toast({
              title: isAllowed ? "Standard-Berechtigung erteilt" : "Standard-Berechtigung entzogen",
              description: `Standard-Berechtigung für ${permissionId} wurde für Level ${profile.permission_lvl} ${isAllowed ? 'erteilt' : 'entzogen'}.`,
              variant: isAllowed ? "default" : "destructive"
            });
          }
          
          // Check current route access after level permission change
          await checkCurrentRouteAccess();
        }
      )
      .subscribe();

    // Cleanup subscriptions on unmount
    return () => {
      supabase.removeChannel(permissionsChannel);
      supabase.removeChannel(userPermissionsChannel);
      supabase.removeChannel(levelPermissionsChannel);
    };
  }, [profile, hasPermission, reloadPermissions, navigate, location.pathname]);

  // Also listen to changes for all users to refresh user lists in admin interfaces
  useEffect(() => {
    if (!profile || profile.permission_lvl < 10) return;

    const allUsersChannel = supabase
      .channel('all-users-sync')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'permissions'
        },
        (payload) => {
          console.log('User data changed:', payload);
          
          // Trigger custom event that components can listen to
          window.dispatchEvent(new CustomEvent('userDataChanged', { 
            detail: { payload } 
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(allUsersChannel);
    };
  }, [profile]);
};

/**
 * Hook für Komponenten die auf Benutzerdatenänderungen reagieren sollen
 */
export const useUserDataSync = (callback: () => void) => {
  useEffect(() => {
    const handleUserDataChange = () => {
      callback();
    };

    window.addEventListener('userDataChanged', handleUserDataChange);
    
    return () => {
      window.removeEventListener('userDataChanged', handleUserDataChange);
    };
  }, [callback]);
};
