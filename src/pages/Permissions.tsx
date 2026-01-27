import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import PermissionManager from '@/components/PermissionManager';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';
import { toast } from '@/hooks/use-toast';
import { useEnhancedPermissions } from '@/hooks/useEnhancedPermissions';

const Permissions = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { hasPermission, isLoaded } = useEnhancedPermissions();
useEffect(() => {
    if (!isLoaded) return;
    if (!hasPermission('permission_management')) {
      toast({
        variant: "destructive",
        title: "Zugriff verweigert",
        description: "Sie haben keine Berechtigung für diese Seite."
      });
      navigate('/', { replace: true });
    }
  }, [isLoaded, hasPermission, navigate]);

  if (!isLoaded) {
    return null;
  }
  if (!hasPermission('permission_management')) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zurück zum Dashboard
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Berechtigungen</h1>
              <p className="text-muted-foreground">Benutzerberechtigungen verwalten</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <PermissionManager />
      </main>
    </div>
  );
};

export default Permissions;