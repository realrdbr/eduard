import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { Loader2, UserPlus, X } from 'lucide-react';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CreateUserModal = ({ isOpen, onClose }: CreateUserModalProps) => {
  const { createUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    fullName: '',
    permissionLevel: '1',
    keycardNumber: '',
    keycardActive: true
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username || !formData.password || !formData.fullName) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Bitte füllen Sie alle Felder aus."
      });
      return;
    }

    if (formData.password.length < 6) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Das Passwort muss mindestens 6 Zeichen lang sein."
      });
      return;
    }

    setIsLoading(true);
    const { error } = await createUser(
      formData.username,
      formData.password,
      formData.fullName,
      parseInt(formData.permissionLevel),
      formData.keycardNumber,
      formData.keycardActive
    );

    if (error) {
      toast({
        variant: "destructive",
        title: "Fehler beim Erstellen",
        description: error.message
      });
    } else {
      toast({
        title: "Benutzer erstellt",
        description: `Benutzer ${formData.username} wurde erfolgreich erstellt.`
      });
      setFormData({ username: '', password: '', fullName: '', permissionLevel: '1', keycardNumber: '', keycardActive: true });
      onClose();
    }
    setIsLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              <CardTitle>Neuen Benutzer erstellen</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Erstellen Sie einen neuen Benutzer für das Schulsystem.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Benutzername</Label>
              <Input
                id="username"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                placeholder="max.mustermann"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="fullName">Vollständiger Name</Label>
              <Input
                id="fullName"
                name="fullName"
                value={formData.fullName}
                onChange={handleInputChange}
                placeholder="Max Mustermann"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="permissionLevel">Berechtigung</Label>
              <Select value={formData.permissionLevel} onValueChange={(value) => setFormData({...formData, permissionLevel: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Berechtigung wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Level 1 - Besucher</SelectItem>
                  <SelectItem value="2">Level 2 - Schüler</SelectItem>
                  <SelectItem value="3">Level 3 - Schüler</SelectItem>
                  <SelectItem value="4">Level 4 - Schüler</SelectItem>
                  <SelectItem value="5">Level 5 - Lehrer</SelectItem>
                  <SelectItem value="6">Level 6 - Bibliothek/in</SelectItem>
                  <SelectItem value="7">Level 7 - Lehrer</SelectItem>
                  <SelectItem value="8">Level 8 - Verwaltung</SelectItem>
                  <SelectItem value="9">Level 9 - Verwaltung</SelectItem>
                  <SelectItem value="10">Schulleitung</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="keycardNumber">Keycard-Nummer (optional)</Label>
              <Input
                id="keycardNumber"
                name="keycardNumber"
                value={formData.keycardNumber}
                onChange={handleInputChange}
                placeholder="z.B. 12345"
              />
              <p className="text-xs text-muted-foreground">
                Die Keycard wird für die Bibliothek und andere Services benötigt.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Temporäres Passwort</Label>
              <Input
                id="password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Mindestens 6 Zeichen"
                required
              />
              <p className="text-xs text-muted-foreground">
                Der Benutzer muss das Passwort bei der ersten Anmeldung ändern.
              </p>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Abbrechen
              </Button>
              <Button type="submit" disabled={isLoading} className="flex-1">
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Erstellen
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateUserModal;