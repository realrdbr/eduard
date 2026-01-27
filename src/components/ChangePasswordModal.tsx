import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { Loader2, Lock } from 'lucide-react';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  isFirstLogin?: boolean;
}

const ChangePasswordModal = ({ isOpen, onClose, isFirstLogin = false }: ChangePasswordModalProps) => {
  const { changePassword } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.newPassword || !formData.confirmPassword) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Bitte füllen Sie alle Felder aus."
      });
      return;
    }


    if (formData.newPassword !== formData.confirmPassword) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Die Passwörter stimmen nicht überein."
      });
      return;
    }

    if (formData.newPassword.length < 6) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Das Passwort muss mindestens 6 Zeichen lang sein."
      });
      return;
    }

    setIsLoading(true);
    const { error } = await changePassword(
      '', 
      formData.newPassword,
      true // Force password change, no old password required
    );

    if (error) {
      toast({
        variant: "destructive",
        title: "Fehler beim Ändern",
        description: error.message
      });
    } else {
      toast({
        title: "Passwort geändert",
        description: "Ihr Passwort wurde erfolgreich geändert."
      });
      setFormData({ oldPassword: '', newPassword: '', confirmPassword: '' });
      onClose();
    }
    setIsLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            <CardTitle>Passwort ändern</CardTitle>
          </div>
          <CardDescription>
            Bitte geben Sie Ihr neues Passwort ein.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            
            <div className="space-y-2">
              <Label htmlFor="newPassword">Neues Passwort</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                value={formData.newPassword}
                onChange={handleInputChange}
                placeholder="Mindestens 6 Zeichen"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Neues Passwort bestätigen</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Abbrechen
              </Button>
              <Button type="submit" disabled={isLoading} className="flex-1">
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Ändern
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChangePasswordModal;