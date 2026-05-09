import { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle, X, ArrowRight, Download } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import readXlsxFile from 'read-excel-file';

interface ImportRow {
  date: string;
  class_name: string;
  period: number;
  original_teacher: string;
  original_subject: string; // auto-fetched from timetable
  original_room: string;
  substitute_teacher: string;
  substitute_subject: string;
  substitute_room: string;
  note: string;
  valid: boolean;
  errors: string[];
}

type ColumnMapping = Record<string, string>;

// original_subject is NO LONGER required from the import file - it's auto-resolved
const REQUIRED_FIELDS = ['date', 'class_name', 'period', 'original_teacher'];
const FIELD_LABELS: Record<string, string> = {
  date: 'Datum',
  class_name: 'Klasse',
  period: 'Stunde',
  original_teacher: 'Lehrer (Original)',
  original_room: 'Raum (Original)',
  substitute_teacher: 'Vertretungslehrer',
  substitute_subject: 'Vertretungsfach',
  substitute_room: 'Vertretungsraum',
  note: 'Notiz'
};

// Common column name synonyms for auto-mapping
const COLUMN_SYNONYMS: Record<string, string[]> = {
  date: ['datum', 'date', 'tag', 'day'],
  class_name: ['klasse', 'class', 'class_name', 'kl', 'kurs'],
  period: ['stunde', 'period', 'std', 'std.', 'hour', 'ue'],
  original_teacher: ['lehrer', 'teacher', 'original_teacher', 'lehrkraft', 'abwesend'],
  original_room: ['raum', 'room', 'original_room', 'zimmer'],
  substitute_teacher: ['vertretung', 'vertretungslehrer', 'substitute_teacher', 'vertreter', 'ersatz'],
  substitute_subject: ['vertretungsfach', 'substitute_subject', 'ersatzfach'],
  substitute_room: ['vertretungsraum', 'substitute_room', 'ersatzraum'],
  note: ['notiz', 'note', 'bemerkung', 'anmerkung', 'info']
};

interface SubstitutionImportProps {
  onImported?: () => void;
}

// Parse timetable cell
const parseCell = (cell?: string) => {
  if (!cell) return [] as Array<{ subject: string; teacher: string; room: string }>;
  return cell.split('|').map(s => s.trim()).filter(Boolean).map(sub => {
    const parts = sub.split(/\s+/).filter(Boolean);
    if (parts.length >= 3) return { subject: parts[0], teacher: parts[1], room: parts.slice(2).join(' ') };
    if (parts.length === 2) return { subject: parts[0], teacher: parts[1], room: '' };
    return { subject: sub, teacher: '', room: '' };
  });
};

