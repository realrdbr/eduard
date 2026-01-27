import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ArrowLeft, KeyRound, Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface KeycardData {
  id: string;
  cardNumber: string;
  owner: string;
  accessLevel: string;
  isActive: boolean;
  lastUsed?: string;
  permissionLevel: number;
}

const Keycard = () => {
  const navigate = useNavigate();
  const { user, profile, sessionId } = useAuth();
  const [keycards, setKeycards] = useState<KeycardData[]>([]);
  const [showCreateKeycard, setShowCreateKeycard] = useState(false);
  const [showEditKeycard, setShowEditKeycard] = useState(false);
  const [selectedKeycard, setSelectedKeycard] = useState<KeycardData | null>(null);
  const [newKeycard, setNewKeycard] = useState({ cardNumber: '', owner: '', accessLevel: 'Schüler' });

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    if (profile && profile.permission_lvl < 10) {
      toast({
        variant: "destructive",
        title: "Zugriff verweigert",
        description: "Nur die Schulleitung kann Keycards verwalten."
      });
      navigate('/');
      return;
    }
    
    fetchKeycards();
  }, [user, profile, navigate]);

  const fetchKeycards = async () => {
    if (!sessionId) {
      console.error('No sessionId available');
      return;
    }
    
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'list_keycards',
          sessionId: sessionId
        }
      });

      if (error) throw error;
      
      if (!data?.success) {
        throw new Error(data?.error || 'Fehler beim Laden der Keycards');
      }

      const keycardData = (data.keycards || []).map((perm: any) => ({
        id: perm.id.toString(),
        cardNumber: perm.keycard_number || '',
        owner: perm.name,
        accessLevel: getAccessLevelText(perm.permission_lvl),
        isActive: perm.keycard_active !== false,
        permissionLevel: perm.permission_lvl
      }));

      setKeycards(keycardData);
    } catch (error) {
      console.error('Error fetching keycards:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error instanceof Error ? error.message : "Keycards konnten nicht geladen werden."
      });
    }
  };

  const getAccessLevelText = (level: number) => {
    if (level >= 10) return 'Schulleitung - Vollzugriff';
    if (level >= 8) return 'Verwaltung - Erweitert';
    if (level >= 5) return 'Lehrer - Standard';
    if (level > 1) return 'Schüler - Eingeschränkt';
    return 'Besucher - Gänge';
  };

  const getPermissionLevel = (accessLevel: string) => {
    switch (accessLevel) {
      case 'Schulleitung': return 10;
      case 'Verwaltung': return 8;
      case 'Lehrer': return 5;
      default: return 2;
    }
  };

  const canManageKeycards = profile?.permission_lvl && profile.permission_lvl >= 10;

  const handleCreateKeycard = async () => {
    if (!newKeycard.cardNumber || !newKeycard.owner) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Bitte füllen Sie alle Felder aus."
      });
      return;
    }

    try {
      const permissionLevel = getPermissionLevel(newKeycard.accessLevel);
      
      // Generate secure random password
      const randomPassword = Math.random().toString(36).slice(-12) + 
                            Math.random().toString(36).slice(-8).toUpperCase() + 
                            Math.floor(Math.random() * 100);
      
      const { data, error } = await supabase.rpc('create_school_user_secure', {
        username_input: `keycard_${newKeycard.cardNumber}`,
        password_input: randomPassword,
        full_name_input: newKeycard.owner,
        permission_level_input: permissionLevel,
        creator_user_id: profile?.id,
        keycard_number_input: newKeycard.cardNumber,
        keycard_active_input: true
      });

      if (error || (data && typeof data === 'object' && data !== null && 'success' in data && !(data as any).success)) {
        throw new Error((data as any)?.error || error?.message || 'Keycard konnte nicht erstellt werden');
      }

      await fetchKeycards();
      setNewKeycard({ cardNumber: '', owner: '', accessLevel: 'Schüler' });
      setShowCreateKeycard(false);
      
      toast({
        title: "Keycard erstellt",
        description: `Keycard für ${newKeycard.owner} wurde erfolgreich registriert.`
      });
    } catch (error) {
      console.error('Error creating keycard:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error instanceof Error ? error.message : "Keycard konnte nicht erstellt werden."
      });
    }
  };

  const handleEditKeycard = async () => {
    if (!selectedKeycard || !selectedKeycard.cardNumber || !selectedKeycard.owner) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Bitte füllen Sie alle Felder aus."
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'update_user',
          sessionId: sessionId,
          targetUserId: parseInt(selectedKeycard.id),
          updates: {
            keycard_number: selectedKeycard.cardNumber,
            keycard_active: selectedKeycard.isActive
          }
        }
      });

      if (error || (data && typeof data === 'object' && data !== null && 'success' in data && !(data as any).success)) {
        throw new Error((data as any)?.error || error?.message || 'Keycard konnte nicht aktualisiert werden');
      }

      await fetchKeycards();
      setSelectedKeycard(null);
      setShowEditKeycard(false);
      
      toast({
        title: "Keycard aktualisiert",
        description: `Keycard für ${selectedKeycard.owner} wurde erfolgreich aktualisiert.`
      });
    } catch (error) {
      console.error('Error editing keycard:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error instanceof Error ? error.message : "Keycard konnte nicht aktualisiert werden."
      });
    }
  };

  const handleDeleteKeycard = async (id: string) => {
    if (!confirm('Keycard wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'update_user',
          sessionId: sessionId,
          targetUserId: parseInt(id),
          updates: {
            keycard_number: null,
            keycard_active: false
          }
        }
      });

      if (error || (data && typeof data === 'object' && data !== null && 'success' in data && !(data as any).success)) {
        throw new Error((data as any)?.error || error?.message || 'Keycard konnte nicht gelöscht werden');
      }

      await fetchKeycards();
      toast({
        title: "Keycard gelöscht",
        description: "Die Keycard wurde erfolgreich entfernt."
      });
    } catch (error) {
      console.error('Error deleting keycard:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error instanceof Error ? error.message : "Keycard konnte nicht gelöscht werden."
      });
    }
  };

  const toggleKeycard = async (id: string) => {
    const card = keycards.find(c => c.id === id);
    if (!card) return;

    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'update_user',
          sessionId: sessionId,
          targetUserId: parseInt(id),
          updates: {
            keycard_active: !card.isActive
          }
        }
      });

      if (error || (data && typeof data === 'object' && data !== null && 'success' in data && !(data as any).success)) {
        throw new Error((data as any)?.error || error?.message || 'Keycard-Status konnte nicht geändert werden');
      }

      await fetchKeycards();
      toast({
        title: card.isActive ? "Keycard deaktiviert" : "Keycard aktiviert",
        description: `Die Keycard wurde ${card.isActive ? 'deaktiviert' : 'aktiviert'}.`
      });
    } catch (error) {
      console.error('Error toggling keycard:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error instanceof Error ? error.message : "Keycard-Status konnte nicht geändert werden."
      });
    }
  };

  const getStatusBadge = (isActive: boolean) => {
    return isActive ? "default" : "secondary";
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück zum Dashboard
              </Button>
              <div className="flex items-center gap-3">
                <KeyRound className="h-6 w-6 text-primary" />
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Keycard-System</h1>
                  <p className="text-muted-foreground">
                    {canManageKeycards ? "Zugangskarten verwalten" : "Keycard-Übersicht"}
                  </p>
                </div>
              </div>
            </div>
            {canManageKeycards && (
              <Dialog open={showCreateKeycard} onOpenChange={setShowCreateKeycard}>
                <DialogTrigger asChild>
                  <Button className="hidden sm:flex">
                    <Plus className="h-4 w-4 mr-2" />
                    Keycard registrieren
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Neue Keycard registrieren</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="cardNumber">Keycard-Nummer</Label>
                      <Input
                        id="cardNumber"
                        value={newKeycard.cardNumber}
                        onChange={(e) => setNewKeycard({...newKeycard, cardNumber: e.target.value})}
                        placeholder="z.B. 1234567890"
                      />
                    </div>
                    <div>
                      <Label htmlFor="owner">Besitzer</Label>
                      <Input
                        id="owner"
                        value={newKeycard.owner}
                        onChange={(e) => setNewKeycard({...newKeycard, owner: e.target.value})}
                        placeholder="z.B. Max Mustermann"
                      />
                    </div>
                    <div>
                      <Label htmlFor="accessLevel">Zugriffsebene</Label>
                      <select
                        id="accessLevel"
                        value={newKeycard.accessLevel}
                        onChange={(e) => setNewKeycard({...newKeycard, accessLevel: e.target.value})}
                        className="w-full p-2 border border-border rounded-md"
                      >
                        <option value="Schüler">Schüler</option>
                        <option value="Lehrer">Lehrer</option>
                        <option value="Verwaltung">Verwaltung</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleCreateKeycard}>Registrieren</Button>
                      <Button variant="outline" onClick={() => setShowCreateKeycard(false)}>
                        Abbrechen
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            {canManageKeycards && (
              <Button onClick={() => setShowCreateKeycard(true)} className="sm:hidden" size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* Keycards List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {keycards.map((keycard) => (
              <Card key={keycard.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <KeyRound className="h-5 w-5" />
                      {keycard.owner}
                    </CardTitle>
                    <Badge variant={getStatusBadge(keycard.isActive)}>
                      {keycard.isActive ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Kartennummer</p>
                    <p className="font-mono">{keycard.cardNumber}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-muted-foreground">Zugriffsebene</p>
                    <p className="font-medium">{keycard.accessLevel}</p>
                  </div>

                  {keycard.lastUsed && (
                    <div>
                      <p className="text-sm text-muted-foreground">Zuletzt verwendet</p>
                      <p className="text-sm">{new Date(keycard.lastUsed).toLocaleString('de-DE')}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1 sm:gap-2">
                    {canManageKeycards && (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setSelectedKeycard(keycard);
                            setShowEditKeycard(true);
                          }}
                          className="text-xs"
                        >
                          <Edit className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Bearbeiten</span>
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => toggleKeycard(keycard.id)}
                          className="text-xs"
                        >
                          <span className="hidden sm:inline">{keycard.isActive ? 'Deaktivieren' : 'Aktivieren'}</span>
                          <span className="sm:hidden">{keycard.isActive ? '❌' : '✅'}</span>
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => handleDeleteKeycard(keycard.id)}
                          className="text-xs"
                        >
                          <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Löschen</span>
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {keycards.length === 0 && (
            <Card>
              <CardContent className="text-center py-8">
                <KeyRound className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Keine Keycards verfügbar.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Edit Keycard Dialog */}
      <Dialog open={showEditKeycard} onOpenChange={setShowEditKeycard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keycard bearbeiten</DialogTitle>
          </DialogHeader>
          {selectedKeycard && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="editCardNumber">Keycard-Nummer</Label>
                <Input
                  id="editCardNumber"
                  value={selectedKeycard.cardNumber}
                  onChange={(e) => setSelectedKeycard({...selectedKeycard, cardNumber: e.target.value})}
                  placeholder="z.B. 1234567890"
                />
              </div>
              <div>
                <Label htmlFor="editOwner">Besitzer</Label>
                <Input
                  id="editOwner"
                  value={selectedKeycard.owner}
                  onChange={(e) => setSelectedKeycard({...selectedKeycard, owner: e.target.value})}
                  placeholder="z.B. Max Mustermann"
                  disabled
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Der Besitzername kann nicht über die Keycard-Verwaltung geändert werden.
                </p>
              </div>
              <div>
                <Label htmlFor="editAccessLevel">Zugriffsebene</Label>
                <select
                  id="editAccessLevel"
                  value={selectedKeycard.accessLevel}
                  onChange={(e) => setSelectedKeycard({...selectedKeycard, accessLevel: e.target.value})}
                  className="w-full p-2 border border-border rounded-md"
                  disabled
                >
                  <option value="Schüler">Schüler</option>
                  <option value="Lehrer">Lehrer</option>
                  <option value="Verwaltung">Verwaltung</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Die Zugriffsebene kann nur über die Benutzerverwaltung geändert werden.
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleEditKeycard}>Speichern</Button>
                <Button variant="outline" onClick={() => setShowEditKeycard(false)}>
                  Abbrechen
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Keycard;