import React from 'react';
import { usePermissionGuard } from '@/hooks/usePermissionGuard';
import { Loader2, ShieldX } from 'lucide-react';

interface PermissionAwareComponentProps {
  children: React.ReactNode;
  requiredPermission: string;
  fallback?: React.ReactNode;
  showLoadingSpinner?: boolean;
  showAccessDenied?: boolean;
  className?: string;
}

/**
 * Wrapper-Komponente für berechtigungsbasierte UI-Elemente
 * Zeigt Inhalte nur an, wenn der Benutzer die erforderliche Berechtigung hat
 */
const PermissionAwareComponent: React.FC<PermissionAwareComponentProps> = ({
  children,
  requiredPermission,
  fallback = null,
  showLoadingSpinner = false,
  showAccessDenied = false,
  className = ""
}) => {
  const { isVisible, isLoading } = usePermissionGuard({ 
    requiredPermission,
    showLoading: showLoadingSpinner 
  });

  if (isLoading && showLoadingSpinner) {
    return (
      <div className={`flex items-center justify-center p-4 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (!isVisible) {
    if (showAccessDenied) {
      return (
        <div className={`flex items-center gap-2 p-4 text-muted-foreground ${className}`}>
          <ShieldX className="h-4 w-4" />
          <span className="text-sm">Zugriff verweigert</span>
        </div>
      );
    }
    return fallback ? <div className={className}>{fallback}</div> : null;
  }

  return <div className={className}>{children}</div>;
};

export default PermissionAwareComponent;