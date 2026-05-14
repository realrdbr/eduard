import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_WEEKLY_LIMIT = 26;
const MAX_CASCADE_DEPTH = 20; // Safety limit for recursive cascading

const normalize = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();

const canonicalSubject = (raw: string) => {
  const t = normalize(raw).replace(/[^a-z]/g, '');
  if (!t) return '';
  if (/^ma(th|t)?/.test(t)) return 'mathematik';
  if (/^de/.test(t)) return 'deutsch';
  if (/^en(g|)/.test(t)) return 'englisch';
  if (/^ru/.test(t)) return 'russisch';
  if (/^re(l|i)/.test(t)) return 'religion';
  if (/^ph(y|)/.test(t)) return 'physik';
  if (/^ch(em|)/.test(t)) return 'chemie';
  if (/^bio/.test(t)) return 'biologie';
  if (/^(geo|erk|ek)/.test(t)) return 'geografie';
  if (/^(inf|info|informatik)/.test(t)) return 'informatik';
  if (/^fr/.test(t)) return 'franzoesisch';
  if (/^(sp|spa|span)/.test(t)) return 'spanisch';
  if (/^lat/.test(t)) return 'latein';
  if (/^ku(nst)?$/.test(t)) return 'kunst';
  if (/^mu(sik)?$/.test(t)) return 'musik';
  if (/^sport$/.test(t)) return 'sport';
  if (/^eth(ik)?$/.test(t)) return 'ethik';
  if (/^grw$/.test(t)) return 'geschichte';
  if (/^p$/.test(t)) return 'profil';
  return t;
};

// Subject abbreviation mapping (canonical -> short)
const SUBJECT_ABBREV: Record<string, string> = {
  'mathematik': 'MA', 'deutsch': 'DE', 'englisch': 'EN',
  'religion': 'RELI', 'physik': 'PH', 'chemie': 'CH', 'biologie': 'BIO',
  'geografie': 'GEO', 'informatik': 'INF', 'franzoesisch': 'FR',
  'latein': 'LAT', 'kunst': 'KU', 'musik': 'MU',
  'sport': 'SPO', 'ethik': 'ETH', 'geschichte': 'GE', 'profil': 'P',
};

const toSubjectAbbrev = (raw: string): string => {
  if (!raw) return raw;
  const canon = canonicalSubject(raw);
  return SUBJECT_ABBREV[canon] || raw;
};

// Subject-based room preferences
const SUBJECT_ROOM_PREFS: Record<string, { preferred: string[]; required: boolean; fallback?: string[] }> = {
  'biologie': { preferred: ['201', '203', '301', '303'], required: false },
  'chemie':   { preferred: ['201', '203', '301', '303'], required: false },
  'physik':   { preferred: ['101', '103'], required: false, fallback: ['201', '203', '301', '303'] },
  'geografie': { preferred: ['305'], required: false },
  'informatik': { preferred: ['204', '206'], required: false },
  'sport':    { preferred: ['H1', 'H2', 'H3'], required: true }, // MUST be in H1/H2/H3
};
const GENERAL_ROOMS = ['222', '223', '224', '225', '226', '208', '209', '210', '308', '309'];
const ALL_VALID_ROOMS = new Set([
  '101', '103', '201', '203', '204', '206', '222', '223', '224', '225', '226',
  '208', '209', '210', '301', '303', '305', '308', '309', 'H1', 'H2', 'H3'
]);

// Find best available room for a subject, given occupied rooms for that period
const findBestRoom = (
  subject: string,
  period: number,
  occupiedRooms: Set<string>
): string | null => {
  const canon = canonicalSubject(subject);
  const pref = SUBJECT_ROOM_PREFS[canon];

  if (pref) {
    // Try preferred rooms first
    for (const room of pref.preferred) {
      if (!occupiedRooms.has(room)) return room;
    }
    // Try subject-specific fallback rooms
    if (pref.fallback) {
      for (const room of pref.fallback) {
        if (!occupiedRooms.has(room)) return room;
      }
    }
    // If required (sport), no general fallback
    if (pref.required) return null;
  }

  // Fallback to general rooms
  for (const room of GENERAL_ROOMS) {
    if (!occupiedRooms.has(room)) return room;
  }

  return null;
};

const subjectsToSet = (subjects: string) => {
  const set = new Set<string>();
  const raw = subjects || '';
  if (/\bg\s*\/\s*r\s*\/\s*w\b/i.test(raw) || /\bgrw\b/i.test(normalize(raw))) {
    set.add('geschichte');
  }
  raw.split(/[^a-zA-ZäöüÄÖÜß]+/).map(s => s.trim()).filter(Boolean).forEach(token => {
    const canon = canonicalSubject(token);
    if (canon) set.add(canon);
  });
  return set;
};

const parseCell = (cell?: string) => {
  if (!cell) return [] as Array<{ subject: string; teacher: string; room: string }>;
  return cell.split('|').map(s => s.trim()).filter(Boolean).map(sub => {
    const parts = sub.split(/\s+/).filter(Boolean);
    if (parts.length >= 3) return { subject: parts[0], teacher: parts[1], room: parts.slice(2).join(' ') };
    if (parts.length === 2) return { subject: parts[0], teacher: parts[1], room: 'Unbekannt' };
    return { subject: sub, teacher: '', room: 'Unbekannt' };
  });
};

const getWeekRange = (dateStr: string) => {
  const d = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay();
  const daysToMon = dow === 0 ? 6 : dow - 1;
  const mon = new Date(d);
  mon.setDate(mon.getDate() - daysToMon);
  const fri = new Date(mon);
  fri.setDate(fri.getDate() + 4);
  const iso = (dt: Date) => dt.toISOString().substring(0, 10);
  return { monday: iso(mon), friday: iso(fri) };
};

const countTimetablePeriods = (
  teacherAbbr: string,
  col: string,
  scheduleData: Record<string, any[]>
): number => {
  const norm = normalize(teacherAbbr);
  let count = 0;
  for (const rows of Object.values(scheduleData)) {
    for (const r of rows) {
      const cell = r[col] as string | null;
      if (!cell) continue;
      const entries = parseCell(cell);
      for (const e of entries) {
        if (normalize(e.teacher) === norm) count++;
      }
    }
  }
  return count;
};

