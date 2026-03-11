import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Clock, Plus, Trash2, Save, RefreshCw, Moon, Sun } from 'lucide-react';

interface ScheduleData {
  night_sync: string;
  update_times: string[];
  special_updates?: {
    friday_end?: string;
    [key: string]: string | undefined;
  };
}

interface UpdateScheduleEntry {
  id: number;
  name: string;
  description: string | null;
  schedule_data: ScheduleData;
  enable_weekend_mode: boolean | null;
}

const UpdateScheduleManager = () => {
  const { sessionId } = useAuth();
  const { toast } = useToast();
  const [schedules, setSchedules] = useState<UpdateScheduleEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<number | null>(null);
  const [editedSchedules, setEditedSchedules] = useState<Record<number, ScheduleData>>({});

  useEffect(() => {
    loadSchedules();
  }, []);

  const loadSchedules = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('update_schedules')
        .select('*')
        .order('id');

      if (error) throw error;

      const parsed = (data || []).map(s => ({
        ...s,
        schedule_data: s.schedule_data as unknown as ScheduleData
      }));
      setSchedules(parsed);

      const edits: Record<number, ScheduleData> = {};
      parsed.forEach(s => {
        edits[s.id] = JSON.parse(JSON.stringify(s.schedule_data));
      });
      setEditedSchedules(edits);
    } catch (error) {
      console.error('Error loading schedules:', error);
      toast({ variant: 'destructive', title: 'Fehler', description: 'Zeitpläne konnten nicht geladen werden.' });
    } finally {
      setIsLoading(false);
    }
  };

  const updateNightSync = (scheduleId: number, value: string) => {
    setEditedSchedules(prev => ({
      ...prev,
      [scheduleId]: { ...prev[scheduleId], night_sync: value }
    }));
  };

  const updateTime = (scheduleId: number, index: number, value: string) => {
    setEditedSchedules(prev => {
      const times = [...prev[scheduleId].update_times];
      times[index] = value;
      return { ...prev, [scheduleId]: { ...prev[scheduleId], update_times: times } };
    });
  };

  const addTime = (scheduleId: number) => {
    setEditedSchedules(prev => {
      const times = [...prev[scheduleId].update_times, '12:00'];
      return { ...prev, [scheduleId]: { ...prev[scheduleId], update_times: times } };
    });
  };

  const removeTime = (scheduleId: number, index: number) => {
    setEditedSchedules(prev => {
      const times = prev[scheduleId].update_times.filter((_, i) => i !== index);
      return { ...prev, [scheduleId]: { ...prev[scheduleId], update_times: times } };
    });
  };

  const updateSpecialUpdate = (scheduleId: number, key: string, value: string) => {
    setEditedSchedules(prev => ({
      ...prev,
      [scheduleId]: {
        ...prev[scheduleId],
        special_updates: { ...prev[scheduleId].special_updates, [key]: value }
      }
    }));
  };

  const handleSave = async (scheduleId: number) => {
    try {
      setIsSaving(scheduleId);

      if (sessionId) {
        await supabase.rpc('set_session_context', { session_id_param: sessionId });
      }

      const sortedData = {
        ...editedSchedules[scheduleId],
        update_times: [...editedSchedules[scheduleId].update_times].sort()
      };

      const { error } = await supabase
        .from('update_schedules')
        .update({ schedule_data: JSON.parse(JSON.stringify(sortedData)) })
        .eq('id', scheduleId);

      if (error) throw error;

      setEditedSchedules(prev => ({ ...prev, [scheduleId]: sortedData }));
      setSchedules(prev => prev.map(s => s.id === scheduleId ? { ...s, schedule_data: sortedData } : s));

      toast({ title: 'Gespeichert', description: 'Zeitplan wurde aktualisiert.' });
    } catch (error) {
      console.error('Error saving schedule:', error);
      toast({ variant: 'destructive', title: 'Fehler', description: 'Zeitplan konnte nicht gespeichert werden.' });
    } finally {
      setIsSaving(null);
    }
  };

  const hasChanges = (scheduleId: number) => {
    const original = schedules.find(s => s.id === scheduleId);
    if (!original || !editedSchedules[scheduleId]) return false;
    return JSON.stringify(original.schedule_data) !== JSON.stringify(editedSchedules[scheduleId]);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {schedules.map(schedule => {
        const edited = editedSchedules[schedule.id];
        if (!edited) return null;

        const isWeekend = schedule.id === 2;
        const Icon = isWeekend ? Moon : Sun;

        return (
          <Card key={schedule.id} className="relative">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">{schedule.name}</CardTitle>
                    {schedule.description && (
                      <p className="text-sm text-muted-foreground mt-1">{schedule.description}</p>
                    )}
                  </div>
                </div>
                <Badge variant={isWeekend ? 'secondary' : 'default'}>
                  ID {schedule.id}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Night Sync */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Moon className="h-4 w-4" />
                  Nacht-Synchronisation
                </Label>
                <Input
                  type="time"
                  value={edited.night_sync}
                  onChange={e => updateNightSync(schedule.id, e.target.value)}
                  className="w-40"
                />
                <p className="text-xs text-muted-foreground">
                  Zeitpunkt der nächtlichen Komplettsynchronisation
                </p>
              </div>

              {/* Update Times */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Aktualisierungszeiten
                  </Label>
                  <Badge variant="outline">{edited.update_times.length} Zeiten</Badge>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {edited.update_times.map((time, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-6 text-right">{index + 1}.</span>
                      <Input
                        type="time"
                        value={time}
                        onChange={e => updateTime(schedule.id, index, e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeTime(schedule.id, index)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addTime(schedule.id)}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Zeit hinzufügen
                </Button>
              </div>

              {/* Special Updates */}
              {edited.special_updates && Object.keys(edited.special_updates).length > 0 && (
                <div className="space-y-2">
                  <Label>Sonderzeiten</Label>
                  {Object.entries(edited.special_updates).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground min-w-[100px]">
                        {key === 'friday_end' ? 'Freitag Ende' : key}
                      </span>
                      <Input
                        type="time"
                        value={value || ''}
                        onChange={e => updateSpecialUpdate(schedule.id, key, e.target.value)}
                        className="flex-1"
                        placeholder="Nicht gesetzt"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Save Button */}
              <Button
                onClick={() => handleSave(schedule.id)}
                disabled={!hasChanges(schedule.id) || isSaving === schedule.id}
                className="w-full"
              >
                {isSaving === schedule.id ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {hasChanges(schedule.id) ? 'Änderungen speichern' : 'Keine Änderungen'}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default UpdateScheduleManager;
