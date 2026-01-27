import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';

export const useAdminRights = () => {
  const { profile } = useAuth();
  const [hasAdminRights, setHasAdminRights] = useState(false);
  const [isCheckingRights, setIsCheckingRights] = useState(false);

  // Simple level-based admin check: Level 10+ = Admin auf allen Geräten
  useEffect(() => {
    if (!profile) {
      setHasAdminRights(false);
      setIsCheckingRights(false);
      return;
    }
    
    const isAdmin = (profile.permission_lvl ?? 0) >= 10;
    setHasAdminRights(isAdmin);
    setIsCheckingRights(false);
  }, [profile]);

  // No-ops for backward compatibility
  const requestAdminRights = async (): Promise<boolean> => {
    return hasAdminRights;
  };

  const releaseAdminRights = async (): Promise<boolean> => {
    return hasAdminRights;
  };

  return {
    hasAdminRights,
    isCheckingRights,
    requestAdminRights,
    releaseAdminRights
  };
};