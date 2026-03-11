import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Bot, Zap, Users, Calendar, CheckCircle, AlertTriangle, Brain, ChevronDown, ChevronUp, CalendarRange, ShieldAlert, Clock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface Teacher {
  shortened: string;
  'first name': string;
  'last name': string;
  subjects: string;
  fav_rooms?: string | null;
}

interface SwapSuggestion {
  fromPeriod: number;
  toPeriod: number;
  subject: string;
  subjectAbbrev: string;
  teacher: string;
  room: string;
  description: string;
}

interface SubstitutionSuggestion {
  className: string;
  period: number;
  subject: string;
  subjectAbbrev?: string;
  room: string;
  substituteRoom?: string;
  originalTeacher: string;
  suggestedSubstitute: string | null;
  substituteShortened: string | null;
  substituteSubjects: string | null;
  reason: string;
  score: number;
  alternativeSubject?: string | null;
  alternativeSubjectAbbrev?: string | null;
  weeklyLoad?: { current: number; max: number; remaining: number } | null;
  selected: boolean;
  date?: string;
  isCascade?: boolean;
  originalVertretungId?: string | null;
  swapSuggestion?: SwapSuggestion | null;
}

interface SubstitutionEngineProps {
  onGenerated?: (targetDate?: string) => void;
}