// Batch: load ALL weekly substitutions once, return counts per teacher
const batchCountWeeklySubstitutions = (
  weekSubsData: any[],
  teacherShortened: string
): number => {
  const norm = normalize(teacherShortened);
  return (weekSubsData || []).filter((row: any) => {
    const st = (row.substitute_teacher || '').trim();
    if (!st) return false;
    if (normalize(st) === norm) return true;
    const match = st.match(/\(([^)]+)\)\s*$/);
    return match && normalize(match[1]) === norm;
  }).length;
};

const calculateWeeklyLoadBatched = (
  teacherShortened: string,
  scheduleData: Record<string, any[]>,
  weekSubsData: any[]
): { timetableHours: number; substitutionHours: number; total: number } => {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  let timetableHours = 0;
  for (const day of days) {
    timetableHours += countTimetablePeriods(teacherShortened, day, scheduleData);
  }
  const substitutionHours = batchCountWeeklySubstitutions(weekSubsData, teacherShortened);
  return { timetableHours, substitutionHours, total: timetableHours + substitutionHours };
};

const loadWeeklyLimit = async (supabase: any): Promise<number> => {
  try {
    const { data } = await supabase
      .from('substitution_settings')
      .select('value')
      .eq('key', 'weekly_limit')
      .single();
    if (data?.value) return typeof data.value === 'number' ? data.value : parseInt(String(data.value), 10) || DEFAULT_WEEKLY_LIMIT;
  } catch (e) {
    console.error('Error loading weekly limit:', e);
  }
  return DEFAULT_WEEKLY_LIMIT;
};

const loadTeacherLimits = async (supabase: any): Promise<Record<string, number>> => {
  try {
    const { data } = await supabase.from('teacher_weekly_limits').select('teacher_shortened, weekly_limit');
    const map: Record<string, number> = {};
    for (const row of (data || [])) {
      map[row.teacher_shortened] = row.weekly_limit;
    }
    return map;
  } catch (e) {
    console.error('Error loading teacher limits:', e);
    return {};
  }
};

const getTeacherLimit = (teacherShortened: string, globalLimit: number, teacherLimits: Record<string, number>): number => {
  return teacherLimits[teacherShortened] ?? globalLimit;
};

// getSickTeachersForDate is now inlined in findSubstitutionsForDay to avoid extra DB query

const getTeacherClassRelationships = (
  teacherAbbr: string,
  scheduleData: Record<string, any[]>
): Map<string, Set<string>> => {
  const norm = normalize(teacherAbbr);
  const result = new Map<string, Set<string>>();
  for (const [table, rows] of Object.entries(scheduleData)) {
    const className = table.replace('Stundenplan_', '').replace('_A', '').toLowerCase();
    for (const r of rows) {
      for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']) {
        const cell = r[day] as string | null;
        if (!cell) continue;
        const entries = parseCell(cell);
        for (const e of entries) {
          if (normalize(e.teacher) === norm) {
            if (!result.has(className)) result.set(className, new Set());
            const canon = canonicalSubject(e.subject);
            if (canon) result.get(className)!.add(canon);
          }
        }
      }
    }
  }
  return result;
};

const getSchoolDays = (fromDate: string, toDate: string): string[] => {
  const days: string[] = [];
  const start = new Date(fromDate + 'T12:00:00');
  const end = new Date(toDate + 'T12:00:00');
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow >= 1 && dow <= 5) {
      days.push(cur.toISOString().substring(0, 10));
    }
    cur.setDate(cur.getDate() + 1);
    if (days.length > 30) break;
  }
  return days;
};

// Get all timetable lessons for a specific class on a specific day column
const getClassDayLessons = (
  className: string,
  col: string,
  scheduleData: Record<string, any[]>
): Array<{ period: number; subject: string; teacher: string; room: string }> => {
  const lessons: Array<{ period: number; subject: string; teacher: string; room: string }> = [];
  for (const [table, rows] of Object.entries(scheduleData)) {
    const cn = table.replace('Stundenplan_', '').replace('_A', '').toLowerCase();
    if (cn !== className.toLowerCase()) continue;
    for (const r of rows) {
      const p = r['Stunde'];
      const cell = r[col] as string | null;
      if (!cell) continue;
      const entries = parseCell(cell);
      for (const e of entries) {
        lessons.push({ period: p, subject: e.subject, teacher: e.teacher, room: e.room });
      }
    }
  }
  return lessons.sort((a, b) => a.period - b.period);
};

