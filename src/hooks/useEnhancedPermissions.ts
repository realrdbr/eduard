import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useSessionRequest } from '@/hooks/useSessionRequest';

export interface Permission {
  id: string;
  name: string;
  description: string;
  requiresLevel: number;
}

export interface UserPermissions {
  [userId: number]: {
    [permissionId: string]: boolean;
  };
}

export interface LevelPermissions {
  [level: number]: {
    [permissionId: string]: boolean;
  };
}

const permissions: Permission[] = [
  { id: 'view_chat', name: 'KI-Chat verwenden', description: 'Zugriff auf den KI-Assistenten', requiresLevel: 1 },
  { id: 'private_messages', name: 'Private Nachrichten', description: 'Zugriff auf private Nachrichten', requiresLevel: 1 },
  { id: 'view_schedule', name: 'Stundenplan einsehen', description: 'Eigenen Stundenplan anzeigen', requiresLevel: 1 },
  { id: 'view_announcements', name: 'Ankündigungen lesen', description: 'Schulankündigungen einsehen', requiresLevel: 1 },
  { id: 'view_vertretungsplan', name: 'Vertretungsplan einsehen', description: 'Vertretungen anzeigen', requiresLevel: 1 },
  { id: 'theme_settings', name: 'Theme-Einstellungen', description: 'Farben & Design anpassen', requiresLevel: 1 },
  { id: 'create_announcements', name: 'Ankündigungen erstellen', description: 'Neue Ankündigungen verfassen', requiresLevel: 4 },
  { id: 'edit_announcements', name: 'Ankündigungen bearbeiten', description: 'Bestehende Ankündigungen ändern', requiresLevel: 4 },
  // BERT Display System - Raumbuchung für Lehrkräfte
  { id: 'room_booking', name: 'Raumbelegung & Buchung', description: 'Räume einsehen und spontan buchen', requiresLevel: 5 },
  { id: 'manage_substitutions', name: 'Vertretungen verwalten', description: 'Vertretungsplan bearbeiten', requiresLevel: 9 },
  { id: 'manage_schedules', name: 'Stundenpläne verwalten', description: 'Stundenpläne erstellen/bearbeiten', requiresLevel: 9 },
  { id: 'document_analysis', name: 'Dokumenten-Analyse', description: 'KI-Dokumentenanalyse verwenden', requiresLevel: 4 },
  // Bibliothek – Basiszugriff für alle eingeloggten Nutzer, Verwaltung ab Level 6
  { id: 'library_view', name: 'Bibliothek anzeigen', description: 'Bibliotheksseite nutzen', requiresLevel: 1 },
  { id: 'library_manage_books', name: 'Bücher verwalten', description: 'Bücherbestand verwalten', requiresLevel: 6 },
  { id: 'library_manage_loans', name: 'Ausleihen verwalten', description: 'Ausleihen und Rückgaben verwalten', requiresLevel: 6 },
  { id: 'library_view_all_users', name: 'Alle Bibliotheksnutzer sehen', description: 'Nutzer und Ausleihen einsehen', requiresLevel: 6 },
  // BERT Display System - Verwaltung für Admins
  { id: 'display_management', name: 'Display-Verwaltung', description: 'BERT E-Paper Displays verwalten', requiresLevel: 8 },
  { id: 'audio_announcements', name: 'Audio-Durchsagen', description: 'TTS-Durchsagen erstellen/verwalten', requiresLevel: 10 },
  { id: 'user_management', name: 'Benutzerverwaltung', description: 'Benutzer erstellen/bearbeiten/löschen', requiresLevel: 10 },
  { id: 'permission_management', name: 'Berechtigungen verwalten', description: 'Benutzerberechtigungen ändern', requiresLevel: 10 },
  { id: 'keycard_system', name: 'Keycard-System', description: 'Zugangskontrolle konfigurieren', requiresLevel: 10 },
  { id: 'system_settings', name: 'Systemeinstellungen', description: 'Arduino-Geräte und System verwalten', requiresLevel: 10 }
];

