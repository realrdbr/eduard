import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEnhancedPermissions } from '@/hooks/useEnhancedPermissions';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission: string;
  fallbackPath?: string;
  showToast?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermission,
  fallbackPath = '/',
  showToast = true
}) => {
  const navigate = useNavigate();
  const { profile, loading } = useAuth();
  const { hasPermission, isLoaded } = useEnhancedPermissions();
  const allowed = hasPermission(requiredPermission) || (requiredPermission === 'library_view' && (profile?.permission_lvl ?? 0) >= 10);

  useEffect(() => {
    if (!profile && !loading) {
      navigate('/auth');
      return;
    }

    if (isLoaded && !allowed) {
      if (showToast) {
        // Enhanced error message for level 10 users trying to access library
        const isLibraryAccess = requiredPermission === 'library_view' && profile?.permission_lvl >= 10;
        toast({
          variant: "destructive",
          title: "Zugriff verweigert",
          description: isLibraryAccess 
            ? `Sie haben Level ${profile?.permission_lvl} Berechtigung. Bibliothekszugriff ist verfügbar.`
            : "Sie haben keine Berechtigung für diese Seite."
        });
      }
      navigate(fallbackPath);
    }
  }, [profile, loading, isLoaded, hasPermission, requiredPermission, navigate, fallbackPath, showToast]);

  // Show loading while checking permissions
  if (loading || !profile || !isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Show nothing if access denied (navigation will handle redirect)
  if (!allowed) {
    return null;
  }

  return <>{children}</>;
};

export default ProtectedRoute;