// Core logic to find substitutions for a single day
const findSubstitutionsForDay = async (
  supabase: any,
  absentTeacher: string,
  date: string,
  mode: string,
  allTeachers: any[],
  scheduleData: Record<string, any[]>,
  globalLimit: number,
  teacherLimits: Record<string, number>,
  cascadeDepth: number = 0,
  processedTeachers: Set<string> = new Set(),
  periodFrom?: number,
  periodTo?: number,
  preloadedWeekSubs?: any[] | null,
  preloadedRoomSchedule?: Record<string, any[]> | null
) => {
  const t0 = Date.now();
  const weekday = new Date(date + 'T12:00:00').getDay();
  if (weekday === 0 || weekday === 6) return { suggestions: [], affectedCount: 0, excludedSickTeachers: [] };

  const dayMap: Record<number, string> = { 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday' };
  const col = dayMap[weekday];
  const { monday, friday } = getWeekRange(date);
  const sickAbbr = normalize(absentTeacher);

  // Prevent infinite loops
  if (processedTeachers.has(sickAbbr)) {
    console.log(`[cascade] Already processed ${sickAbbr}, skipping`);
    return { suggestions: [], affectedCount: 0, excludedSickTeachers: [] };
  }
  if (cascadeDepth >= MAX_CASCADE_DEPTH) {
    console.warn(`[cascade] Max depth ${MAX_CASCADE_DEPTH} reached, stopping`);
    return { suggestions: [], affectedCount: 0, excludedSickTeachers: [] };
  }
  processedTeachers.add(sickAbbr);

  // PARALLEL: Load room_schedule + weekly vertretungsplan in ONE Promise.all
  // Weekly data includes daily data, so we only need one vertretungsplan query
  const roomScheduleForDay = preloadedRoomSchedule?.[col];
  const needRoomSchedule = !roomScheduleForDay;
  const needWeekSubs = !preloadedWeekSubs;

  const parallelQueries: Promise<any>[] = [];
  if (needRoomSchedule) {
    parallelQueries.push(
      supabase.from('room_schedule').select('*').eq('day_of_week', col)
    );
  }
  if (needWeekSubs) {
    parallelQueries.push(
      supabase.from('vertretungsplan').select('*').gte('date', monday).lte('date', friday)
    );
  }

  const parallelResults = parallelQueries.length > 0 ? await Promise.all(parallelQueries) : [];
  let pIdx = 0;

  const roomScheduleRows = needRoomSchedule
    ? (parallelResults[pIdx++]?.data || [])
    : (roomScheduleForDay || []);

  const weekSubsAll: any[] = needWeekSubs
    ? (parallelResults[pIdx++]?.data || [])
    : (preloadedWeekSubs || []);

  // Filter daily data from week data (in-memory, no extra query)
  const allVertretungenForDate = weekSubsAll.filter((row: any) => row.date === date);

  const t1 = Date.now();
  console.log(`[timing] findSubs queries: ${t1 - t0}ms (room=${roomScheduleRows.length}, weekSubs=${weekSubsAll.length}, daySubs=${allVertretungenForDate.length})`);

  // Extract sick teachers from daily vertretungsplan data (in-memory, no extra query)
  // Build a name-to-abbreviation lookup for resolving full names to shortened forms
  const nameToAbbr: Record<string, string> = {};
  for (const t of allTeachers) {
    const ln = normalize(t['last name'] || '');
    const fn = normalize(t['first name'] || '');
    const abbr = normalize(t.shortened || '');
    if (ln) nameToAbbr[ln] = abbr;
    if (fn && ln) nameToAbbr[`${fn} ${ln}`] = abbr;
    if (abbr) nameToAbbr[abbr] = abbr;
  }

  const resolveSickTeacher = (name: string) => {
    const n = normalize(name);
    // Direct match
    if (nameToAbbr[n]) return nameToAbbr[n];
    // Partial match (last name)
    for (const [key, abbr] of Object.entries(nameToAbbr)) {
      if (key.includes(n) || n.includes(key)) return abbr;
    }
    return n;
  };

  const sickTeachers = new Set<string>();
  for (const row of allVertretungenForDate) {
    if (row.original_teacher) {
      sickTeachers.add(resolveSickTeacher(row.original_teacher));
    }
    // Also check substitute_teacher in case they were previously re-assigned via cascade
    if (row.note) {
      const noteStr = row.note as string;
      const match = noteStr.match(/^Kaskade:\s*([^\s]+)\s+krank/);
      if (match) {
        match[1].split(',').map((t: string) => t.trim()).filter(Boolean).forEach((t: string) => sickTeachers.add(resolveSickTeacher(t)));
      }
    }
  }
  sickTeachers.add(sickAbbr);
  console.log(`[cascade] sickTeachers set: [${Array.from(sickTeachers).join(', ')}]`);

  const occupied: Record<number, Set<string>> = {};
  const roomOccupied: Record<number, Set<string>> = {}; // Track occupied rooms per period
  const affectedLessons: Array<{ className: string; period: number; subject: string; room: string; teacher: string; isCascade?: boolean; originalVertretungId?: string }> = [];

  // 1. Find timetable lessons of absent teacher
  console.log(`[debug] Looking for teacher "${absentTeacher}" (normalized: "${sickAbbr}") on column "${col}" in ${Object.keys(scheduleData).length} schedule tables`);
  
  for (const [table, rows] of Object.entries(scheduleData)) {
    const className = table.replace('Stundenplan_', '').replace('_A', '');
    console.log(`[debug] Scanning ${table} (${rows.length} rows) for "${sickAbbr}" on ${col}`);
    for (const r of rows) {
      const p = r['Stunde'];
      const cell = r[col] as string | null;
      if (!cell) continue;
      if (!occupied[p]) occupied[p] = new Set();
      if (!roomOccupied[p]) roomOccupied[p] = new Set();
      const entries = parseCell(cell);
      entries.forEach(e => {
        if (e.teacher) occupied[p].add(normalize(e.teacher));
        // Only mark room as occupied if teacher is NOT the absent teacher
        if (e.room && e.room !== 'Unbekannt' && normalize(e.teacher) !== sickAbbr) {
          roomOccupied[p].add(e.room);
        }
        if (normalize(e.teacher) === sickAbbr) {
          console.log(`[debug] MATCH: ${table} P${p} cell="${cell}" teacher="${e.teacher}" subject="${e.subject}" room="${e.room}" (room freed)`);
          affectedLessons.push({ className, period: p, subject: e.subject, room: e.room, teacher: e.teacher });
        }
      });
    }
    // Log a sample of cells for this column to help debug
    const sampleCells = rows.slice(0, 3).map((r: any) => `P${r['Stunde']}="${r[col] || '(leer)'}"`).join(', ');
    console.log(`[debug] ${table} ${col} samples: ${sampleCells}`);
  }

  console.log(`[affected] Teacher ${absentTeacher} (${sickAbbr}) has ${affectedLessons.length} timetable lessons on ${col}`);

  // 2. Check room_schedule
  for (const rs of (roomScheduleRows || [])) {
    const p = rs.period;
    if (!occupied[p]) occupied[p] = new Set();
    if (!roomOccupied[p]) roomOccupied[p] = new Set();
    if (rs.teacher_shortened) {
      occupied[p].add(normalize(rs.teacher_shortened));
    }
    if (rs.room_name) roomOccupied[p].add(rs.room_name);
    if (rs.teacher_shortened && normalize(rs.teacher_shortened) === sickAbbr) {
      const alreadyFound = affectedLessons.some(
        l => l.period === p && l.className.toLowerCase() === (rs.class_name || '').toLowerCase()
      );
      if (!alreadyFound) {
        affectedLessons.push({
          className: rs.class_name,
          period: p,
          subject: rs.subject,
          room: rs.room_name,
          teacher: rs.teacher_shortened
        });
      }
    }
  }

  console.log(`[affected] After room_schedule: ${affectedLessons.length} total affected lessons`);

  // 3. CASCADING: Find vertretungsplan entries where absent teacher was assigned as substitute
  // Use resolveSickTeacher for robust matching (handles full names, abbreviations, etc.)
  const cascadeEntries = allVertretungenForDate.filter((entry: any) => {
    const st = (entry.substitute_teacher || '').trim();
    if (!st) return false;
    // Method 1: Direct normalization
    if (normalize(st) === sickAbbr) return true;
    // Method 2: Extract abbreviation from parentheses "Name (Abbr)"
    const match = st.match(/\(([^)]+)\)\s*$/);
    if (match && normalize(match[1]) === sickAbbr) return true;
    // Method 3: Resolve full name to abbreviation via teacher lookup
    const resolved = resolveSickTeacher(st);
    if (resolved === sickAbbr) return true;
    // Method 4: Try without parentheses part
    const nameOnly = st.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (nameOnly && resolveSickTeacher(nameOnly) === sickAbbr) return true;
    return false;
  });
  console.log(`[cascade] Found ${cascadeEntries.length} cascade entries for ${absentTeacher} (${sickAbbr}) on ${date}`);

  for (const entry of (cascadeEntries || [])) {
    const alreadyFound = affectedLessons.some(
      l => l.period === entry.period && l.className.toLowerCase() === (entry.class_name || '').toLowerCase()
    );
    if (!alreadyFound) {
      affectedLessons.push({
        className: entry.class_name,
        period: entry.period,
        subject: entry.substitute_subject || entry.original_subject,
        room: entry.substitute_room || entry.original_room,
        teacher: absentTeacher,
        isCascade: true,
        originalVertretungId: entry.id
      });
      console.log(`[cascade depth=${cascadeDepth}] Teacher ${absentTeacher} was substitute for ${entry.class_name} P${entry.period}, re-assigning`);
    }
  }

  // Filter affected lessons by period range if specified
  if (periodFrom != null && periodTo != null) {
    const filtered = affectedLessons.filter(l => l.period >= periodFrom && l.period <= periodTo);
    affectedLessons.length = 0;
    affectedLessons.push(...filtered);
  }

  // Mark existing substitutions as occupied (from in-memory daily data)
  for (const sub of allVertretungenForDate) {
    const p = sub.period;
    if (sub.substitute_teacher) {
      if (!occupied[p]) occupied[p] = new Set();
      occupied[p].add(normalize(sub.substitute_teacher));
    }
    if (sub.substitute_room) {
      if (!roomOccupied[p]) roomOccupied[p] = new Set();
      roomOccupied[p].add(sub.substitute_room);
    }
  }

  // Pre-calculate weekly loads from preloaded week subs (all in-memory)
  const weeklyLoads: Record<string, { timetableHours: number; substitutionHours: number; total: number }> = {};
  for (const teacher of allTeachers) {
    weeklyLoads[teacher.shortened] = calculateWeeklyLoadBatched(
      teacher.shortened, scheduleData, weekSubsAll
    );
  }

  // Pre-calculate class relationships for all teachers (for Priority 2)
  const classRelationships: Record<string, Map<string, Set<string>>> = {};
  for (const teacher of allTeachers) {
    classRelationships[teacher.shortened] = getTeacherClassRelationships(teacher.shortened, scheduleData);
  }

  const suggestions: any[] = [];
  const tempOccupied: Record<number, Set<string>> = {};
  for (const [p, s] of Object.entries(occupied)) {
    tempOccupied[Number(p)] = new Set(s);
  }
  const tempRoomOccupied: Record<number, Set<string>> = {};
  for (const [p, s] of Object.entries(roomOccupied)) {
    tempRoomOccupied[Number(p)] = new Set(s);
  }
  const tempExtraLoad: Record<string, number> = {};

  affectedLessons.sort((a, b) => a.period - b.period);

  // Track which classes have cancelled lessons (for lesson swap)
  const cancelledByClass: Record<string, Array<{ period: number; subject: string; room: string; suggestionIdx: number }>> = {};

  for (const lesson of affectedLessons) {
    const canonLesson = canonicalSubject(lesson.subject);
    const targetClassName = lesson.className.toLowerCase();

    type Candidate = {
      teacher: any;
      score: number;
      reason: string;
      weeklyLoad: { timetableHours: number; substitutionHours: number; total: number };
      remaining: number;
      alternativeSubject: string | null;
    };

    const candidates: Candidate[] = [];

    for (const teacher of allTeachers) {
      const abbr = normalize(teacher.shortened);
      if (abbr === sickAbbr) continue;

      // Cascading: skip teachers who are also sick
      if (sickTeachers.has(abbr)) continue;

      // Check if teacher is occupied this period
      if (tempOccupied[lesson.period]?.has(abbr)) continue;

      // Calculate remaining weekly capacity with per-teacher limit
      const teacherLimit = getTeacherLimit(teacher.shortened, globalLimit, teacherLimits);
      const baseLoad = weeklyLoads[teacher.shortened]?.total || 0;
      const extraLoad = tempExtraLoad[teacher.shortened] || 0;
      const currentTotal = baseLoad + extraLoad;
      const remaining = teacherLimit - currentTotal;

      // Skip if at or over limit
      if (remaining <= 0) continue;

      let score = 0;
      const reasons: string[] = [];
      let alternativeSubject: string | null = null;

      // Priority 1: Subject match (+50)
      const tSubjects = subjectsToSet(teacher.subjects);
      if (canonLesson && tSubjects.has(canonLesson)) {
        score += 50;
        reasons.push('Fach-Match');
      } else {
        // Priority 2: Class relationship (+30)
        const teacherClasses = classRelationships[teacher.shortened];
        if (teacherClasses?.has(targetClassName)) {
          score += 30;
          const teacherSubjectsForClass = teacherClasses.get(targetClassName)!;
          for (const subj of tSubjects) {
            if (teacherSubjectsForClass.has(subj)) {
              alternativeSubject = subj;
              break;
            }
          }
          if (!alternativeSubject && tSubjects.size > 0) {
            alternativeSubject = Array.from(tSubjects)[0];
          }
          reasons.push('Klassen-Beziehung');
        } else {
          reasons.push('Fachfremd');
        }
      }

      // Room preference: +10
      if (teacher.fav_rooms && teacher.fav_rooms.includes(lesson.room)) {
        score += 10;
        reasons.push('Raumvorzug');
      }

      // Remaining capacity bonus (load balancing)
      score += Math.min(remaining, 10);

      // Penalize high-load teachers
      if (remaining <= 2) {
        score -= 20;
        reasons.push('Fast am Limit');
      } else if (remaining <= 4) {
        score -= 5;
      }

      candidates.push({
        teacher,
        score,
        reason: reasons.join(' + '),
        weeklyLoad: { ...weeklyLoads[teacher.shortened], total: currentTotal },
        remaining,
        alternativeSubject
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates.length > 0 ? candidates[0] : null;

    const suggestionIdx = suggestions.length;

    if (best) {
      const t = best.teacher;
      const abbr = normalize(t.shortened);
      const teacherLimit = getTeacherLimit(t.shortened, globalLimit, teacherLimits);

      if (!tempOccupied[lesson.period]) tempOccupied[lesson.period] = new Set();
      tempOccupied[lesson.period].add(abbr);
      tempExtraLoad[t.shortened] = (tempExtraLoad[t.shortened] || 0) + 1;

      // Determine substitute subject for room assignment
      const effectiveSubject = best.alternativeSubject || lesson.subject;
      const subjectChanged = best.alternativeSubject && canonicalSubject(best.alternativeSubject) !== canonicalSubject(lesson.subject);
      
      // If subject stays the same, keep original room; otherwise find best room
      if (!tempRoomOccupied[lesson.period]) tempRoomOccupied[lesson.period] = new Set();
      let assignedRoom: string;
      if (!subjectChanged && !tempRoomOccupied[lesson.period].has(lesson.room)) {
        // Same subject, keep original room if available
        assignedRoom = lesson.room;
      } else {
        assignedRoom = findBestRoom(effectiveSubject, lesson.period, tempRoomOccupied[lesson.period]) || lesson.room;
      }
      tempRoomOccupied[lesson.period].add(assignedRoom);

      suggestions.push({
        className: lesson.className,
        period: lesson.period,
        subject: lesson.subject,
        subjectAbbrev: toSubjectAbbrev(lesson.subject),
        room: lesson.room,
        substituteRoom: assignedRoom,
        originalTeacher: lesson.teacher,
        suggestedSubstitute: `${t['first name']} ${t['last name']} (${t.shortened})`,
        substituteShortened: t.shortened,
        substituteSubjects: t.subjects,
        reason: best.reason,
        score: best.score,
        alternativeSubject: best.alternativeSubject,
        alternativeSubjectAbbrev: best.alternativeSubject ? toSubjectAbbrev(best.alternativeSubject) : null,
        weeklyLoad: {
          current: best.weeklyLoad.total,
          max: teacherLimit,
          remaining: best.remaining - 1
        },
        date,
        isCascade: lesson.isCascade || false,
        originalVertretungId: lesson.originalVertretungId || null
      });
    } else {
      // No substitute found - track for lesson swap
      const cn = lesson.className.toLowerCase();
      if (!cancelledByClass[cn]) cancelledByClass[cn] = [];
      cancelledByClass[cn].push({
        period: lesson.period,
        subject: lesson.subject,
        room: lesson.room,
        suggestionIdx
      });

      suggestions.push({
        className: lesson.className,
        period: lesson.period,
        subject: lesson.subject,
        subjectAbbrev: toSubjectAbbrev(lesson.subject),
        room: lesson.room,
        originalTeacher: lesson.teacher,
        suggestedSubstitute: null,
        substituteShortened: null,
        substituteSubjects: null,
        reason: 'Keine verfügbare Lehrkraft (alle besetzt oder Wochenlimit erreicht)',
        score: 0,
        alternativeSubject: null,
        alternativeSubjectAbbrev: null,
        weeklyLoad: null,
        date,
        isCascade: lesson.isCascade || false,
        originalVertretungId: lesson.originalVertretungId || null,
        swapSuggestion: null
      });
    }
  }

  // LESSON SWAP LOGIC: For cancelled lessons, try to find edge lessons to pull forward
  for (const [cn, cancelled] of Object.entries(cancelledByClass)) {
    const classLessons = getClassDayLessons(cn, col, scheduleData);
    if (classLessons.length === 0) continue;

    // Find the affected periods (cancelled or substituted)
    const affectedPeriods = new Set(affectedLessons.filter(l => l.className.toLowerCase() === cn).map(l => l.period));

    // Find edge lessons (last lessons of the day) that are NOT affected
    const availableForSwap = classLessons
      .filter(l => !affectedPeriods.has(l.period) && !sickTeachers.has(normalize(l.teacher)))
      .sort((a, b) => b.period - a.period); // highest period first

    for (const cancelledLesson of cancelled.sort((a, b) => a.period - b.period)) {
      // Find a later lesson that can be moved to this earlier period
      const swapCandidate = availableForSwap.find(l => l.period > cancelledLesson.period);
      if (swapCandidate) {
        // Check if the teacher of the swap candidate is free in the cancelled period
        const swapTeacherNorm = normalize(swapCandidate.teacher);
        if (!tempOccupied[cancelledLesson.period]?.has(swapTeacherNorm)) {
          // Suggest a swap
          suggestions[cancelledLesson.suggestionIdx].swapSuggestion = {
            fromPeriod: swapCandidate.period,
            toPeriod: cancelledLesson.period,
            subject: swapCandidate.subject,
            subjectAbbrev: toSubjectAbbrev(swapCandidate.subject),
            teacher: swapCandidate.teacher,
            room: swapCandidate.room,
            description: `${toSubjectAbbrev(swapCandidate.subject)} (${swapCandidate.teacher}) von Stunde ${swapCandidate.period} vorziehen → Stunde ${cancelledLesson.period}`
          };
          suggestions[cancelledLesson.suggestionIdx].reason = `Fach-Tausch möglich: ${toSubjectAbbrev(swapCandidate.subject)} vorziehen`;

          // Remove this candidate from available pool
          const idx = availableForSwap.indexOf(swapCandidate);
          if (idx >= 0) availableForSwap.splice(idx, 1);
        }
      }
    }
  }

  return {
    suggestions,
    affectedCount: affectedLessons.length,
    excludedSickTeachers: Array.from(sickTeachers).filter(t => t !== sickAbbr),
    cascadeDepth
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, sessionId, data } = body;

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Server configuration error: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const deny = (status = 401, message = 'Unauthorized') =>
      new Response(JSON.stringify({ success: false, error: message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status,
      });

    // Validate session
    if (!sessionId || !UUID_REGEX.test(sessionId)) return deny(400, 'Missing or invalid sessionId');

    const { data: actorData, error: actorErr } = await supabase.rpc('get_actor_from_session_secure', {
      v_session_id: sessionId
    });
    if (actorErr || !actorData?.length) return deny(401, 'Invalid or expired session');

    const actor = actorData[0];
    if ((actor.permission_lvl ?? 0) < 10) return deny(403, 'Level 10 erforderlich');

    console.log(`[substitution-engine] actor=${actor.username} action=${action}`);
    const tStart = Date.now();

    const { data: tableData, error: tableErr } = await supabase.rpc('list_schedule_tables');
    if (tableErr) {
      console.error('[substitution-engine] list_schedule_tables failed:', tableErr);
      return deny(500, 'Stundenplan-Tabellen konnten nicht geladen werden');
    }

    const tables = (tableData || [])
      .map((row: { table_name?: string }) => row.table_name)
      .filter((tableName): tableName is string => Boolean(tableName));

    if (tables.length === 0) {
      return deny(500, 'Keine Stundenplan-Tabellen gefunden');
    }

    // PARALLEL: Load ALL base data in one Promise.all
    const [limitResult, teacherLimitsResult, teachersResult, ...scheduleResults] = await Promise.all([
      loadWeeklyLimit(supabase),
      loadTeacherLimits(supabase),
      supabase.from('teachers').select('shortened, "first name", "last name", subjects, fav_rooms'),
      ...tables.map(t => supabase.from(t).select('*'))
    ]);

    const globalLimit = limitResult as number;
    const teacherLimits = teacherLimitsResult as Record<string, number>;
    const allTeachers = teachersResult?.data || [];

    const scheduleData: Record<string, any[]> = {};
    const debugScheduleInfo: Record<string, any> = {};
    let totalScheduleRows = 0;
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      const { data: rows, error: schErr } = scheduleResults[i];
      if (schErr) {
        console.error(`[schedule-load] ERROR loading ${table}:`, JSON.stringify(schErr));
        debugScheduleInfo[table] = { error: schErr.message, code: schErr.code, rows: 0 };
        continue;
      }
      const rowCount = rows?.length || 0;
      console.log(`[schedule-load] ${table}: ${rowCount} rows loaded`);
      scheduleData[table] = rows || [];
      debugScheduleInfo[table] = { rows: rowCount };
      totalScheduleRows += rowCount;
    }
    const tDataLoad = Date.now();
    console.log(`[timing] data-load: ${tDataLoad - tStart}ms (teachers=${allTeachers.length}, scheduleRows=${totalScheduleRows})`);

    if (action === 'find_substitutions') {
      const { absentTeacher, date, mode, periodFrom, periodTo } = data;
      if (!absentTeacher || !date) return deny(400, 'absentTeacher and date required');

      const weekday = new Date(date + 'T12:00:00').getDay();
      if (weekday === 0 || weekday === 6) return deny(400, 'Nur Schultage (Mo-Fr)');

      const result = await findSubstitutionsForDay(
        supabase, absentTeacher, date, mode,
        allTeachers || [], scheduleData, globalLimit, teacherLimits,
        0, new Set(), periodFrom, periodTo,
        null, null
      );

      const tEnd = Date.now();
      console.log(`[timing] find_substitutions total: ${tEnd - tStart}ms (affected=${result.affectedCount}, suggestions=${result.suggestions.length})`);

      return new Response(JSON.stringify({
        success: true,
        suggestions: result.suggestions,
        weeklyLimit: globalLimit,
        excludedSickTeachers: result.excludedSickTeachers,
        cascadeDepth: result.cascadeDepth,
        debug: { scheduleInfo: debugScheduleInfo, totalScheduleRows },
        stats: {
          total: result.affectedCount,
          assigned: result.suggestions.filter((s: any) => s.suggestedSubstitute).length,
          cancelled: result.suggestions.filter((s: any) => !s.suggestedSubstitute).length
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (action === 'find_substitutions_range') {
      const { absentTeacher, dateFrom, dateTo, mode, periodFrom, periodTo } = data;
      if (!absentTeacher || !dateFrom || !dateTo) return deny(400, 'absentTeacher, dateFrom, dateTo required');

      const schoolDays = getSchoolDays(dateFrom, dateTo);
      if (schoolDays.length === 0) return deny(400, 'Keine Schultage im gewählten Zeitraum');

      const allResults: Record<string, any> = {};
      let totalAssigned = 0;
      let totalCancelled = 0;
      let allExcluded = new Set<string>();

      // Preload week subs for all days at once
      const { monday: rangeMonday, friday: rangeFriday } = getWeekRange(dateFrom);
      const { data: preloadedWeekSubs } = await supabase
        .from('vertretungsplan')
        .select('*')
        .gte('date', rangeMonday)
        .lte('date', rangeFriday);

      for (const day of schoolDays) {
        const result = await findSubstitutionsForDay(
          supabase, absentTeacher, day, mode || 'assisted',
          allTeachers || [], scheduleData, globalLimit, teacherLimits,
          0, new Set(), periodFrom, periodTo,
          preloadedWeekSubs || [], null
        );
        allResults[day] = result.suggestions;
        totalAssigned += result.suggestions.filter((s: any) => s.suggestedSubstitute).length;
        totalCancelled += result.suggestions.filter((s: any) => !s.suggestedSubstitute).length;
        for (const t of (result.excludedSickTeachers || [])) allExcluded.add(t);
      }

      return new Response(JSON.stringify({
        success: true,
        dayResults: allResults,
        schoolDays,
        weeklyLimit: globalLimit,
        excludedSickTeachers: Array.from(allExcluded),
        debug: { scheduleInfo: debugScheduleInfo, totalScheduleRows },
        stats: {
          days: schoolDays.length,
          totalAssigned,
          totalCancelled
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (action === 'confirm_substitutions') {
      const { date, absentTeacher, substitutions } = data;
      if (!date || !substitutions?.length) return deny(400, 'date and substitutions required');

      let created = 0;

      for (const sub of substitutions) {
        const substituteSubject = toSubjectAbbrev(sub.alternativeSubject || sub.subject);

        // If this is a cascade re-assignment, update the existing entry instead of creating new
        if (sub.originalVertretungId) {
          // Read existing note to accumulate all previously sick teachers
          const { data: existingEntry } = await supabase
            .from('vertretungsplan')
            .select('note')
            .eq('id', sub.originalVertretungId)
            .single();

          // Extract previously accumulated sick teachers from existing note
          const previousSick = new Set<string>();
          if (existingEntry?.note) {
            const match = (existingEntry.note as string).match(/^Kaskade:\s*([^\s]+)\s+krank/);
            if (match) {
              match[1].split(',').map((t: string) => t.trim()).filter(Boolean).forEach((t: string) => previousSick.add(t));
            }
          }
          // Add current absent teacher
          previousSick.add(absentTeacher);
          const allSickStr = Array.from(previousSick).join(',');

          const { error: updateErr } = await supabase
            .from('vertretungsplan')
            .update({
              substitute_teacher: sub.substituteTeacher || '',
              substitute_subject: substituteSubject,
              note: sub.substituteTeacher
                ? `Kaskade: ${allSickStr} krank → ${sub.substituteTeacher}`
                : `Kaskade: ${allSickStr} krank → Entfall`,
              updated_at: new Date().toISOString()
            })
            .eq('id', sub.originalVertretungId);

          if (updateErr) {
            console.error('Cascade update error:', updateErr);
            continue;
          }
          created++;
        } else {
          const { error: insertErr } = await supabase
            .from('vertretungsplan')
            .insert({
              date: sub.date || date,
              class_name: sub.className,
              period: sub.period,
              original_teacher: sub.originalTeacher || absentTeacher,
              original_subject: sub.subject,
              original_room: sub.room,
              substitute_teacher: sub.substituteTeacher || '',
              substitute_subject: substituteSubject,
              substitute_room: sub.substituteRoom || sub.room,
              note: sub.substituteTeacher ? `Vertretung: ${sub.substituteTeacher}` : 'Entfall',
              created_by: null
            });

          if (insertErr) {
            console.error('Insert error:', insertErr);
            continue;
          }
          created++;
        }

        // Handle swap: create vertretungsplan entries for the swapped lesson
        if (sub.swapSuggestion) {
          const swap = sub.swapSuggestion;
          // Mark original edge lesson as moved
          await supabase.from('vertretungsplan').insert({
            date: sub.date || date,
            class_name: sub.className,
            period: swap.fromPeriod,
            original_teacher: swap.teacher,
            original_subject: swap.subject,
            original_room: swap.room,
            substitute_teacher: swap.teacher,
            substitute_subject: swap.subject,
            substitute_room: swap.room,
            note: `Vorgezogen auf Stunde ${swap.toPeriod}`,
            created_by: null
          });
          // Mark the swap destination
          await supabase.from('vertretungsplan').insert({
            date: sub.date || date,
            class_name: sub.className,
            period: swap.toPeriod,
            original_teacher: sub.originalTeacher || absentTeacher,
            original_subject: sub.subject,
            original_room: sub.room,
            substitute_teacher: swap.teacher,
            substitute_subject: swap.subject,
            substitute_room: swap.room,
            note: `Fach-Tausch: ${toSubjectAbbrev(swap.subject)} vorgezogen von Stunde ${swap.fromPeriod}`,
            created_by: null
          });
          created += 2;
        }

        // Log the substitution for quota tracking
        if (sub.substituteShortened) {
          try {
            const subDate = sub.date || date;
            const monthYear = subDate.substring(0, 7);

            await supabase.rpc('get_or_create_quota', {
              p_teacher_shortened: sub.substituteShortened,
              p_month_year: monthYear
            });

            const { data: quotaData } = await supabase
              .from('teacher_substitution_quotas')
              .select('used_units')
              .eq('teacher_shortened', sub.substituteShortened)
              .eq('month_year', monthYear)
              .single();

            if (quotaData) {
              await supabase
                .from('teacher_substitution_quotas')
                .update({ used_units: quotaData.used_units + 1, updated_at: new Date().toISOString() })
                .eq('teacher_shortened', sub.substituteShortened)
                .eq('month_year', monthYear);
            }

            await supabase.from('substitution_log').insert({
              teacher_shortened: sub.substituteShortened,
              class_name: sub.className,
              period: sub.period,
              date: subDate,
              subject: substituteSubject,
              month_year: monthYear,
              created_by_user_id: actor.id
            });
          } catch (quotaErr) {
            console.error('Quota tracking error:', quotaErr);
          }
        }
      }

      // Create class-targeted announcements for affected users
      const dateSet = [...new Set(substitutions.map((s: any) => s.date || date).filter(Boolean))];
      const dateLabel = dateSet
        .map((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)
          ? new Date(`${d}T12:00:00`).toLocaleDateString('de-DE')
          : d
        )
        .join(', ');

      const classNames = [...new Set(
        substitutions
          .map((s: any) => String(s.className || '').trim().toLowerCase())
          .filter(Boolean)
      )];

      if (classNames.length > 0) {
        const announcementRows = classNames.map((className) => ({
          title: `Vertretungsplan aktualisiert – ${dateLabel}`,
          content: substitutions
            .filter((s: any) => String(s.className || '').trim().toLowerCase() === className)
            .map((s: any) => `${className.toUpperCase()}, ${s.period}. Stunde: ${s.subject} → ${s.substituteTeacher || 'Entfall'}`)
            .join('\n'),
          author: 'E.D.U.A.R.D.',
          priority: 'high',
          target_class: className,
          target_permission_level: 1,
          created_by: null
        }));

        const { error: annErr } = await supabase.from('announcements').insert(announcementRows);
        if (annErr) {
          console.error('Announcement insert error:', annErr);
        }
      }

      return new Response(JSON.stringify({ success: true, created }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (action === 'get_weekly_load') {
      const { teacherShortened, weekDate } = data;
      if (!teacherShortened || !weekDate) return deny(400, 'teacherShortened and weekDate required');

      const { monday, friday } = getWeekRange(weekDate);
      // Batch load for single teacher
      const { data: weekSubs } = await supabase
        .from('vertretungsplan')
        .select('id, substitute_teacher, period')
        .gte('date', monday)
        .lte('date', friday);
      const load = calculateWeeklyLoadBatched(teacherShortened, scheduleData, weekSubs || []);
      const teacherLimit = getTeacherLimit(teacherShortened, globalLimit, teacherLimits);

      return new Response(JSON.stringify({
        success: true,
        teacherShortened,
        weekRange: { monday, friday },
        load,
        remaining: teacherLimit - load.total,
        limit: teacherLimit
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (action === 'get_settings') {
      return new Response(JSON.stringify({
        success: true,
        globalLimit,
        teacherLimits
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (action === 'update_settings') {
      const { key, value } = data;
      if (!key) return deny(400, 'key required');

      const { error } = await supabase
        .from('substitution_settings')
        .update({ value: value, updated_at: new Date().toISOString() })
        .eq('key', key);

      if (error) {
        console.error('Error updating setting:', error);
        return deny(500, `Failed to update setting: ${error.message}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (action === 'update_teacher_limit') {
      const { teacher_shortened, weekly_limit } = data;
      if (!teacher_shortened || weekly_limit == null) return deny(400, 'teacher_shortened and weekly_limit required');

      const { error } = await supabase
        .from('teacher_weekly_limits')
        .upsert({
          teacher_shortened,
          weekly_limit,
          updated_at: new Date().toISOString()
        }, { onConflict: 'teacher_shortened' });

      if (error) {
        console.error('Error updating teacher limit:', error);
        return deny(500, `Failed to update teacher limit: ${error.message}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (action === 'delete_teacher_limit') {
      const { teacher_shortened } = data;
      if (!teacher_shortened) return deny(400, 'teacher_shortened required');

      const { error } = await supabase
        .from('teacher_weekly_limits')
        .delete()
        .eq('teacher_shortened', teacher_shortened);

      if (error) {
        console.error('Error deleting teacher limit:', error);
        return deny(500, `Failed to delete teacher limit: ${error.message}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (action === 'track_quota') {
      // Track quota for a manually created substitution
      const { substituteTeacher, className, period, date: subDate, subject } = data;
      if (!substituteTeacher || !subDate) return deny(400, 'substituteTeacher and date required');

      // Extract abbreviated name from formats like "Nachname (Kürzel)" or use as-is
      const extractShortened = (name: string): string => {
        const match = name.match(/\(([^)]+)\)\s*$/);
        if (match) return match[1].trim();
        return name.trim();
      };
      const candidateShortened = extractShortened(substituteTeacher);

      // Look up the teacher by shortened name (try extracted abbreviation first, then original)
      let { data: teacherData } = await supabase
        .from('teachers')
        .select('shortened')
        .ilike('shortened', candidateShortened)
        .maybeSingle();

      if (!teacherData) {
        // Fallback: try original value
        const res = await supabase
          .from('teachers')
          .select('shortened')
          .ilike('shortened', substituteTeacher.trim())
          .maybeSingle();
        teacherData = res.data;
      }

      const teacherShortened = teacherData?.shortened;
      if (!teacherShortened) {
        // Not a known teacher shortened name, skip quota tracking
        return new Response(JSON.stringify({ success: true, tracked: false, reason: 'Teacher not found by shortened name' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      try {
        const monthYear = subDate.substring(0, 7);

        await supabase.rpc('get_or_create_quota', {
          p_teacher_shortened: teacherShortened,
          p_month_year: monthYear
        });

        const { data: quotaData } = await supabase
          .from('teacher_substitution_quotas')
          .select('used_units')
          .eq('teacher_shortened', teacherShortened)
          .eq('month_year', monthYear)
          .single();

        if (quotaData) {
          await supabase
            .from('teacher_substitution_quotas')
            .update({ used_units: quotaData.used_units + 1, updated_at: new Date().toISOString() })
            .eq('teacher_shortened', teacherShortened)
            .eq('month_year', monthYear);
        }

        await supabase.from('substitution_log').insert({
          teacher_shortened: teacherShortened,
          class_name: className || '',
          period: period || 0,
          date: subDate,
          subject: subject || '',
          month_year: monthYear,
          created_by_user_id: actor.id
        });

        return new Response(JSON.stringify({ success: true, tracked: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (quotaErr) {
        console.error('Manual quota tracking error:', quotaErr);
        return new Response(JSON.stringify({ success: true, tracked: false, reason: 'Quota tracking failed' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

    } else if (action === 'untrack_quota') {
      // Decrement quota when a substitution is deleted or teacher changed
      const { substituteTeacher, date: subDate } = data;
      if (!substituteTeacher || !subDate) return deny(400, 'substituteTeacher and date required');

      // Extract abbreviated name from formats like "Nachname (Kürzel)" or use as-is
      const extractShortened = (name: string): string => {
        const match = name.match(/\(([^)]+)\)\s*$/);
        if (match) return match[1].trim();
        return name.trim();
      };
      const candidateShortened = extractShortened(substituteTeacher);

      let { data: teacherData } = await supabase
        .from('teachers')
        .select('shortened')
        .ilike('shortened', candidateShortened)
        .maybeSingle();

      if (!teacherData) {
        const res = await supabase
          .from('teachers')
          .select('shortened')
          .ilike('shortened', substituteTeacher.trim())
          .maybeSingle();
        teacherData = res.data;
      }

      const teacherShortened = teacherData?.shortened;
      if (!teacherShortened) {
        return new Response(JSON.stringify({ success: true, tracked: false, reason: 'Teacher not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      try {
        const monthYear = subDate.substring(0, 7);

        const { data: quotaData } = await supabase
          .from('teacher_substitution_quotas')
          .select('used_units')
          .eq('teacher_shortened', teacherShortened)
          .eq('month_year', monthYear)
          .single();

        if (quotaData && quotaData.used_units > 0) {
          await supabase
            .from('teacher_substitution_quotas')
            .update({ used_units: quotaData.used_units - 1, updated_at: new Date().toISOString() })
            .eq('teacher_shortened', teacherShortened)
            .eq('month_year', monthYear);
        }

        // Remove the latest substitution_log entry for this teacher on this date
        const { data: logEntries } = await supabase
          .from('substitution_log')
          .select('id')
          .eq('teacher_shortened', teacherShortened)
          .eq('date', subDate)
          .order('created_at', { ascending: false })
          .limit(1);

        if (logEntries && logEntries.length > 0) {
          await supabase.from('substitution_log').delete().eq('id', logEntries[0].id);
        }

        return new Response(JSON.stringify({ success: true, tracked: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (quotaErr) {
        console.error('Untrack quota error:', quotaErr);
        return new Response(JSON.stringify({ success: true, tracked: false, reason: 'Quota untracking failed' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

    } else {
      return deny(400, `Unknown action: ${action}`);
    }

  } catch (error) {
    console.error('substitution-engine error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
