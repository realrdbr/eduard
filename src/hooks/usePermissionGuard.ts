import { useEffect, useState } from 'react';
import { useEnhancedPermissions } from './useEnhancedPermissions';
import { useAuth } from './useAuth';

export interface PermissionGuardOptions {
  requiredPermission: string;
  fallbackValue?: boolean;
  showLoading?: boolean;
}

/**
 * Hook für komponentenbasierte Berechtigungskontrollen
 * Blockiert UI-Elemente basierend auf Benutzerberechtigungen
 */
export const usePermissionGuard = ({
  requiredPermission,
  fallbackValue = false,
  showLoading = true
}: PermissionGuardOptions) => {
  const { profile } = useAuth();
  const { hasPermission, isLoaded } = useEnhancedPermissions();
  const [isVisible, setIsVisible] = useState(fallbackValue);
  const [isLoading, setIsLoading] = useState(showLoading);

  useEffect(() => {
    if (!profile) {
      setIsVisible(false);
      setIsLoading(false);
      return;
    }

    if (isLoaded) {
      const hasAccess = hasPermission(requiredPermission);
      setIsVisible(hasAccess);
      setIsLoading(false);
    } else {
      setIsLoading(showLoading);
    }
  }, [profile, isLoaded, hasPermission, requiredPermission, showLoading]);

  return {
    isVisible,
    isLoading,
    hasAccess: isVisible,
    profile
  };
};

/**
 * Hook für Multi-Permission Checks
 * Prüft mehrere Berechtigungen gleichzeitig
 */
export const useMultiPermissionGuard = (permissions: string[], requireAll: boolean = false) => {
  const { hasPermission, isLoaded } = useEnhancedPermissions();
  const { profile } = useAuth();
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [hasAnyPermission, setHasAnyPermission] = useState(false);
  const [hasAllPermissions, setHasAllPermissions] = useState(false);

  useEffect(() => {
    if (!profile || !isLoaded) {
      setResults({});
      setHasAnyPermission(false);
      setHasAllPermissions(false);
      return;
    }

    const permissionResults: Record<string, boolean> = {};
    let anyPermission = false;
    let allPermissions = true;

    permissions.forEach(permission => {
      const hasAccess = hasPermission(permission);
      permissionResults[permission] = hasAccess;
      anyPermission = anyPermission || hasAccess;
      allPermissions = allPermissions && hasAccess;
    });

    setResults(permissionResults);
    setHasAnyPermission(anyPermission);
    setHasAllPermissions(allPermissions);
  }, [permissions, hasPermission, isLoaded, profile]);

  return {
    results,
    hasAnyPermission,
    hasAllPermissions,
    hasRequiredAccess: requireAll ? hasAllPermissions : hasAnyPermission,
    isLoaded
  };
};

/**
 * Hook für zeitbasierte Berechtigungen (zukünftige Erweiterung)
 */
export const useTimeBasedPermission = (
  permissionId: string, 
  validFrom?: Date, 
  validUntil?: Date
) => {
  const { hasPermission, isLoaded } = useEnhancedPermissions();
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;

    const now = new Date();
    const hasBasicPermission = hasPermission(permissionId);
    
    if (!hasBasicPermission) {
      setIsValid(false);
      return;
    }

    // Check time constraints
    const isAfterValidFrom = !validFrom || now >= validFrom;
    const isBeforeValidUntil = !validUntil || now <= validUntil;
    
    setIsValid(isAfterValidFrom && isBeforeValidUntil);
  }, [permissionId, hasPermission, isLoaded, validFrom, validUntil]);

  return {
    isValid,
    hasBasicPermission: hasPermission(permissionId),
    isLoaded
  };
};