const SubstitutionImport = ({ onImported }: SubstitutionImportProps) => {
  const { sessionId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<any[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [showMapping, setShowMapping] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState('');

  const autoMapColumns = (headers: string[]): ColumnMapping => {
    const result: ColumnMapping = {};
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim().replace(/[^a-zäöü0-9]/g, ''));

    for (const [field, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
      for (let i = 0; i < normalizedHeaders.length; i++) {
        if (synonyms.some(syn => normalizedHeaders[i].includes(syn))) {
          result[field] = headers[i];
          break;
        }
      }
    }
    return result;
  };

  const parseFile = async (file: File) => {
    setFileName(file.name);
    const ext = file.name.toLowerCase().split('.').pop();

    try {
      let headers: string[] = [];
      let data: any[] = [];

      if (ext === 'csv') {
        const text = await file.text();
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) throw new Error('CSV muss mindestens eine Kopfzeile und eine Datenzeile enthalten.');

        const sep = lines[0].includes(';') ? ';' : ',';
        headers = lines[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g, ''));
        data = lines.slice(1).map(line => {
          const values = line.split(sep).map(v => v.trim().replace(/^["']|["']$/g, ''));
          const row: Record<string, string> = {};
          headers.forEach((h, i) => { row[h] = values[i] || ''; });
          return row;
        });
      } else if (ext === 'xlsx') {
        const rows = await readXlsxFile(file);

        if (rows.length < 2) throw new Error('Tabelle muss mindestens eine Kopfzeile und eine Datenzeile enthalten.');

        headers = rows[0].map(h => String(h || '').trim());
        data = rows
          .slice(1)
          .filter(row => row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== ''))
          .map(row => {
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => { obj[h] = String(row[i] ?? '').trim(); });
          return obj;
        });
      } else {
        throw new Error(`Dateityp .${ext} wird nicht unterstützt. Bitte CSV oder Excel (.xlsx) verwenden.`);
      }

      setRawHeaders(headers);
      setRawData(data);

      const autoMapping = autoMapColumns(headers);
      setMapping(autoMapping);
      setShowMapping(true);

      toast({ title: 'Datei gelesen', description: `${data.length} Zeilen und ${headers.length} Spalten erkannt.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler beim Lesen', description: err.message });
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = '';
  };

  const parseDate = (value: string): string | null => {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const dmy = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    const dmy2 = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy2) return `${dmy2[3]}-${dmy2[2].padStart(2, '0')}-${dmy2[1].padStart(2, '0')}`;
    return null;
  };

  // Resolve original subject from timetable based on date, period, class, teacher
  const resolveSubjectFromTimetable = async (
    date: string,
    period: number,
    className: string,
    teacher: string
  ): Promise<{ subject: string; room: string }> => {
    // Determine day of week
    const d = new Date(date + 'T12:00:00');
    const dow = d.getDay();
    const dayMap: Record<number, string> = { 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday' };
    const col = dayMap[dow];
    if (!col) return { subject: 'Unbekannt', room: 'Unbekannt' };

    // Determine which timetable table to check
    const classNorm = className.toLowerCase().trim();
    const tableMap: Record<string, string> = {
      '10b': 'Stundenplan_10b_A',
      '10c': 'Stundenplan_10c_A',
    };

    const tableName = tableMap[classNorm];
    if (!tableName) {
      // Fallback: try room_schedule
      const { data: rsData } = await supabase
        .from('room_schedule')
        .select('subject, room_name')
        .eq('day_of_week', col)
        .eq('period', period)
        .ilike('class_name', classNorm)
        .ilike('teacher_shortened', teacher)
        .limit(1);
      
      if (rsData && rsData.length > 0) {
        return { subject: rsData[0].subject, room: rsData[0].room_name };
      }
      return { subject: 'Unbekannt', room: 'Unbekannt' };
    }

    // Query the specific timetable table
      const { data: rows } = await supabase
        .from(tableName as 'Stundenplan_10b_A')
        .select('*')
        .eq('Stunde', period);

    if (rows && rows.length > 0) {
      const row = rows[0];
      const cell = row[col] as string | null;
      if (cell) {
        const entries = parseCell(cell);
        const teacherNorm = teacher.toLowerCase().trim();
        const match = entries.find(e => e.teacher.toLowerCase().trim() === teacherNorm);
        if (match) {
          return { subject: match.subject, room: match.room || 'Unbekannt' };
        }
        // If no teacher match, return first entry's subject
        if (entries.length > 0) {
          return { subject: entries[0].subject, room: entries[0].room || 'Unbekannt' };
        }
      }
    }

    return { subject: 'Unbekannt', room: 'Unbekannt' };
  };

  const handleApplyMapping = async () => {
    const missingRequired = REQUIRED_FIELDS.filter(f => !mapping[f]);
    if (missingRequired.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Fehlende Zuordnung',
        description: `Folgende Pflichtfelder sind nicht zugeordnet: ${missingRequired.map(f => FIELD_LABELS[f]).join(', ')}`
      });
      return;
    }

    toast({ title: 'Verarbeite...', description: 'Fächer werden aus dem Stundenplan aufgelöst.' });

    // Transform raw data using mapping, resolving subjects from timetable
    const rows: ImportRow[] = [];

    for (const raw of rawData) {
      const errors: string[] = [];
      const getValue = (field: string) => raw[mapping[field]] || '';

      const dateStr = parseDate(getValue('date'));
      if (!dateStr) errors.push('Ungültiges Datum');

      const periodRaw = getValue('period');
      const period = parseInt(periodRaw);
      if (isNaN(period) || period < 1 || period > 12) errors.push('Ungültige Stunde (1-12)');

      const className = getValue('class_name');
      if (!className) errors.push('Klasse fehlt');

      const originalTeacher = getValue('original_teacher');
      if (!originalTeacher) errors.push('Lehrer fehlt');

      // Auto-resolve subject and room from timetable
      let originalSubject = 'Unbekannt';
      let originalRoom = getValue('original_room') || 'Unbekannt';

      if (dateStr && !isNaN(period) && className && originalTeacher) {
        try {
          const resolved = await resolveSubjectFromTimetable(dateStr, period, className, originalTeacher);
          originalSubject = resolved.subject;
          if (originalRoom === 'Unbekannt' && resolved.room !== 'Unbekannt') {
            originalRoom = resolved.room;
          }
        } catch (e) {
          console.error('Error resolving subject:', e);
        }
      }

      rows.push({
        date: dateStr || '',
        class_name: className,
        period: isNaN(period) ? 0 : period,
        original_teacher: originalTeacher,
        original_subject: originalSubject,
        original_room: originalRoom,
        substitute_teacher: getValue('substitute_teacher') || '',
        substitute_subject: getValue('substitute_subject') || originalSubject,
        substitute_room: getValue('substitute_room') || originalRoom,
        note: getValue('note') || 'Importiert',
        valid: errors.length === 0,
        errors
      });
    }

    setImportRows(rows);
    setShowMapping(false);
    setShowPreview(true);
  };

  const handleImport = async () => {
    const validRows = importRows.filter(r => r.valid);
    if (validRows.length === 0) {
      toast({ variant: 'destructive', title: 'Keine gültigen Zeilen', description: 'Es gibt keine importierbaren Daten.' });
      return;
    }

    setImporting(true);
    try {
      let successCount = 0;
      let errorCount = 0;

      for (const entry of validRows) {
        try {
          const { data, error } = await supabase.rpc('create_vertretung_session', {
            v_date: entry.date,
            v_class_name: entry.class_name,
            v_period: entry.period,
            v_original_subject: entry.original_subject,
            v_original_teacher: entry.original_teacher,
            v_original_room: entry.original_room,
            v_substitute_teacher: entry.substitute_teacher || '',
            v_substitute_subject: entry.substitute_subject,
            v_substitute_room: entry.substitute_room,
            v_note: entry.note,
            v_session_id: sessionId
          });

          if (error || !(data as any)?.success) {
            errorCount++;
            console.error('Import error for entry:', entry, error || (data as any)?.error);
          } else {
            successCount++;
          }
        } catch (e) {
          errorCount++;
          console.error('Import exception:', e);
        }
      }

      toast({
        title: 'Import abgeschlossen',
        description: `${successCount} Vertretung(en) importiert${errorCount > 0 ? `, ${errorCount} Fehler` : ''}.`
      });

      setShowPreview(false);
      setImportRows([]);
      setRawData([]);
      setRawHeaders([]);
      onImported?.();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Import-Fehler', description: err.message });
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const header = 'Datum;Klasse;Stunde;Lehrer;Vertretungslehrer;Vertretungsfach;Vertretungsraum;Notiz\n';
    const example = '15.01.2026;10b;3;Kön;Mül;Mathematik;R201;Vertretung\n';
    const blob = new Blob([header + example], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vertretungsplan_vorlage.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Vertretungsplan importieren
            <Badge variant="outline" className="ml-2">CSV / Excel</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              dragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            }`}
            onDragOver={e => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium">
              Datei hierher ziehen oder klicken zum Auswählen
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              CSV (.csv) oder Excel (.xlsx) – Vertretungspläne
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Das Original-Fach wird automatisch aus dem Stundenplan ermittelt.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="w-full">
            <Download className="h-4 w-4 mr-2" />
            Vorlage herunterladen (CSV)
          </Button>
        </CardContent>
      </Card>

      {/* Column Mapping Dialog */}
      <Dialog open={showMapping} onOpenChange={setShowMapping}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRight className="h-5 w-5" />
              Spalten zuordnen – {fileName}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            Ordne die Spalten deiner Datei den Vertretungsplan-Feldern zu. * = Pflichtfeld
          </p>
          <p className="text-xs text-muted-foreground mb-4 p-2 bg-muted/50 rounded">
            💡 Das Original-Fach wird automatisch aus dem Stundenplan ermittelt (Datum + Stunde + Klasse + Lehrer).
          </p>
          <div className="space-y-3">
            {Object.entries(FIELD_LABELS).map(([field, label]) => (
              <div key={field} className="flex items-center gap-3">
                <Label className="w-40 text-sm shrink-0">
                  {label}
                  {REQUIRED_FIELDS.includes(field) && <span className="text-destructive ml-1">*</span>}
                </Label>
                <Select
                  value={mapping[field] || '_none_'}
                  onValueChange={v => setMapping(prev => ({ ...prev, [field]: v === '_none_' ? '' : v }))}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="– nicht zugeordnet –" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none_">– nicht zugeordnet –</SelectItem>
                    {rawHeaders.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowMapping(false)} className="flex-1">Abbrechen</Button>
            <Button onClick={handleApplyMapping} className="flex-1">
              <CheckCircle className="h-4 w-4 mr-2" />
              Zuordnung anwenden
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Import-Vorschau – {importRows.length} Zeilen
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-4 text-sm mb-4">
            <Badge variant="default" className="gap-1">
              <CheckCircle className="h-3 w-3" />
              {importRows.filter(r => r.valid).length} gültig
            </Badge>
            {importRows.filter(r => !r.valid).length > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {importRows.filter(r => !r.valid).length} fehlerhaft
              </Badge>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted">
                  <th className="p-2 text-left border">Status</th>
                  <th className="p-2 text-left border">Datum</th>
                  <th className="p-2 text-left border">Klasse</th>
                  <th className="p-2 text-left border">Std</th>
                  <th className="p-2 text-left border">Lehrer</th>
                  <th className="p-2 text-left border">Fach (auto)</th>
                  <th className="p-2 text-left border">Vertretung</th>
                  <th className="p-2 text-left border">Notiz</th>
                </tr>
              </thead>
              <tbody>
                {importRows.map((row, idx) => (
                  <tr key={idx} className={row.valid ? '' : 'bg-destructive/10'}>
                    <td className="p-2 border">
                      {row.valid ? (
                        <CheckCircle className="h-4 w-4 text-primary" />
                      ) : (
                        <span title={row.errors.join(', ')}>
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                        </span>
                      )}
                    </td>
                    <td className="p-2 border">{row.date}</td>
                    <td className="p-2 border">{row.class_name}</td>
                    <td className="p-2 border">{row.period}</td>
                    <td className="p-2 border">{row.original_teacher}</td>
                    <td className="p-2 border text-xs italic">{row.original_subject}</td>
                    <td className="p-2 border">{row.substitute_teacher || 'Entfall'}</td>
                    <td className="p-2 border text-xs">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {importRows.some(r => !r.valid) && (
            <div className="text-sm text-destructive mt-2">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              Fehlerhafte Zeilen werden beim Import übersprungen.
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowPreview(false)} className="flex-1">Abbrechen</Button>
            <Button onClick={handleImport} disabled={importing || importRows.filter(r => r.valid).length === 0} className="flex-1">
              {importing ? 'Importiere...' : (
                <><CheckCircle className="h-4 w-4 mr-2" />{importRows.filter(r => r.valid).length} Vertretung(en) importieren</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SubstitutionImport;
