import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ArrowLeft, BookOpen, Users, Calendar, Settings, Plus, Edit, Trash2, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const Klassenverwaltung = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [classes, setClasses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [showEditClass, setShowEditClass] = useState(false);
  const [selectedClassName, setSelectedClassName] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [editClassName, setEditClassName] = useState('');
  const [saving, setSaving] = useState(false);

  const canEditClasses = profile?.permission_lvl && profile.permission_lvl >= 10;

  const fetchClasses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('Klassen')
        .select('name')
        .order('name');

      if (error) throw error;
      setClasses(data?.map(c => c.name) || []);
    } catch (error) {
      console.error('Error fetching classes:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Klassen konnten nicht geladen werden."
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    if (profile && profile.permission_lvl < 10) {
      toast({
        variant: "destructive",
        title: "Zugriff verweigert",
        description: "Sie haben keine Berechtigung für die Klassenverwaltung."
      });
      navigate('/');
      return;
    }
    fetchClasses();
  }, [user, profile, navigate, fetchClasses]);

  const handleCreateClass = async () => {
    const trimmed = newClassName.trim();
    if (!trimmed) {
      toast({ variant: "destructive", title: "Fehler", description: "Bitte geben Sie einen Klassennamen ein." });
      return;
    }
    if (classes.includes(trimmed)) {
      toast({ variant: "destructive", title: "Fehler", description: "Diese Klasse existiert bereits." });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('Klassen').insert({ name: trimmed });
      if (error) throw error;

      setClasses(prev => [...prev, trimmed].sort());
      setNewClassName('');
      setShowCreateClass(false);
      toast({ title: "Klasse erstellt", description: `Die Klasse "${trimmed}" wurde erfolgreich erstellt.` });
    } catch (error: any) {
      console.error('Error creating class:', error);
      toast({ variant: "destructive", title: "Fehler", description: error.message || "Klasse konnte nicht erstellt werden." });
    } finally {
      setSaving(false);
    }
  };

  const handleEditClass = async () => {
    const trimmed = editClassName.trim();
    if (!trimmed) {
      toast({ variant: "destructive", title: "Fehler", description: "Der Klassenname darf nicht leer sein." });
      return;
    }
    if (trimmed === selectedClassName) {
      setShowEditClass(false);
      return;
    }
    if (classes.includes(trimmed)) {
      toast({ variant: "destructive", title: "Fehler", description: "Eine Klasse mit diesem Namen existiert bereits." });
      return;
    }

    setSaving(true);
    try {
      // Delete old, insert new (Klassen table has only name as PK)
      const { error: delError } = await supabase.from('Klassen').delete().eq('name', selectedClassName);
      if (delError) throw delError;

      const { error: insError } = await supabase.from('Klassen').insert({ name: trimmed });
      if (insError) throw insError;

      setClasses(prev => prev.map(c => c === selectedClassName ? trimmed : c).sort());
      setShowEditClass(false);
      toast({ title: "Klasse umbenannt", description: `"${selectedClassName}" wurde in "${trimmed}" umbenannt.` });
    } catch (error: any) {
      console.error('Error editing class:', error);
      toast({ variant: "destructive", title: "Fehler", description: error.message || "Klasse konnte nicht bearbeitet werden." });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClass = async (className: string) => {
    if (!window.confirm(`Möchten Sie die Klasse "${className}" wirklich löschen?`)) return;

    try {
      const { error } = await supabase.from('Klassen').delete().eq('name', className);
      if (error) throw error;

      setClasses(prev => prev.filter(c => c !== className));
      toast({ title: "Klasse gelöscht", description: `Die Klasse "${className}" wurde gelöscht.` });
    } catch (error: any) {
      console.error('Error deleting class:', error);
      toast({ variant: "destructive", title: "Fehler", description: error.message || "Klasse konnte nicht gelöscht werden." });
    }
  };

  const navigateToSchedule = (className: string) => {
    navigate(`/stundenplan?scrollTo=${className}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div className="flex items-center gap-2 sm:gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="shrink-0">
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Zurück zum Dashboard</span>
              </Button>
              <div className="flex items-center gap-2 sm:gap-3">
                <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
                <div>
                  <h1 className="text-lg sm:text-2xl font-bold text-foreground">Klassenverwaltung</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Klassen verwalten</p>
                </div>
              </div>
            </div>
            {canEditClasses && (
              <Button size="sm" onClick={() => setShowCreateClass(true)} className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Neue Klasse
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="space-y-4 sm:space-y-6">
          {/* Overview Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                    <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Klassen</p>
                    <p className="text-xl sm:text-2xl font-bold">{classes.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-1">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="p-2 bg-accent rounded-lg shrink-0">
                    <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Stundenpläne</p>
                    <p className="text-xl sm:text-2xl font-bold">2</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Classes Grid */}
          <div className="space-y-3 sm:space-y-4">
            <h2 className="text-lg sm:text-xl font-semibold">Alle Klassen</h2>

            {classes.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  Noch keine Klassen angelegt.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
                {classes.map((className) => (
                  <Card key={className} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2 sm:pb-4">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                          <BookOpen className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                          Klasse {className}
                        </CardTitle>
                        {(className === '10b' || className === '10c') && (
                          <Badge variant="secondary" className="text-xs shrink-0">Stundenplan</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigateToSchedule(className)}
                          className="flex-1"
                        >
                          <Calendar className="h-4 w-4 mr-1 sm:mr-2" />
                          <span className="text-xs sm:text-sm">Stundenplan</span>
                        </Button>
                        {canEditClasses && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedClassName(className);
                                setEditClassName(className);
                                setShowEditClass(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteClass(className)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-2 sm:pb-4">
              <CardTitle className="text-base sm:text-lg">Schnellzugriff</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <Button
                  variant="outline"
                  className="h-16 sm:h-20 flex-col text-xs sm:text-sm"
                  onClick={() => navigate('/stundenplan')}
                >
                  <Calendar className="h-5 w-5 sm:h-6 sm:w-6 mb-1 sm:mb-2" />
                  Stundenpläne
                </Button>
                <Button
                  variant="outline"
                  className="h-16 sm:h-20 flex-col text-xs sm:text-sm"
                  onClick={() => navigate('/vertretungsplan')}
                >
                  <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 mb-1 sm:mb-2" />
                  Vertretungsplan
                </Button>
                <Button
                  variant="outline"
                  className="h-16 sm:h-20 flex-col text-xs sm:text-sm"
                  onClick={() => navigate('/announcements')}
                >
                  <Users className="h-5 w-5 sm:h-6 sm:w-6 mb-1 sm:mb-2" />
                  Ankündigungen
                </Button>
                {canEditClasses && (
                  <Button
                    variant="outline"
                    className="h-16 sm:h-20 flex-col text-xs sm:text-sm"
                    onClick={() => navigate('/user-management')}
                  >
                    <Settings className="h-5 w-5 sm:h-6 sm:w-6 mb-1 sm:mb-2" />
                    Benutzerverwaltung
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Create Class Dialog */}
      <Dialog open={showCreateClass} onOpenChange={setShowCreateClass}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neue Klasse erstellen</DialogTitle>
            <DialogDescription>Geben Sie den Namen der neuen Klasse ein.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="className">Klassenname</Label>
              <Input
                id="className"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                placeholder="z.B. 11a"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateClass()}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCreateClass(false)} disabled={saving}>
                Abbrechen
              </Button>
              <Button onClick={handleCreateClass} disabled={saving}>
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Erstelle...</> : 'Erstellen'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Class Dialog */}
      <Dialog open={showEditClass} onOpenChange={setShowEditClass}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Klasse umbenennen</DialogTitle>
            <DialogDescription>Ändern Sie den Namen der Klasse "{selectedClassName}".</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="editClassName">Neuer Name</Label>
              <Input
                id="editClassName"
                value={editClassName}
                onChange={(e) => setEditClassName(e.target.value)}
                placeholder="z.B. 11a"
                onKeyDown={(e) => e.key === 'Enter' && handleEditClass()}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowEditClass(false)} disabled={saving}>
                Abbrechen
              </Button>
              <Button onClick={handleEditClass} disabled={saving}>
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Speichere...</> : 'Speichern'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Klassenverwaltung;
