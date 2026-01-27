import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Megaphone, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Announcement {
  id: string;
  title: string;
  content: string;
  author: string;
  created_at: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

const Announcements = () => {
  const navigate = useNavigate();
  const { user, profile, sessionId } = useAuth();
  const { canAccess, isLoaded } = usePermissions();
const [announcements, setAnnouncements] = useState<Announcement[]>([]);
const [showCreateForm, setShowCreateForm] = useState(false);
const [newAnnouncement, setNewAnnouncement] = useState({
  title: '',
  content: '',
  priority: 'normal' as 'low' | 'normal' | 'high' | 'urgent'
});
const [userClass, setUserClass] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    if (!isLoaded) return; // wait for permissions to load

    if (profile && !canAccess('view_announcements')) {
      toast({
        variant: "destructive",
        title: "Zugriff verweigert",
        description: "Sie haben keine Berechtigung für diese Seite."
      });
      navigate('/');
      return;
    }
    
    fetchAnnouncements();
  }, [user, profile, navigate, canAccess, isLoaded]);

const fetchAnnouncements = async () => {
  try {
    // Get user's class and permission level
    const { data: userData, error: userError } = await supabase
      .from('permissions')
      .select('user_class, permission_lvl')
      .eq('id', profile?.id)
      .single();

    if (userError && userError.code !== 'PGRST116') {
      console.error('Error fetching user data:', userError);
    }

    const uClass = userData?.user_class || null;
    const permissionLevel = userData?.permission_lvl ?? profile?.permission_lvl ?? 1;
    setUserClass(uClass);

    let query = supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });

    // Filter announcements strictly per class (admins see all)
    if (permissionLevel < 10) {
      if (uClass) {
        query = query.or(`target_class.eq.${uClass},target_class.is.null`);
      } else {
        query = query.is('target_class', null);
      }
      query = query.or(`target_permission_level.is.null,target_permission_level.lte.${permissionLevel}`);
    }

    const { data, error } = await query;

    if (error) throw error;

    const announcementData = (data || []).map((ann: any) => ({
      id: ann.id,
      title: ann.title,
      content: ann.content,
      author: ann.author,
      created_at: ann.created_at,
      priority: (ann.priority as 'low' | 'normal' | 'high' | 'urgent') || 'normal'
    }));

    setAnnouncements(announcementData);
  } catch (error) {
    console.error('Error fetching announcements:', error);
  }
};

