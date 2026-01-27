import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { Loader2, School, Eye, EyeOff } from 'lucide-react';
import ChangePasswordModal from '@/components/ChangePasswordModal';

const Auth = () => {
  const navigate = useNavigate();
  const { signInWithUsername, user, loading, profile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });

  useEffect(() => {
    if (user && !loading) {
      // Check if user must change password
      if (profile?.must_change_password) {
        setShowChangePassword(true);
      } else {
        // Clear any stored route before redirecting to home
        localStorage.removeItem('eduard_last_route');
        navigate('/', { replace: true });
      }
    }
  }, [user, loading, profile, navigate]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username || !formData.password) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Bitte füllen Sie alle Felder aus."
      });
      return;
    }

    setIsLoading(true);
    const { error, mustChangePassword } = await signInWithUsername(formData.username, formData.password);
    
    if (error) {
      toast({
        variant: "destructive",
        title: "Anmeldung fehlgeschlagen",
        description: error.message
      });
    } else {
      if (mustChangePassword) {
        setShowChangePassword(true);
        toast({
          title: "Passwort ändern erforderlich",
          description: "Sie müssen Ihr Passwort bei der ersten Anmeldung ändern."
        });
      } else {
        toast({
          title: "Erfolgreich angemeldet",
          description: "Willkommen zurück!"
        });
        // Clear any stored route before redirecting to home
        localStorage.removeItem('eduard_last_route');
        navigate('/', { replace: true });
      }
    }
    setIsLoading(false);
  };

  const handlePasswordChanged = () => {
    setShowChangePassword(false);
    // Clear any stored route before redirecting to home
    localStorage.removeItem('eduard_last_route');
    navigate('/', { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-secondary/5 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-primary rounded-full flex items-center justify-center">
              <School className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold">E.D.U.A.R.D.</CardTitle>
            <CardDescription>
              Education, Data, Utility & Automation for Resource Distribution
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Benutzername</Label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="max.mustermann"
                  value={formData.username}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Passwort</Label>
                <div className="flex items-center">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                    autoComplete="current-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
                    onClick={() => setShowPassword((v) => !v)}
                    className="ml-2"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
              <Button 
                type="submit" 
                className="w-full"
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Anmelden
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <ChangePasswordModal 
        isOpen={showChangePassword} 
        onClose={handlePasswordChanged}
        isFirstLogin={true}
      />
    </>
  );
};

export default Auth;