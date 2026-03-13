import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEnhancedPermissions } from '@/hooks/useEnhancedPermissions';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import UpdateScheduleManager from '@/components/UpdateScheduleManager';
import { 
  Monitor, 
  ArrowLeft, 
  Edit, 
  Copy, 
  XCircle,
  RefreshCw,
  Wifi,
  WifiOff,
  Plus,
  Calendar,
  BookOpen,
  Battery,
  BatteryLow,
  BatteryMedium,
  BatteryFull,
  BatteryWarning
} from 'lucide-react';

interface RoomDisplay {
  id: string;
  room_name: string;
  display_name: string | null;
  is_active: boolean | null;
  last_seen: string | null;
  display_mode: string;
  info_mode_content: string | null;
  additional_info: string | null;
  update_schedule_id: number | null;
  primary_subject: string | null;
  battery_level: number | null;
}

interface UpdateSchedule {
  id: number;
  name: string;
}

const DisplayManagement = () => {
  const navigate = useNavigate();
  const { profile, loading, sessionId } = useAuth();
  const { hasPermission, isLoaded } = useEnhancedPermissions();
  const { toast } = useToast();

  const [displays, setDisplays] = useState<RoomDisplay[]>([]);
  const [schedules, setSchedules] = useState<UpdateSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDisplays, setSelectedDisplays] = useState<Set<string>>(new Set());
  const [editingDisplay, setEditingDisplay] = useState<RoomDisplay | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newDisplay, setNewDisplay] = useState({
    room_name: '',
    display_name: '',
    additional_info: '',
    display_mode: 'schedule',
    info_mode_content: '',
    primary_subject: ''
  });

  const canManageDisplays = hasPermission('display_management');

  useEffect(() => {
    if (!loading && !profile) {
      navigate('/auth');
      return;
    }

    if (!isLoaded) return;

    if (profile && !canManageDisplays && (profile.permission_lvl ?? 0) < 8) {
      navigate('/');
      toast({
        variant: "destructive",
        title: "Zugriff verweigert",
        description: "Sie haben keine Berechtigung für die Display-Verwaltung."
      });
      return;
    }

    loadData();
  }, [profile, loading, isLoaded, canManageDisplays, navigate]);

  const loadData = async () => {
    try {
      setIsLoading(true);

      const [displaysResult, schedulesResult] = await Promise.all([
        supabase.from('room_displays').select('*').order('room_name'),
        supabase.from('update_schedules').select('id, name').order('name')
      ]);

      if (displaysResult.error) throw displaysResult.error;
      if (schedulesResult.error) throw schedulesResult.error;

      setDisplays(displaysResult.data || []);
      setSchedules(schedulesResult.data || []);
    } catch (error) {
      console.error('Error loading displays:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Displays konnten nicht geladen werden."
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isOnline = (lastSeen: string | null): boolean => {
    if (!lastSeen) return false;
    const lastSeenDate = new Date(lastSeen);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return lastSeenDate > twentyFourHoursAgo;
  };

  const getBatteryIcon = (level: number | null) => {
    if (level === null || level === undefined) return <Battery className="h-3.5 w-3.5 text-muted-foreground" />;
    if (level <= 10) return <BatteryWarning className="h-3.5 w-3.5 text-destructive" />;
    if (level <= 25) return <BatteryLow className="h-3.5 w-3.5 text-destructive" />;
    if (level <= 60) return <BatteryMedium className="h-3.5 w-3.5 text-yellow-500" />;
    return <BatteryFull className="h-3.5 w-3.5 text-green-500" />;
  };

  const getBatteryColor = (level: number | null): string => {
    if (level === null || level === undefined) return 'text-muted-foreground';
    if (level <= 25) return 'text-destructive';
    if (level <= 60) return 'text-yellow-500';
    return 'text-green-500';
  };


  const handleToggleActive = async (display: RoomDisplay) => {
    try {
      if (sessionId) {
        await supabase.rpc('set_session_context', { session_id_param: sessionId });
      }
      const { error } = await supabase
        .from('room_displays')
        .update({ is_active: !display.is_active })
        .eq('id', display.id);

      if (error) throw error;

      setDisplays(prev => prev.map(d => 
        d.id === display.id ? { ...d, is_active: !d.is_active } : d
      ));

      toast({
        title: "Erfolg",
        description: `Display ${!display.is_active ? 'aktiviert' : 'deaktiviert'}.`
      });
    } catch (error) {
      console.error('Error toggling display:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Status konnte nicht geändert werden."
      });
    }
  };

  const handleBulkDeactivate = async () => {
    if (selectedDisplays.size === 0) return;

    try {
      if (sessionId) {
        await supabase.rpc('set_session_context', { session_id_param: sessionId });
      }
      const { error } = await supabase
        .from('room_displays')
        .update({ is_active: false })
        .in('id', Array.from(selectedDisplays));

      if (error) throw error;

      setDisplays(prev => prev.map(d => 
        selectedDisplays.has(d.id) ? { ...d, is_active: false } : d
      ));
      setSelectedDisplays(new Set());

      toast({
        title: "Erfolg",
        description: `${selectedDisplays.size} Display(s) deaktiviert.`
      });
    } catch (error) {
      console.error('Error bulk deactivating:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Bulk-Aktion fehlgeschlagen."
      });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingDisplay) return;

    try {
      if (sessionId) {
        await supabase.rpc('set_session_context', { session_id_param: sessionId });
      }
      const { error } = await supabase
        .from('room_displays')
        .update({
          display_name: editingDisplay.display_name,
          room_name: editingDisplay.room_name,
          additional_info: editingDisplay.additional_info,
          display_mode: editingDisplay.display_mode,
          info_mode_content: editingDisplay.info_mode_content,
          update_schedule_id: editingDisplay.update_schedule_id,
          primary_subject: editingDisplay.primary_subject || null
        })
        .eq('id', editingDisplay.id);

      if (error) throw error;

      setDisplays(prev => prev.map(d => 
        d.id === editingDisplay.id ? editingDisplay : d
      ));
      setShowEditDialog(false);
      setEditingDisplay(null);

      toast({
        title: "Erfolg",
        description: "Display aktualisiert."
      });
    } catch (error) {
      console.error('Error saving display:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Änderungen konnten nicht gespeichert werden."
      });
    }
  };

  const handleAddDisplay = async () => {
    if (!newDisplay.room_name.trim()) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Bitte geben Sie eine Raumnummer ein."
      });
      return;
    }

    try {
      if (sessionId) {
        await supabase.rpc('set_session_context', { session_id_param: sessionId });
      }
      const { data, error } = await supabase
        .from('room_displays')
        .insert({
          room_name: newDisplay.room_name.trim(),
          display_name: newDisplay.display_name.trim() || null,
          additional_info: newDisplay.additional_info.trim() || null,
          display_mode: newDisplay.display_mode,
          info_mode_content: newDisplay.display_mode === 'info' ? newDisplay.info_mode_content : null,
          primary_subject: newDisplay.primary_subject.trim() || null,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      setDisplays(prev => [...prev, data].sort((a, b) => a.room_name.localeCompare(b.room_name)));
      setShowAddDialog(false);
      setNewDisplay({
        room_name: '',
        display_name: '',
        additional_info: '',
        display_mode: 'schedule',
        info_mode_content: '',
        primary_subject: ''
      });

      toast({
        title: "Erfolg",
        description: `Display für Raum ${data.room_name} hinzugefügt.`
      });
    } catch (error) {
      console.error('Error adding display:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Display konnte nicht hinzugefügt werden."
      });
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast({
      title: "Kopiert",
      description: "Display-ID in die Zwischenablage kopiert."
    });
  };

  const toggleSelection = (id: string) => {
    setSelectedDisplays(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    if (selectedDisplays.size === displays.length) {
      setSelectedDisplays(new Set());
    } else {
      setSelectedDisplays(new Set(displays.map(d => d.id)));
    }
  };

  if (loading || !isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <Monitor className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-xl font-bold text-foreground">BERT Display-Verwaltung</h1>
                <p className="text-sm text-muted-foreground">E-Paper Displays verwalten</p>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Aktualisieren
              </Button>
              <Button size="sm" onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Display hinzufügen
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="displays" className="space-y-4">
          <TabsList>
            <TabsTrigger value="displays" className="flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              Displays
            </TabsTrigger>
            <TabsTrigger value="schedules" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Aktualisierungszeitpläne
            </TabsTrigger>
          </TabsList>

          <TabsContent value="displays">
            {/* Bulk Actions Bar */}
            {selectedDisplays.size > 0 && (
              <Card className="mb-4 border-primary">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {selectedDisplays.size} Display(s) ausgewählt
                    </span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedDisplays(new Set())}>
                        <XCircle className="h-4 w-4 mr-2" />
                        Auswahl aufheben
                      </Button>
                      <Button variant="destructive" size="sm" onClick={handleBulkDeactivate}>
                        Alle deaktivieren
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Select All */}
            <div className="mb-4 flex items-center gap-2">
              <Checkbox
                checked={selectedDisplays.size === displays.length && displays.length > 0}
                onCheckedChange={selectAll}
              />
              <span className="text-sm text-muted-foreground">Alle auswählen</span>
              <Badge variant="secondary" className="ml-2">{displays.length} Displays</Badge>
            </div>

            {/* Display Grid */}
            {isLoading ? (
              <div className="flex justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : displays.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Monitor className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Keine Displays gefunden.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {displays.map(display => (
                  <Card 
                    key={display.id} 
                    className={`relative transition-all ${selectedDisplays.has(display.id) ? 'ring-2 ring-primary' : ''}`}
                  >
                    <div className="absolute top-3 left-3">
                      <Checkbox
                        checked={selectedDisplays.has(display.id)}
                        onCheckedChange={() => toggleSelection(display.id)}
                      />
                    </div>
                    <CardHeader className="pt-10 pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-xl font-bold">
                            {display.room_name}
                          </CardTitle>
                          {display.primary_subject && (
                            <div className="flex items-center gap-1 mt-1">
                              <BookOpen className="h-3.5 w-3.5 text-primary" />
                              <span className="text-sm font-medium text-primary">{display.primary_subject}</span>
                            </div>
                          )}
                          {display.display_name && (
                            <p className="text-xs text-muted-foreground mt-0.5">{display.display_name}</p>
                          )}
                        </div>
                        <Badge 
                          variant={isOnline(display.last_seen) ? "default" : "destructive"}
                          className="flex items-center gap-1"
                        >
                          {isOnline(display.last_seen) ? (
                            <>
                              <Wifi className="h-3 w-3" />
                              Online
                            </>
                          ) : (
                            <>
                              <WifiOff className="h-3 w-3" />
                              Offline
                            </>
                          )}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Aktiv</span>
                        <Switch
                          checked={display.is_active ?? false}
                          onCheckedChange={() => handleToggleActive(display)}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Modus: {display.display_mode === 'info' ? 'Informationstext' : 'Stundenplan'}
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {getBatteryIcon(display.battery_level)}
                          <span className={`text-xs font-medium ${getBatteryColor(display.battery_level)}`}>
                            {display.battery_level !== null && display.battery_level !== undefined
                              ? `${display.battery_level}%`
                              : 'Unbekannt'}
                          </span>
                        </div>
                      </div>
                      {display.last_seen && (
                        <div className="text-xs text-muted-foreground">
                          Zuletzt gesehen: {new Date(display.last_seen).toLocaleString('de-DE')}
                        </div>
                      )}
                      <div className="flex gap-2 pt-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1"
                          onClick={() => {
                            setEditingDisplay(display);
                            setShowEditDialog(true);
                          }}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Bearbeiten
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleCopyId(display.id)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="schedules">
            <UpdateScheduleManager />
          </TabsContent>
        </Tabs>
      </main>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Display bearbeiten</DialogTitle>
          </DialogHeader>
          {editingDisplay && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="display_name">Anzeigename</Label>
                <Input
                  id="display_name"
                  value={editingDisplay.display_name || ''}
                  onChange={e => setEditingDisplay({ ...editingDisplay, display_name: e.target.value })}
                  placeholder="z.B. Physikraum-Display"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="room_name">Raumnummer</Label>
                <Input
                  id="room_name"
                  value={editingDisplay.room_name}
                  onChange={e => setEditingDisplay({ ...editingDisplay, room_name: e.target.value })}
                  placeholder="z.B. 101"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="primary_subject">Fach / Fächer</Label>
                <Input
                  id="primary_subject"
                  value={editingDisplay.primary_subject || ''}
                  onChange={e => setEditingDisplay({ ...editingDisplay, primary_subject: e.target.value })}
                  placeholder="z.B. Physik, Chemie"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="additional_info">Lauftext / Fußzeile</Label>
                <Input
                  id="additional_info"
                  value={editingDisplay.additional_info || ''}
                  onChange={e => setEditingDisplay({ ...editingDisplay, additional_info: e.target.value })}
                  placeholder="Zusätzlicher Text..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="display_mode">Anzeigemodus</Label>
                <Select
                  value={editingDisplay.display_mode}
                  onValueChange={value => setEditingDisplay({ ...editingDisplay, display_mode: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="schedule">Normaler Stundenplan</SelectItem>
                    <SelectItem value="info">Informationstext</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editingDisplay.display_mode === 'info' && (
                <div className="space-y-2">
                  <Label htmlFor="info_content">Informationstext</Label>
                  <Textarea
                    id="info_content"
                    value={editingDisplay.info_mode_content || ''}
                    onChange={e => setEditingDisplay({ ...editingDisplay, info_mode_content: e.target.value })}
                    placeholder="Text der angezeigt werden soll..."
                    rows={4}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="schedule">Aktualisierungs-Zeitplan</Label>
                <Select
                  value={editingDisplay.update_schedule_id?.toString() || 'none'}
                  onValueChange={value => setEditingDisplay({ 
                    ...editingDisplay, 
                    update_schedule_id: value === 'none' ? null : parseInt(value) 
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Zeitplan auswählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kein Zeitplan</SelectItem>
                    {schedules.map(schedule => (
                      <SelectItem key={schedule.id} value={schedule.id.toString()}>
                        {schedule.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => handleCopyId(editingDisplay.id)}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  ID kopieren: {editingDisplay.id.slice(0, 8)}...
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSaveEdit}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Display Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Neues Display hinzufügen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new_room_name">Raumnummer *</Label>
              <Input
                id="new_room_name"
                value={newDisplay.room_name}
                onChange={e => setNewDisplay({ ...newDisplay, room_name: e.target.value })}
                placeholder="z.B. 101"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new_display_name">Anzeigename</Label>
              <Input
                id="new_display_name"
                value={newDisplay.display_name}
                onChange={e => setNewDisplay({ ...newDisplay, display_name: e.target.value })}
                placeholder="z.B. Physikraum-Display"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new_primary_subject">Fach / Fächer</Label>
              <Input
                id="new_primary_subject"
                value={newDisplay.primary_subject}
                onChange={e => setNewDisplay({ ...newDisplay, primary_subject: e.target.value })}
                placeholder="z.B. Physik, Chemie"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new_additional_info">Lauftext / Fußzeile</Label>
              <Input
                id="new_additional_info"
                value={newDisplay.additional_info}
                onChange={e => setNewDisplay({ ...newDisplay, additional_info: e.target.value })}
                placeholder="Zusätzlicher Text..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new_display_mode">Anzeigemodus</Label>
              <Select
                value={newDisplay.display_mode}
                onValueChange={value => setNewDisplay({ ...newDisplay, display_mode: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="schedule">Normaler Stundenplan</SelectItem>
                  <SelectItem value="info">Informationstext</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newDisplay.display_mode === 'info' && (
              <div className="space-y-2">
                <Label htmlFor="new_info_content">Informationstext</Label>
                <Textarea
                  id="new_info_content"
                  value={newDisplay.info_mode_content}
                  onChange={e => setNewDisplay({ ...newDisplay, info_mode_content: e.target.value })}
                  placeholder="Text der angezeigt werden soll..."
                  rows={4}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleAddDisplay}>
              Hinzufügen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DisplayManagement;