const SubstitutionEngine = ({ onGenerated }: SubstitutionEngineProps) => {
  const { profile, sessionId } = useAuth();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SubstitutionSuggestion[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [mode, setMode] = useState<'auto' | 'assisted'>('assisted');
  const [showDetails, setShowDetails] = useState(false);
  const [isRange, setIsRange] = useState(false);
  const [isPeriodBased, setIsPeriodBased] = useState(false);
  const [periodRange, setPeriodRange] = useState<[number, number]>([1, 8]);
  const [excludedSickTeachers, setExcludedSickTeachers] = useState<string[]>([]);
  const [weeklyLimit, setWeeklyLimit] = useState(26);

  useEffect(() => {
    fetchTeachers();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getDay() === 6) tomorrow.setDate(tomorrow.getDate() + 2);
    const d = toISODate(tomorrow);
    setDateFrom(d);
    setDateTo(d);
  }, []);

  const toISODate = (d: Date) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const fetchTeachers = async () => {
    const { data, error } = await supabase
      .from('teachers')
      .select('shortened, "first name", "last name", subjects, fav_rooms')
      .order('"last name"');
    if (!error && data) {
      setTeachers(data);
      if (data.length > 0) setSelectedTeacher(data[0].shortened);
    }
  };

  const handleGenerate = async () => {
    if (!selectedTeacher || !dateFrom) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Bitte Lehrer und Datum auswählen.' });
      return;
    }

    setLoading(true);
    try {
      const useRange = isRange && dateTo && dateTo !== dateFrom;
      const periodParams = isPeriodBased ? { periodFrom: periodRange[0], periodTo: periodRange[1] } : {};

      const { data, error } = await supabase.functions.invoke('substitution-engine', {
        body: {
          action: useRange ? 'find_substitutions_range' : 'find_substitutions',
          sessionId,
          data: useRange
            ? { absentTeacher: selectedTeacher, dateFrom, dateTo, mode, ...periodParams }
            : { absentTeacher: selectedTeacher, date: dateFrom, mode, ...periodParams }
        }
      });

      if (error) {
        console.error('[SubstitutionEngine] Edge function error:', error);
        throw new Error('Die Edge Function hat nicht rechtzeitig geantwortet. Bitte erneut versuchen.');
      }
      if (!data) {
        throw new Error('Keine Antwort von der Edge Function erhalten (möglicherweise Timeout).');
      }
      if (!data?.success) throw new Error(data?.error || 'Fehler beim Generieren');

      setWeeklyLimit(data.weeklyLimit || 26);
      setExcludedSickTeachers(data.excludedSickTeachers || []);

      let subs: SubstitutionSuggestion[];

      if (useRange && data.dayResults) {
        // Flatten day results
        subs = [];
        for (const [day, daySuggestions] of Object.entries(data.dayResults)) {
          for (const s of (daySuggestions as any[])) {
            subs.push({ ...s, date: day, selected: s.suggestedSubstitute !== null });
          }
        }
      } else {
        subs = (data.suggestions || []).map((s: any) => ({
          ...s,
          selected: s.suggestedSubstitute !== null
        }));
      }

      if (subs.length === 0) {
        const debugInfo = data.debug;
        if (debugInfo && debugInfo.totalScheduleRows === 0) {
          toast({ 
            variant: 'destructive', 
            title: 'Keine Stundenplan-Daten', 
            description: 'Es konnten keine Stundenplan-Tabellen geladen werden. Bitte prüfen Sie die Datenbank-Tabellen und RLS-Policies.' 
          });
          console.error('[SubstitutionEngine] Schedule debug info:', debugInfo.scheduleInfo);
        } else {
          const tableInfo = debugInfo?.scheduleInfo 
            ? Object.entries(debugInfo.scheduleInfo)
                .map(([t, info]: [string, any]) => `${t}: ${info.rows ?? 0} Zeilen${info.error ? ` (Fehler: ${info.error})` : ''}`)
                .join(', ')
            : '';
          toast({ 
            title: 'Keine Stunden', 
            description: `Der Lehrer unterrichtet in diesem Zeitraum nicht.${tableInfo ? ` [Debug: ${tableInfo}]` : ''}` 
          });
        }
        setLoading(false);
        return;
      }

      setSuggestions(subs);
      setShowConfirmation(true);

      const assigned = subs.filter(s => s.suggestedSubstitute).length;
      const cancelled = subs.length - assigned;
      toast({
        title: `${subs.length} Stunde(n) gefunden`,
        description: `${assigned} Vertretung(en) vorgeschlagen, ${cancelled} Ausfall/Entfall.`
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const toggleSuggestion = (idx: number) => {
    setSuggestions(prev => prev.map((s, i) => i === idx ? { ...s, selected: !s.selected } : s));
  };

  const handleConfirm = async () => {
    const selected = suggestions.filter(s => s.selected);
    if (selected.length === 0) {
      toast({ variant: 'destructive', title: 'Nichts ausgewählt', description: 'Bitte mindestens eine Vertretung auswählen.' });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('substitution-engine', {
        body: {
          action: 'confirm_substitutions',
          sessionId,
          data: {
            date: dateFrom,
            absentTeacher: selectedTeacher,
            substitutions: selected.map(s => ({
              className: s.className,
              period: s.period,
              subject: s.subject,
              room: s.room,
              substituteRoom: s.substituteRoom || s.room,
              originalTeacher: s.originalTeacher,
              substituteTeacher: s.suggestedSubstitute || '',
              substituteShortened: s.substituteShortened || '',
              alternativeSubject: s.alternativeSubject || null,
              date: s.date || dateFrom,
              isCascade: s.isCascade || false,
              originalVertretungId: s.originalVertretungId || null,
              swapSuggestion: s.swapSuggestion || null
            }))
          }
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Fehler beim Speichern');

      toast({ title: 'Vertretungsplan gespeichert', description: `${data.created} Vertretung(en) eingetragen.` });
      setShowConfirmation(false);
      setSuggestions([]);
      setExcludedSickTeachers([]);
      // Pass the date so the parent can navigate to the correct week
      onGenerated?.(dateFrom);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const teacher = teachers.find(t => t.shortened === selectedTeacher);
  const teacherLabel = teacher ? `${teacher['first name']} ${teacher['last name']} (${teacher.shortened})` : selectedTeacher;

  // Group suggestions by date for range view
  const groupedByDate = suggestions.reduce((acc, s) => {
    const d = s.date || dateFrom;
    if (!acc[d]) acc[d] = [];
    acc[d].push(s);
    return acc;
  }, {} as Record<string, SubstitutionSuggestion[]>);
  const sortedDates = Object.keys(groupedByDate).sort();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Intelligente Vertretungsvergabe
            <Badge variant="secondary" className="ml-2">
              <Zap className="h-3 w-3 mr-1" />
              Ausfallminimierung
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Abwesende Lehrkraft</Label>
              <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
                <SelectTrigger><SelectValue placeholder="Lehrkraft auswählen" /></SelectTrigger>
                <SelectContent>
                  {teachers.map(t => (
                    <SelectItem key={t.shortened} value={t.shortened}>
                      {t['first name']} {t['last name']} ({t.shortened})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">
                {isRange ? 'Von' : 'Datum'}
              </Label>
              <Input type="date" value={dateFrom} onChange={e => {
                setDateFrom(e.target.value);
                if (!isRange) setDateTo(e.target.value);
              }} />
            </div>
            {isRange && (
              <div>
                <Label className="text-sm font-medium mb-2 block">Bis</Label>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} min={dateFrom} />
              </div>
            )}
            <div>
              <Label className="text-sm font-medium mb-2 block">Modus</Label>
              <Select value={mode} onValueChange={(v: 'auto' | 'assisted') => setMode(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="assisted">Assistiert (Vorschläge)</SelectItem>
                  <SelectItem value="auto">Automatisch (AI entscheidet)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              id="range-mode"
              checked={isRange}
              onCheckedChange={(checked) => {
                setIsRange(!!checked);
                if (!checked) setDateTo(dateFrom);
              }}
            />
            <Label htmlFor="range-mode" className="text-sm cursor-pointer flex items-center gap-1">
              <CalendarRange className="h-4 w-4" />
              Mehrtägige Krankmeldung (Datumsbereich)
            </Label>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="period-mode"
              checked={isPeriodBased}
              onCheckedChange={setIsPeriodBased}
            />
            <Label htmlFor="period-mode" className="text-sm cursor-pointer flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Stundenweise Krankmeldung
            </Label>
          </div>

          {isPeriodBased && (
            <div className="p-3 bg-muted/50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Stunden-Bereich</Label>
                <Badge variant="outline">{periodRange[0]}. – {periodRange[1]}. Stunde</Badge>
              </div>
              <Slider
                min={1}
                max={8}
                step={1}
                value={periodRange}
                onValueChange={(value) => setPeriodRange(value as [number, number])}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1. Stunde</span>
                <span>8. Stunde</span>
              </div>
            </div>
          )}

          <Button onClick={handleGenerate} disabled={loading} className="w-full">
            {loading ? (
              <><Bot className="h-4 w-4 mr-2 animate-spin" />Analysiere Verfügbarkeit...</>
            ) : (
              <><Brain className="h-4 w-4 mr-2" />Vertretungsplan generieren</>
            )}
          </Button>

          <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded flex items-start gap-2">
            <Brain className="h-3 w-3 mt-0.5 shrink-0" />
            <span>
              Der Algorithmus prüft freie Stunden, Fach-Qualifikationen, Klassen-Beziehungen, 
              Wochenkontingent (Standard: {weeklyLimit} UE/Woche) und Lastverteilung, um 
              Unterrichtsausfälle zu minimieren. Bereits kranke Lehrer werden automatisch ausgeschlossen (Kaskade).
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-primary" />
              Vertretungsvorschläge für {teacherLabel}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Cascading info banner */}
            {excludedSickTeachers.length > 0 && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                <div>
                  <strong>Kaskadierung:</strong> Folgende Lehrer wurden als ebenfalls krank erkannt und 
                  von der Vertretungsvergabe ausgeschlossen: {excludedSickTeachers.join(', ')}
                </div>
              </div>
            )}

            <div className="p-3 bg-muted/50 rounded-lg text-sm">
              <p>
                <strong>Zeitraum:</strong>{' '}
                {isRange && dateTo !== dateFrom
                  ? `${new Date(dateFrom + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })} – ${new Date(dateTo + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}`
                  : new Date(dateFrom + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                }
              </p>
              <p className="mt-1">
                <strong>{suggestions.filter(s => s.suggestedSubstitute).length}</strong> Vertretungen vorgeschlagen,{' '}
                <strong>{suggestions.filter(s => !s.suggestedSubstitute).length}</strong> ohne Vertretung (Entfall)
              </p>
            </div>

            {sortedDates.map(day => (
              <div key={day}>
                {sortedDates.length > 1 && (
                  <h3 className="font-semibold text-sm mt-4 mb-2 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    {new Date(day + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </h3>
                )}
                <div className="space-y-2">
                  {groupedByDate[day].map((s, idx) => {
                    const globalIdx = suggestions.indexOf(s);
                    return (
                      <div
                        key={`${day}-${idx}`}
                        className={`p-3 rounded-lg border transition-colors ${
                          s.selected 
                            ? s.suggestedSubstitute 
                              ? 'border-primary/50 bg-primary/5' 
                              : 'border-destructive/50 bg-destructive/5'
                            : 'border-border bg-muted/30 opacity-60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1">
                            {mode === 'assisted' && (
                              <Checkbox
                                checked={s.selected}
                                onCheckedChange={() => toggleSuggestion(globalIdx)}
                                className="mt-1"
                              />
                            )}
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{s.period}. Stunde</Badge>
                                <span className="font-medium">{s.className}</span>
                                <span className="text-muted-foreground">
                                  – {s.alternativeSubjectAbbrev || s.subjectAbbrev || s.subject}
                                  {s.alternativeSubjectAbbrev && s.alternativeSubjectAbbrev !== (s.subjectAbbrev || s.subject) && (
                                    <span className="text-xs ml-1">(statt {s.subjectAbbrev || s.subject})</span>
                                  )}
                                </span>
                                <span className="text-muted-foreground text-xs">(Raum {s.substituteRoom || s.room})</span>
                                {s.isCascade && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 text-orange-600 border-orange-400">Kaskade</Badge>
                                )}
                              </div>
                              <div className="mt-1 text-sm">
                                {s.suggestedSubstitute ? (
                                  <span className="text-primary">
                                    → Vertretung: <strong>{s.suggestedSubstitute}</strong>
                                  </span>
                                ) : s.swapSuggestion ? (
                                  <span className="text-yellow-600 flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {s.swapSuggestion.description}
                                  </span>
                                ) : (
                                  <span className="text-destructive flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    Entfall – {s.reason}
                                  </span>
                                )}
                              </div>
                              {s.weeklyLoad && (
                                <div className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-1">
                                  <span>Wochenauslastung:</span>
                                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                                    {s.weeklyLoad.current + 1}/{s.weeklyLoad.max} UE
                                  </Badge>
                                  {s.weeklyLoad.remaining <= 0 && (
                                    <Badge variant="destructive" className="text-[10px] px-1 py-0">Wochenlimit erreicht</Badge>
                                  )}
                                  {s.weeklyLoad.remaining > 0 && s.weeklyLoad.remaining <= 2 && (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 text-yellow-600 border-yellow-400">Fast am Limit</Badge>
                                  )}
                                </div>
                              )}
                              {showDetails && (
                                <div className="mt-1 text-xs text-muted-foreground italic">
                                  Score: {s.score} – {s.reason}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
              className="w-full"
            >
              {showDetails ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
              {showDetails ? 'Details ausblenden' : 'Details anzeigen'}
            </Button>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowConfirmation(false)} className="flex-1">
                Abbrechen
              </Button>
              <Button onClick={handleConfirm} disabled={loading} className="flex-1">
                <CheckCircle className="h-4 w-4 mr-2" />
                {suggestions.filter(s => s.selected).length} Vertretung(en) speichern
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SubstitutionEngine;