const handleCreateAnnouncement = async () => {
  if (!newAnnouncement.title || !newAnnouncement.content) {
    toast({
      variant: "destructive",
      title: "Fehler",
      description: "Bitte füllen Sie alle Felder aus."
    });
    return;
  }

  try {
    const { data: resp, error } = await supabase.functions.invoke('ai-actions', {
      body: {
        action: 'create_announcement',
        parameters: {
          title: newAnnouncement.title,
          content: newAnnouncement.content,
          priority: newAnnouncement.priority,
          targetClass: userClass || null,
          targetPermissionLevel: 1,
        },
        userProfile: {
          permission_lvl: profile?.permission_lvl || 1,
          name: (profile as any)?.name || (profile as any)?.username || 'Unbekannt',
        }
      }
    });

    if (error || (resp && resp.success === false)) {
      throw new Error((resp as any)?.result?.error || error?.message || 'Unbekannter Fehler');
    }

    await fetchAnnouncements();
    setNewAnnouncement({ title: '', content: '', priority: 'normal' });
    setShowCreateForm(false);
    toast({ title: "Ankündigung erstellt", description: "Die Ankündigung wurde erfolgreich veröffentlicht." });
  } catch (error) {
    console.error('Error creating announcement:', error);
    toast({
      variant: "destructive",
      title: "Fehler",
      description: "Ankündigung konnte nicht erstellt werden."
    });
  }
};

  const handleDeleteAnnouncement = async (id: string) => {
    if (!sessionId) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Keine aktive Sitzung' });
      return;
    }
    try {
      // Set session context for RLS
      await supabase.rpc('set_session_context', { session_id_param: sessionId });

      const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchAnnouncements();
      toast({
        title: 'Ankündigung gelöscht',
        description: 'Die Ankündigung wurde entfernt.'
      });
    } catch (error) {
      console.error('Error deleting announcement:', error);
      toast({ variant: 'destructive', title: 'Fehler', description: 'Ankündigung konnte nicht gelöscht werden.' });
    } finally {
      await supabase.rpc('set_session_context', { session_id_param: '' });
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'border-red-500 bg-red-50 dark:bg-red-950/20 dark:border-red-400';
      case 'high': return 'border-orange-500 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-400';
      case 'low': return 'border-gray-500 bg-gray-50 dark:bg-gray-950/20 dark:border-gray-400';
      default: return 'border-blue-500 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-400';
    }
  };

  const getPriorityText = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'Dringend';
      case 'high': return 'Wichtig';
      case 'low': return 'Niedrig';
      default: return 'Normal';
    }
  };

  const canCreateAnnouncements = canAccess('create_announcements');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-2 sm:px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="self-start">
                <ArrowLeft className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Zurück zum Dashboard</span>
                <span className="sm:hidden">Zurück</span>
              </Button>
              <div className="flex items-center gap-3">
                <Megaphone className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                <div className="flex items-center gap-3">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-foreground">Ankündigungen</h1>
                    <p className="text-sm sm:text-base text-muted-foreground">Aktuelle Schulnachrichten</p>
                  </div>
                  {canCreateAnnouncements && (
                    <Button onClick={() => setShowCreateForm(!showCreateForm)} size="sm">
                      <Plus className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        <div className="space-y-6">
          {/* Create Form */}
          {showCreateForm && canCreateAnnouncements && (
            <Card>
              <CardHeader>
                <CardTitle>Neue Ankündigung erstellen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="title">Titel</Label>
                  <Input
                    id="title"
                    value={newAnnouncement.title}
                    onChange={(e) => setNewAnnouncement({...newAnnouncement, title: e.target.value})}
                    placeholder="Titel der Ankündigung"
                  />
                </div>
                <div>
                  <Label htmlFor="content">Inhalt</Label>
                  <Textarea
                    id="content"
                    value={newAnnouncement.content}
                    onChange={(e) => setNewAnnouncement({...newAnnouncement, content: e.target.value})}
                    placeholder="Inhalt der Ankündigung"
                    rows={4}
                  />
                </div>
                <div>
                  <Label htmlFor="priority">Priorität</Label>
                  <select
                    id="priority"
                    value={newAnnouncement.priority}
                    onChange={(e) => setNewAnnouncement({...newAnnouncement, priority: e.target.value as any})}
                    className="w-full p-2 border border-border rounded-md"
                  >
                    <option value="low">Niedrig</option>
                    <option value="normal">Normal</option>
                    <option value="high">Wichtig</option>
                    <option value="urgent">Dringend</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleCreateAnnouncement}>Veröffentlichen</Button>
                  <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                    Abbrechen
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Announcements List */}
          <div className="space-y-4">
            {announcements.map((announcement) => (
              <Card key={announcement.id} className={`border-l-4 ${getPriorityColor(announcement.priority)}`}>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Megaphone className="h-4 w-4 flex-shrink-0" />
                      <span className="break-words">{announcement.title}</span>
                    </CardTitle>
                    <div className="flex items-center gap-2 self-start sm:self-center">
                      <div className="text-xs sm:text-sm text-muted-foreground">
                        {getPriorityText(announcement.priority)}
                      </div>
                      {canCreateAnnouncements && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDeleteAnnouncement(announcement.id)}
                          className="h-8 w-8 p-0"
                        >
                          <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-foreground mb-4">{announcement.content}</p>
                  <div className="text-sm text-muted-foreground">
                    Von: {announcement.author} • {new Date(announcement.created_at).toLocaleDateString('de-DE')}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {announcements.length === 0 && (
            <Card>
              <CardContent className="text-center py-8">
                <Megaphone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Keine Ankündigungen verfügbar.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default Announcements;