export const useEnhancedPermissions = () => {
  const { profile, sessionId } = useAuth();
  const { withSession } = useSessionRequest();
  const [userPermissions, setUserPermissions] = useState<UserPermissions>({});
  const [levelPermissions, setLevelPermissions] = useState<LevelPermissions>({});
  const [isLoaded, setIsLoaded] = useState(false);

  // Load permissions from Supabase
  const loadPermissions = useCallback(async () => {
    if (!profile?.id) {
      setIsLoaded(true);
      return;
    }

    try {
      // Load permissions via Edge Function to avoid REST + RLS session issues
      const effectiveSessionId = sessionId || localStorage.getItem('school_session_id');
      const { data: permData, error: permError } = await supabase.functions.invoke('permission-manager', {
        body: {
          action: 'get_permissions',
          sessionId: effectiveSessionId
        }
      });

      if (permError || !permData?.success) {
        console.error('Error loading permissions via function:', permError || permData?.error);
      }

      const userPerms = permData?.user_permissions as any[] | null;
      const levelPerms = permData?.level_permissions as any[] | null;


      // Process user permissions
      const processedUserPerms: UserPermissions = {};
      if (userPerms) {
        userPerms.forEach(perm => {
          if (!processedUserPerms[perm.user_id]) {
            processedUserPerms[perm.user_id] = {};
          }
          processedUserPerms[perm.user_id][perm.permission_id] = perm.allowed;
        });
      }

      // Process level permissions
      const processedLevelPerms: LevelPermissions = {};
      if (levelPerms) {
        levelPerms.forEach(perm => {
          if (!processedLevelPerms[perm.level]) {
            processedLevelPerms[perm.level] = {};
          }
          processedLevelPerms[perm.level][perm.permission_id] = perm.allowed;
        });
      }

      setUserPermissions(processedUserPerms);
      setLevelPermissions(processedLevelPerms);
    } catch (error) {
      console.error('Error loading permissions:', error);
    } finally {
      setIsLoaded(true);
    }
  }, [profile?.id]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  // Check if user has a specific permission
  const hasPermission = useCallback((permissionId: string): boolean => {
    if (!profile || !isLoaded) return false;

    const userId = profile.id;
    const userLevel = profile.permission_lvl;

    // Check user-specific permission first (highest priority)
    const userSpecific = userPermissions[userId]?.[permissionId];
    if (userSpecific !== undefined) return userSpecific;

    // Fall back to level permission
    const levelPerm = levelPermissions[userLevel]?.[permissionId];
    if (levelPerm !== undefined) return levelPerm;

    // Fallback to basic level-based check if no database entry exists
    const permission = permissions.find(p => p.id === permissionId);
    return permission ? userLevel >= permission.requiresLevel : false;
  }, [profile, userPermissions, levelPermissions, isLoaded]);

  // Check if user can access a specific feature
  const canAccess = useCallback((requiredPermission: string): boolean => {
    return hasPermission(requiredPermission);
  }, [hasPermission]);

  // Check if user can manage permissions
  const canManagePermissions = useCallback((): boolean => {
    return profile?.permission_lvl >= 10;
  }, [profile?.permission_lvl]);

  // Save user permission to database
  const setUserPermission = useCallback(async (userId: number, permissionId: string, allowed: boolean) => {
    if (!canManagePermissions()) return false;
    if (!profile?.id) return false;

    try {
      const effectiveSessionId = sessionId || localStorage.getItem('school_session_id');
      if (!effectiveSessionId) {
        console.error('No session ID found');
        return false;
      }

      const { data, error } = await supabase.functions.invoke('permission-manager', {
        body: {
          action: 'set_user_permission',
          sessionId: effectiveSessionId,
          userId,
          permissionId,
          allowed
        }
      });

      if (error || !data?.success) {
        console.error('Error setting user permission:', error || data?.error);
        return false;
      }

      setUserPermissions(prev => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          [permissionId]: allowed
        }
      }));
      return true;
    } catch (error) {
      console.error('Error setting user permission:', error);
      return false;
    }
  }, [canManagePermissions, profile]);

  // Save level permission to database
  const setLevelPermission = useCallback(async (level: number, permissionId: string, allowed: boolean) => {
    if (!canManagePermissions()) return false;
    if (!profile?.id) return false;

    try {
      const effectiveSessionId = sessionId || localStorage.getItem('school_session_id');
      if (!effectiveSessionId) {
        console.error('No session ID found');
        return false;
      }

      const { data, error } = await supabase.functions.invoke('permission-manager', {
        body: {
          action: 'set_level_permission',
          sessionId: effectiveSessionId,
          level,
          permissionId,
          allowed
        }
      });

      if (error || !data?.success) {
        console.error('Error setting level permission:', error || data?.error);
        return false;
      }

      setLevelPermissions(prev => ({
        ...prev,
        [level]: {
          ...prev[level],
          [permissionId]: allowed
        }
      }));
      return true;
    } catch (error) {
      console.error('Error setting level permission:', error);
      return false;
    }
  }, [canManagePermissions, profile]);

  return {
    permissions,
    hasPermission,
    canAccess,
    canManagePermissions,
    userPermissions,
    levelPermissions,
    isLoaded,
    setUserPermission,
    setLevelPermission,
    reloadPermissions: loadPermissions
  };
};