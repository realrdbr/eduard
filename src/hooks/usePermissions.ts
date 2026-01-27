import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';

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
  { id: 'view_schedule', name: 'Stundenplan einsehen', description: 'Eigenen Stundenplan anzeigen', requiresLevel: 1 },
  { id: 'view_announcements', name: 'Ankündigungen lesen', description: 'Schulankündigungen einsehen', requiresLevel: 1 },
  { id: 'view_vertretungsplan', name: 'Vertretungsplan einsehen', description: 'Vertretungen anzeigen', requiresLevel: 1 },
  { id: 'create_announcements', name: 'Ankündigungen erstellen', description: 'Neue Ankündigungen verfassen', requiresLevel: 4 },
  { id: 'edit_announcements', name: 'Ankündigungen bearbeiten', description: 'Bestehende Ankündigungen ändern', requiresLevel: 4 },
  { id: 'manage_substitutions', name: 'Vertretungen verwalten', description: 'Vertretungsplan bearbeiten', requiresLevel: 9 },
  { id: 'manage_schedules', name: 'Stundenpläne verwalten', description: 'Stundenpläne erstellen/bearbeiten', requiresLevel: 9 },
  { id: 'document_analysis', name: 'Dokumenten-Analyse', description: 'KI-Dokumentenanalyse verwenden', requiresLevel: 4 },
  { id: 'audio_announcements', name: 'Audio-Durchsagen', description: 'TTS-Durchsagen erstellen/verwalten', requiresLevel: 10 },
  { id: 'user_management', name: 'Benutzerverwaltung', description: 'Benutzer erstellen/bearbeiten/löschen', requiresLevel: 10 },
  { id: 'permission_management', name: 'Berechtigungen verwalten', description: 'Benutzerberechtigungen ändern', requiresLevel: 10 },
  { id: 'keycard_system', name: 'Keycard-System', description: 'Zugangskontrolle konfigurieren', requiresLevel: 10 },
  { id: 'system_settings', name: 'Systemeinstellungen', description: 'Arduino-Geräte und System verwalten', requiresLevel: 10 }
];

export const usePermissions = () => {
  const { profile } = useAuth();
  const [userPermissions, setUserPermissions] = useState<UserPermissions>({});
  const [levelPermissions, setLevelPermissions] = useState<LevelPermissions>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    loadPermissions();
  }, []);

  const loadPermissions = () => {
    const savedUserPermissions = localStorage.getItem('userPermissions');
    const savedLevelPermissions = localStorage.getItem('levelPermissions');

    if (savedUserPermissions) {
      setUserPermissions(JSON.parse(savedUserPermissions));
    }

    if (savedLevelPermissions) {
      setLevelPermissions(JSON.parse(savedLevelPermissions));
    } else {
      // Set default permissions for each level
      const defaultLevelPerms: LevelPermissions = {};
      for (let level = 1; level <= 10; level++) {
        defaultLevelPerms[level] = {};
        permissions.forEach(perm => {
          defaultLevelPerms[level][perm.id] = level >= perm.requiresLevel;
        });
      }
      setLevelPermissions(defaultLevelPerms);
    }
    
    setIsLoaded(true);
  };

  const hasPermission = (permissionId: string): boolean => {
    if (!profile || !isLoaded) return false;

    const userId = profile.id;
    const userLevel = profile.permission_lvl;

    // Check user-specific permission first
    const userSpecific = userPermissions[userId]?.[permissionId];
    if (userSpecific !== undefined) return userSpecific;

    // Fall back to level permission
    return levelPermissions[userLevel]?.[permissionId] || false;
  };

  const canAccess = (requiredPermission: string): boolean => {
    return hasPermission(requiredPermission);
  };

  const canManagePermissions = (): boolean => {
    return profile?.permission_lvl >= 10;
  };

  return {
    permissions,
    hasPermission,
    canAccess,
    canManagePermissions,
    userPermissions,
    levelPermissions,
    isLoaded
  };
};