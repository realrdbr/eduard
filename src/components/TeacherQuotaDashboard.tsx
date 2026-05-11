import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarChart3, Download, AlertTriangle, ChevronDown, ChevronUp, Calendar, Settings, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { fetchScheduleTables } from '@/lib/scheduleTables';

interface Teacher {
  shortened: string;
  firstName: string;
  lastName: string;
  subjects: string;
}

interface WeeklyLoadEntry {
  teacher: Teacher;
  timetableHours: number;
  substitutionHours: number;
  total: number;
  remaining: number;
  limit: number;
}

interface SubstitutionDetail {
  id: string;
  date: string;
  period: number;
  class_name: string;
  original_teacher: string;
  substitute_subject: string | null;
  original_subject: string;
  note: string | null;
}

const toISODate = (d: Date) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getWeekRange = (dateStr: string) => {
  const d = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay();
  const daysToMon = dow === 0 ? 6 : dow - 1;
  const mon = new Date(d);
  mon.setDate(mon.getDate() - daysToMon);
  const fri = new Date(mon);
  fri.setDate(fri.getDate() + 4);
  return { monday: toISODate(mon), friday: toISODate(fri), monDate: mon, friDate: fri };
};

const formatWeekLabel = (monday: string, friday: string) => {
  const mon = new Date(monday + 'T00:00:00');
  const fri = new Date(friday + 'T00:00:00');
  return `${mon.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} – ${fri.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
};

const parseCell = (cell?: string) => {
  if (!cell) return [] as Array<{ subject: string; teacher: string; room: string }>;
  return cell.split('|').map(s => s.trim()).filter(Boolean).map(sub => {
    const parts = sub.split(/\s+/).filter(Boolean);
    if (parts.length >= 3) return { subject: parts[0], teacher: parts[1], room: parts.slice(2).join(' ') };
    if (parts.length === 2) return { subject: parts[0], teacher: parts[1], room: '' };
    return { subject: sub, teacher: '', room: '' };
  });
};

const DEFAULT_WEEKLY_LIMIT = 26;

const TeacherQuotaDashboard = () => {
  const { sessionId, profile } = useAuth();
  const [weekDate, setWeekDate] = useState(toISODate(new Date()));
  const [loads, setLoads] = useState<WeeklyLoadEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [substitutionDetails, setSubstitutionDetails] = useState<SubstitutionDetail[]>([]);
  const [globalLimit, setGlobalLimit] = useState(DEFAULT_WEEKLY_LIMIT);
  const [editGlobalLimit, setEditGlobalLimit] = useState(DEFAULT_WEEKLY_LIMIT);
  const [teacherLimits, setTeacherLimits] = useState<Record<string, number>>({});
  const [editTeacherLimit, setEditTeacherLimit] = useState<{ shortened: string; limit: number } | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const { monday, friday } = getWeekRange(weekDate);
  const isAdmin = (profile?.permission_lvl ?? 0) >= 10;

  const fetchSettings = useCallback(async () => {
    try {
      const { data: settingsData } = await supabase
        .from('substitution_settings' as any)
        .select('key, value')
        .eq('key', 'weekly_limit')
        .single();
      
      if (settingsData) {
        const val = typeof (settingsData as any).value === 'number' 
          ? (settingsData as any).value 
          : parseInt(String((settingsData as any).value), 10) || DEFAULT_WEEKLY_LIMIT;
        setGlobalLimit(val);
        setEditGlobalLimit(val);
      }

      const { data: limitsData } = await supabase
        .from('teacher_weekly_limits' as any)
        .select('teacher_shortened, weekly_limit');
      
      const map: Record<string, number> = {};
      for (const row of ((limitsData || []) as any[])) {
        map[row.teacher_shortened] = row.weekly_limit;
      }
      setTeacherLimits(map);
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  }, []);

  const getTeacherLimit = useCallback((shortened: string) => teacherLimits[shortened] ?? globalLimit, [teacherLimits, globalLimit]);

  const fetchWeeklyLoads = useCallback(async () => {
    if (!sessionId) return;

    setLoading(true);
    try {
      const { data: teachers, error: tErr } = await supabase
        .from('teachers')
        .select('shortened, "first name", "last name", subjects');
      if (tErr) throw tErr;

      const scheduleTables = await fetchScheduleTables(sessionId, true);
      const scheduleData: Record<string, any[]> = {};
      for (const table of scheduleTables) {
        scheduleData[table.tableName] = table.schedule || [];
      }

      const { data: weekSubs, error: subErr } = await supabase
        .from('vertretungsplan')
        .select('substitute_teacher, period, date')
        .gte('date', monday)
        .lte('date', friday);
      if (subErr) throw subErr;

      const subCounts: Record<string, number> = {};
      const extractShortened = (name: string): string => {
        const match = name.match(/\(([^)]+)\)\s*$/);
        return match ? match[1].trim().toLowerCase() : name.trim().toLowerCase();
      };
      for (const sub of (weekSubs || [])) {
        if (sub.substitute_teacher) {
          const key = extractShortened(sub.substitute_teacher);
          subCounts[key] = (subCounts[key] || 0) + 1;
        }
      }

      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
      const timetableCounts: Record<string, number> = {};

      for (const rows of Object.values(scheduleData)) {
        for (const row of rows) {
          for (const day of days) {
            const cell = row[day] as string | null;
            if (!cell) continue;
            const entries = parseCell(cell);
            for (const e of entries) {
              if (e.teacher) {
                const norm = e.teacher.toLowerCase().trim();
                timetableCounts[norm] = (timetableCounts[norm] || 0) + 1;
              }
            }
          }
        }
      }

      const entries: WeeklyLoadEntry[] = (teachers || []).map(t => {
        const normShort = t.shortened.toLowerCase().trim();
        const timetableHours = timetableCounts[normShort] || 0;
        const substitutionHours = subCounts[normShort] || 0;
        const total = timetableHours + substitutionHours;
        const limit = getTeacherLimit(t.shortened);

        return {
          teacher: {
            shortened: t.shortened,
            firstName: t['first name'],
            lastName: t['last name'],
            subjects: t.subjects,
          },
          timetableHours,
          substitutionHours,
          total,
          remaining: limit - total,
          limit
        };
      });

      entries.sort((a, b) => b.total - a.total || a.teacher.lastName.localeCompare(b.teacher.lastName));
      setLoads(entries);
    } catch (err) {
      console.error('Error fetching weekly loads:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId, monday, friday, getTeacherLimit]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (globalLimit > 0) {
      fetchWeeklyLoads();
    }
  }, [weekDate, globalLimit, fetchWeeklyLoads]);

  const fetchTeacherDetails = async (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setShowHistory(true);

    const { data, error } = await supabase
      .from('vertretungsplan')
      .select('id, date, period, class_name, original_teacher, substitute_subject, original_subject, note')
      .eq('substitute_teacher', teacher.shortened)
      .gte('date', monday)
      .lte('date', friday)
      .order('date', { ascending: true });

    if (!error) setSubstitutionDetails(data || []);
  };

  const handleSaveGlobalLimit = async () => {
    if (!sessionId) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Keine aktive Sitzung.' });
      return;
    }
    setSavingSettings(true);
    try {
      const { data, error } = await supabase.functions.invoke('substitution-engine', {
        body: {
          action: 'update_settings',
          sessionId,
          data: { key: 'weekly_limit', value: editGlobalLimit }
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Speichern fehlgeschlagen');

      setGlobalLimit(editGlobalLimit);
      toast({ title: 'Gespeichert', description: `Globales Wochenlimit auf ${editGlobalLimit} UE gesetzt.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveTeacherLimit = async () => {
    if (!editTeacherLimit || !sessionId) return;
    setSavingSettings(true);
    try {
      const { data, error } = await supabase.functions.invoke('substitution-engine', {
        body: {
          action: 'update_teacher_limit',
          sessionId,
          data: { teacher_shortened: editTeacherLimit.shortened, weekly_limit: editTeacherLimit.limit }
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Speichern fehlgeschlagen');

      setTeacherLimits(prev => ({ ...prev, [editTeacherLimit.shortened]: editTeacherLimit.limit }));
      setEditTeacherLimit(null);
      toast({ title: 'Gespeichert', description: `Limit für ${editTeacherLimit.shortened} auf ${editTeacherLimit.limit} UE gesetzt.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleResetTeacherLimit = async (shortened: string) => {
    if (!sessionId) return;
    try {
      const { data, error } = await supabase.functions.invoke('substitution-engine', {
        body: {
          action: 'delete_teacher_limit',
          sessionId,
          data: { teacher_shortened: shortened }
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Löschen fehlgeschlagen');

      setTeacherLimits(prev => {
        const next = { ...prev };
        delete next[shortened];
        return next;
      });
      toast({ title: 'Zurückgesetzt', description: `${shortened} nutzt wieder das globale Limit (${globalLimit} UE).` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    }
  };

  const handleExportCSV = () => {
    if (loads.length === 0) return;
    const header = 'Kürzel;Name;Stundenplan;Vertretungen;Gesamt;Verbleibend;Limit\n';
    const rows = loads.map(l =>
      `${l.teacher.shortened};${l.teacher.firstName} ${l.teacher.lastName};${l.timetableHours};${l.substitutionHours};${l.total};${l.remaining};${l.limit}`
    ).join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wochenauslastung_${monday}_${friday}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrevWeek = () => {
    const d = new Date(weekDate + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    setWeekDate(toISODate(d));
  };

  const handleNextWeek = () => {
    const d = new Date(weekDate + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    setWeekDate(toISODate(d));
  };

  const handleThisWeek = () => {
    setWeekDate(toISODate(new Date()));
  };

  const getProgressColor = (total: number, limit: number) => {
    const pct = (total / limit) * 100;
    if (pct >= 100) return 'bg-destructive';
    if (pct >= 80) return 'bg-yellow-500';
    return 'bg-primary';
  };

  return (
    <>
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Lehrer-Wochenauslastung
              <Badge variant="outline" className="ml-2">{globalLimit} UE/Woche</Badge>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => { e.stopPropagation(); setShowSettings(true); }}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}
              {!expanded && loads.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  {loads.length} Lehrer
                </span>
              )}
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </CardTitle>
        </CardHeader>

        {expanded && (
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handlePrevWeek}>←</Button>
                <Button variant="secondary" size="sm" onClick={handleThisWeek}>
                  <Calendar className="h-3 w-3 mr-1" />
                  Diese Woche
                </Button>
                <Button variant="outline" size="sm" onClick={handleNextWeek}>→</Button>
                <span className="text-sm text-muted-foreground ml-2">
                  {formatWeekLabel(monday, friday)}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={loads.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                CSV Export
              </Button>
            </div>

            {loading ? (
              <div className="text-center text-muted-foreground py-6">Lade Auslastung...</div>
            ) : loads.length === 0 ? (
              <div className="text-center text-muted-foreground py-6">
                Keine Lehrerdaten verfügbar.
              </div>
            ) : (
              <div className="space-y-3">
                {loads.map(l => {
                  const pct = Math.min((l.total / l.limit) * 100, 100);
                  const hasOverride = l.teacher.shortened in teacherLimits;

                  return (
                    <div
                      key={l.teacher.shortened}
                      className="p-3 border rounded-lg hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => fetchTeacherDetails(l.teacher)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{l.teacher.firstName} {l.teacher.lastName}</span>
                          <Badge variant="outline" className="text-xs">{l.teacher.shortened}</Badge>
                          {hasOverride && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0">
                              Limit: {l.limit}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {l.remaining <= 0 && (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                          )}
                          <span className={`text-sm font-medium ${l.remaining <= 0 ? 'text-destructive' : l.remaining <= 2 ? 'text-yellow-600' : 'text-foreground'}`}>
                            {l.total}/{l.limit}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({l.timetableHours} Plan + {l.substitutionHours} Vertr.)
                          </span>
                        </div>
                      </div>
                      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`absolute left-0 top-0 h-full rounded-full transition-all ${getProgressColor(l.total, l.limit)}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Detail Dialog */}
      {showHistory && selectedTeacher && (
        <Dialog open={showHistory} onOpenChange={setShowHistory}>
          <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Wochendetails – {selectedTeacher.firstName} {selectedTeacher.lastName} ({selectedTeacher.shortened})
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="p-3 bg-muted/50 rounded text-sm">
                <p><strong>Woche:</strong> {formatWeekLabel(monday, friday)}</p>
                {(() => {
                  const entry = loads.find(l => l.teacher.shortened === selectedTeacher.shortened);
                  if (!entry) return null;
                  return (
                    <>
                      <p><strong>Stundenplan:</strong> {entry.timetableHours} UE</p>
                      <p><strong>Vertretungen:</strong> {entry.substitutionHours} UE</p>
                      <p><strong>Gesamt:</strong> {entry.total}/{entry.limit} UE</p>
                      <p><strong>Verbleibend:</strong> {entry.remaining} UE</p>
                    </>
                  );
                })()}
              </div>

              {/* Per-teacher limit override (admin only) */}
              {isAdmin && (
                <div className="p-3 border rounded-lg space-y-2">
                  <Label className="text-sm font-medium">Individuelles Wochenlimit</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      className="w-24"
                      value={editTeacherLimit?.shortened === selectedTeacher.shortened
                        ? editTeacherLimit.limit
                        : teacherLimits[selectedTeacher.shortened] ?? globalLimit
                      }
                      onChange={e => setEditTeacherLimit({
                        shortened: selectedTeacher.shortened,
                        limit: parseInt(e.target.value) || globalLimit
                      })}
                    />
                    <span className="text-sm text-muted-foreground">UE/Woche</span>
                    <Button
                      size="sm"
                      onClick={handleSaveTeacherLimit}
                      disabled={savingSettings || !editTeacherLimit || editTeacherLimit.shortened !== selectedTeacher.shortened}
                    >
                      <Save className="h-3 w-3 mr-1" />
                      Speichern
                    </Button>
                    {selectedTeacher.shortened in teacherLimits && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResetTeacherLimit(selectedTeacher.shortened)}
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Globales Limit: {globalLimit} UE. Override setzt ein individuelles Limit für diesen Lehrer.
                  </p>
                </div>
              )}

              <h4 className="font-medium text-sm">Vertretungen diese Woche:</h4>
              {substitutionDetails.length === 0 ? (
                <p className="text-muted-foreground text-sm py-2 text-center">Keine Vertretungen diese Woche.</p>
              ) : (
                substitutionDetails.map(d => (
                  <div key={d.id} className="p-2 border rounded text-sm flex justify-between">
                    <div>
                      <span className="font-medium">
                        {new Date(d.date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                      </span>
                      <span className="ml-2">{d.period}. Std</span>
                      <span className="ml-2 text-muted-foreground">{d.class_name}</span>
                      <span className="ml-2 text-muted-foreground">({d.substitute_subject || d.original_subject})</span>
                    </div>
                    <span className="text-xs text-muted-foreground">für {d.original_teacher}</span>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Settings Dialog (Admin) */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Vertretungs-Einstellungen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-medium">Globales Wochenlimit (UE)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={editGlobalLimit}
                  onChange={e => setEditGlobalLimit(parseInt(e.target.value) || DEFAULT_WEEKLY_LIMIT)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">Unterrichtseinheiten pro Woche</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Standard-Limit für alle Lehrer. Kann pro Lehrer in der Detailansicht überschrieben werden.
              </p>
            </div>

            {Object.keys(teacherLimits).length > 0 && (
              <div className="space-y-2">
                <Label className="font-medium text-sm">Individuelle Overrides</Label>
                <div className="space-y-1">
                  {Object.entries(teacherLimits).map(([short, limit]) => (
                    <div key={short} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded">
                      <span>{short}: <strong>{limit}</strong> UE</span>
                      <Button size="sm" variant="ghost" onClick={() => handleResetTeacherLimit(short)}>
                        Entfernen
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={handleSaveGlobalLimit} disabled={savingSettings} className="w-full">
              <Save className="h-4 w-4 mr-2" />
              Globales Limit speichern
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TeacherQuotaDashboard;
