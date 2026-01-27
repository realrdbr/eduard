import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Megaphone, Bell, AlertTriangle, Info } from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  target_class?: string;
  target_permission_level?: number;
  author: string;
  created_at: string;
  created_by: string;
  updated_at: string;
}

const AnnouncementManager = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '',
    content: '',
    priority: 'medium' as const,
    target_class: '',
    target_permission_level: '',
    expires_at: ''
  });

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAnnouncements((data || []).map(item => ({
        ...item,
        priority: item.priority as 'low' | 'medium' | 'high' | 'urgent'
      })));
    } catch (error) {
      console.error('Error fetching announcements:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.content) {
      toast({
        title: "Fehler",
        description: "Titel und Inhalt sind erforderlich",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const announcementData = {
        title: form.title,
        content: form.content,
        priority: form.priority,
        target_class: form.target_class || null,
        target_permission_level: form.target_permission_level ? parseInt(form.target_permission_level) : null,
        author: profile?.name || profile?.username || 'E.D.U.A.R.D.',
        created_by: profile?.id?.toString() || 'system'
      };

      const { error } = await supabase
        .from('announcements')
        .insert(announcementData);

      if (error) throw error;

      toast({
        title: "Erfolg",
        description: "Ankündigung wurde von E.D.U.A.R.D. erstellt"
      });

      // Reset form
      setForm({
        title: '',
        content: '',
        priority: 'medium',
        target_class: '',
        target_permission_level: '',
        expires_at: ''
      });

      fetchAnnouncements();
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Ankündigung konnte nicht erstellt werden",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Remove toggle function as it's not needed for the current announcements table structure

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'high':
        return <Bell className="h-4 w-4 text-orange-500" />;
      case 'medium':
        return <Megaphone className="h-4 w-4 text-blue-500" />;
      default:
        return <Info className="h-4 w-4 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Check permissions
  if (!profile || profile.permission_lvl < 4) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Keine Berechtigung</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Sie benötigen mindestens Berechtigung Level 4 um Ankündigungen zu verwalten.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Create Announcement Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            Neue Ankündigung erstellen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Titel *</label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Titel der Ankündigung"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Inhalt *</label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="Inhalt der Ankündigung..."
                rows={4}
                required
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Priorität</label>
                <Select value={form.priority} onValueChange={(value: any) => setForm({ ...form, priority: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Niedrig</SelectItem>
                    <SelectItem value="medium">Mittel</SelectItem>
                    <SelectItem value="high">Hoch</SelectItem>
                    <SelectItem value="urgent">Dringend</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Zielklasse (optional)</label>
                <Input
                  value={form.target_class}
                  onChange={(e) => setForm({ ...form, target_class: e.target.value })}
                  placeholder="z.B. 10a, 12b"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Ziel-Berechtigungslevel (optional)</label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={form.target_permission_level}
                  onChange={(e) => setForm({ ...form, target_permission_level: e.target.value })}
                  placeholder="1-10"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Ablaufzeit (optional)</label>
              <Input
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
              />
            </div>
            
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'E.D.U.A.R.D. erstellt...' : 'Ankündigung mit E.D.U.A.R.D. erstellen'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Announcements List */}
      <Card>
        <CardHeader>
          <CardTitle>Ankündigungs-Übersicht</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {announcements.map((announcement) => (
              <div 
                key={announcement.id} 
                className={`p-4 border rounded-lg ${getPriorityColor(announcement.priority)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {getPriorityIcon(announcement.priority)}
                      <h3 className="font-semibold">{announcement.title}</h3>
                    <Badge variant="default">
                      Aktiv
                    </Badge>
                      <Badge variant="outline" className="text-xs">
                        {announcement.priority.toUpperCase()}
                      </Badge>
                    </div>
                    
                    <p className="text-sm mb-2">{announcement.content}</p>
                    
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>Erstellt: {new Date(announcement.created_at).toLocaleString('de-DE')} von {announcement.author}</p>
                      {announcement.target_class && (
                        <p>Zielklasse: {announcement.target_class}</p>
                      )}
                      {announcement.target_permission_level && (
                        <p>Ziel-Level: {announcement.target_permission_level}</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Announcements are always active */}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AnnouncementManager;