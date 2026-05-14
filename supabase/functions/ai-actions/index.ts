import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Helper utilities for robust matching
const normalize = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
const stripTitles = (s: string) => normalize(s)
  .replace(/\b(herr|frau|dr|prof|professor|frl|fräulein)\b\.?\s*/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// Canonicalize a subject/abbreviation to a common token
const canonicalSubject = (raw: string) => {
  const t = normalize(raw).replace(/[^a-z]/g, '');
  if (!t) return '';
  if (/^ma(th|t)?/.test(t)) return 'mathematik';
  if (/^de/.test(t)) return 'deutsch';
  if (/^en(g|)/.test(t)) return 'englisch';
  if (/^ru/.test(t)) return 'russisch';
  if (/^re(l|i)/.test(t)) return 'religion'; // Added 'reli' pattern
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
  if (/^grw$/.test(t)) return 'geschichte'; // G/R/W becomes grw -> Geschichte
  if (/^p$/.test(t)) return 'profil'; // P -> Profil
  return t; // fallback to normalized token
};

const subjectsToSet = (subjects: string) => {
  const set = new Set<string>();
  const raw = subjects || '';

  // Special handling for composite subject G/R/W so it doesn't split into G, R, W
  const rawNorm = normalize(raw);
  if (/\bg\s*\/\s*r\s*\/\s*w\b/i.test(raw) || /\bgrw\b/i.test(rawNorm) || /\bg\s*-\s*r\s*-\s*w\b/i.test(raw)) {
    set.add('geschichte');
  }

  raw
    .split(/[^a-zA-ZäöüÄÖÜß]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .forEach(token => {
      const canon = canonicalSubject(token);
      if (canon) set.add(canon);
    });
  return set;
};

const teacherCanTeachSubject = (teacherSubjects: string, lessonSubject: string) => {
  const tset = subjectsToSet(teacherSubjects);
  const canonLesson = canonicalSubject(lessonSubject);
  console.log(`teacherCanTeachSubject: subjects="${teacherSubjects}" -> set=[${Array.from(tset).join(', ')}], lesson="${lessonSubject}" -> canonical="${canonLesson}", result=${canonLesson ? tset.has(canonLesson) : false}`);
  return canonLesson ? tset.has(canonLesson) : false;
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // SECURITY FIX: Accept sessionId instead of userProfile for server-side validation
    const { action, parameters, sessionId } = await req.json()
    console.log('Received action:', action, 'with parameters:', parameters, 'sessionId:', sessionId ? 'provided' : 'missing')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const deny = (status = 401, message = 'Unauthorized') =>
      new Response(JSON.stringify({ success: false, result: { error: message } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status,
      });

    // SECURITY FIX: Resolve user identity from session instead of trusting client
    let userProfile: { user_id: number; name: string; permission_lvl: number; user_class?: string } | null = null;

    // Try session-based auth first (new secure method)
    if (sessionId && typeof sessionId === 'string' && UUID_REGEX.test(sessionId)) {
      const { data: actorData, error: actorErr } = await supabase.rpc('get_actor_from_session_secure', {
        v_session_id: sessionId
      });

      if (actorErr) {
        console.error('ai-actions session resolution error:', actorErr);
        return deny(500, 'Session resolution failed');
      }

      if (actorData && actorData.length > 0) {
        const actor = actorData[0];
        userProfile = {
          user_id: actor.id,
          name: actor.name || actor.username,
          permission_lvl: actor.permission_lvl ?? 0,
          user_class: actor.user_class
        };
        console.log('[ai-actions] actor resolved from session', { 
          id: actor.id, 
          username: actor.username, 
          permission_lvl: actor.permission_lvl 
        });
      } else {
        return deny(401, 'Invalid or expired session');
      }
    } else {
      return deny(400, 'Missing or invalid sessionId (must be UUID)');
    }

    let result: any = {}
    let success = false

    // AI system prompts with school knowledge
    const systemPrompt = `Du bist E.D.U.A.R.D. (Educational Data, Utility & Administration Resource Director), ein fortgeschrittener KI-Assistent für das Schulsystem.

WICHTIG - DATENVERWENDUNG:
🚨 NIEMALS ERFUNDENE DATEN VERWENDEN! 🚨
- Du darfst NIEMALS Lehrernamen, Schülernamen, Klassen oder andere Daten erfinden
- Verwende AUSSCHLIESSLICH echte Daten aus der Schuladministrations-Datenbank
- Für Lehrerlisten verwende IMMER die Action "AKTION:GET_TEACHERS"
- Für Vertretungspläne verwende IMMER die entsprechenden Datenbankabfragen
- Wenn du keine echten Daten hast, sage explizit "Ich habe keine Daten dazu" anstatt etwas zu erfinden

SCHULZEITEN UND BLOCKSTRUKTUR:
- Schulzeit: 07:45 bis 13:20 Uhr (ohne 4. Block) oder bis 15:15 Uhr (mit 4. Block)
- Block 1: 07:45 – 09:15 (2 Schulstunden)
- Block 2: 09:35 – 11:05 (2 Schulstunden)  
- Block 3: 11:50 – 13:20 (2 Schulstunden)
- Block 4: 13:45 – 15:15 (2 Schulstunden)

WICHTIGE DEUTSCHSPRACHIGE BEGRIFFE:
- Fächer: Deutsch, Mathematik/Mathe, Englisch, Geschichte, Erdkunde, Biologie, Chemie, Physik, Sport, Kunst, Musik, Religion, Ethik, Informatik, Französisch, Spanisch, Latein
- Relative Zeiten: heute, morgen, übermorgen, gestern
- Wenn nach "morgen" oder anderen spezifischen Tagen gefragt wird, zeige NUR die Daten für diesen Tag

BERECHTIGUNGSSYSTEM:
- Level 1: Besucher
- Level 2-4: Schüler  
- Level 5-9: Lehrkraft
- Level 10+: Schulleitung

SCHULZEITEN ANTWORT:
- Wenn gefragt "Bis wann geht die Schule?" oder ähnlich, antworte IMMER: "Die Schule geht von 07:45–13:20 Uhr (Blöcke 1–3) oder 07:45–15:15 Uhr (mit Block 4)."

VERFÜGBARE AKTIONEN:
- AKTION:GET_TEACHERS - Zeigt alle echten Lehrer aus der Datenbank
- AKTION:PLAN_SUBSTITUTION - Plant Vertretungen für erkrankte Lehrer
- AKTION:UPDATE_VERTRETUNGSPLAN - Trägt Vertretungen ein
- AKTION:CREATE_ANNOUNCEMENT - Erstellt Durchsagen
- AKTION:CREATE_TTS - Erstellt Sprachdurchsagen

Du hilfst bei:
- Vertretungsplanung und -abfragen
- Stundenplanerstellung und -abfragen
- Benutzerverwaltung (nur für Berechtigte)
- Durchsagen erstellen
- Schulorganisation

Antworte stets höflich, professionell und schulgerecht auf Deutsch.`;

    switch (action) {
      case 'get_system_prompt':
        result = { prompt: systemPrompt }
        success = true
        break

      case 'create_user':
        // Verify permission level 10 for user creation
        if (userProfile.permission_lvl >= 10) {
          const { data, error } = await supabase.rpc('create_user_with_permissions', {
            p_username: parameters.username,
            p_name: parameters.name,
            p_permission_lvl: parseInt(parameters.permissionLevel),
            p_user_class: parameters.userClass || null,
            creator_user_id: userProfile.user_id
          });
          
          if (!error && (data as any)?.success) {
            result = { message: `Benutzer ${parameters.username} wurde erfolgreich erstellt.` }
            success = true
          } else {
            result = { error: (data as any)?.error || error?.message || 'Fehler beim Erstellen des Benutzers' }
          }
        } else {
          result = { error: 'Keine Berechtigung zum Erstellen von Benutzern' }
        }
        break

      case 'update_vertretungsplan':
        if (userProfile.permission_lvl >= 10) {
          console.log('Raw parameters received:', parameters)
          
          // Parse date using robust German parser and ensure school day
          const dateValue = parseDateTextToBerlinSchoolDay(parameters?.date || parameters?.datum || 'today');
          const dateISO = dateValue.toISOString().split('T')[0];

          // If information is incomplete or period is "all", generate proposals like plan_substitution and ask for confirmation
          const needsPlanning = !parameters.className || !parameters.originalSubject || !parameters.period || String(parameters.period).toLowerCase() === 'all';
          if (needsPlanning) {
            try {
              const teacherName = String(parameters?.originalTeacher || parameters?.teacherName || '').trim();
              if (!teacherName) {
                result = { error: 'Bitte geben Sie den erkrankten Lehrer an (z. B. originalTeacher: "König").' };
                break;
              }

              // Load teachers to identify substitutes
              const { data: teacherRows, error: tErr } = await supabase
                .from('teachers')
                .select('shortened, "last name", "first name", subjects');
              if (tErr) throw tErr;

              // Normalize teacher name: remove titles and diacritics
              const normalize = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
              const stripTitles = (s: string) => normalize(s).replace(/\b(herr|frau|dr|prof|prof\.|frl|fr\u00e4ulein)\b/g, '').replace(/\s+/g, ' ').trim();
              const teacherNameNorm = stripTitles(teacherName);

              const teacherRow = (teacherRows || []).find((t: any) => {
                const lastName = normalize(t['last name'] || '');
                const firstName = normalize(t['first name'] || '');
                const abbr = normalize(t.shortened || '');
                const full = `${firstName} ${lastName}`.trim();
                return lastName.includes(teacherNameNorm) || firstName.includes(teacherNameNorm) || full.includes(teacherNameNorm) || abbr === teacherNameNorm;
              });

              // Build alias matcher
              const sickAbbr = normalize(teacherRow?.shortened || teacherNameNorm);
              const isSickTeacherAbbr = (abbr: string) => normalize(abbr) === sickAbbr;

              const weekday = new Date(dateISO + 'T12:00:00').getDay();
              if (weekday === 0 || weekday === 6) {
                result = { error: 'Vertretungen können nur an Schultagen (Mo–Fr) geplant werden.' };
                break;
              }
              const dayMap: Record<number, string> = { 1:'monday', 2:'tuesday', 3:'wednesday', 4:'thursday', 5:'friday' };
              const col = dayMap[weekday] || 'monday';

              const { data: tableData, error: tableErr } = await supabase.rpc('list_schedule_tables');
              if (tableErr) throw tableErr;
              const tables = (tableData || [])
                .map((row: { table_name?: string }) => row.table_name)
                .filter((tableName): tableName is string => Boolean(tableName));

              if (tables.length === 0) {
                result = { error: 'Keine Stundenplan-Tabellen gefunden.' };
                break;
              }
              const occupied: Record<number, Set<string>> = {};

              const parseCell = (cell?: string) => {
                if (!cell) return [] as Array<{subject:string, teacher:string, room:string}>;
                return cell.split('|').map(s => s.trim()).filter(Boolean).map(sub => {
                  const parts = sub.split(/\s+/).filter(Boolean);
                  if (parts.length >= 3) {
                    return { subject: parts[0], teacher: parts[1], room: parts.slice(2).join(' ') };
                  } else if (parts.length === 2) {
                    return { subject: parts[0], teacher: parts[1], room: 'Unbekannt' };
                  }
                  return { subject: sub, teacher: '', room: 'Unbekannt' } as any;
                });
              };

              // Build occupied map
              for (const table of tables) {
                const { data: rows } = await supabase.from(table).select('*');
                for (const r of rows || []) {
                  const p = r['Stunde'];
                  const cell = r[col] as string | null;
                  if (!cell) continue;
                  if (!occupied[p]) occupied[p] = new Set();
                  parseCell(cell).forEach(e => e.teacher && occupied[p].add(normalize(e.teacher)));
                }
              }

              const substitutions: any[] = [];
              for (const table of tables) {
                const { data: rows } = await supabase.from(table).select('*');
                const className = table.replace('Stundenplan_','').replace('_A','');
                for (const r of rows || []) {
                  const p = r['Stunde'];
                  const cell = r[col] as string | null;
                  if (!cell) continue;
                  const entries = parseCell(cell);
                  entries.forEach(entry => {
                    if (entry.teacher && isSickTeacherAbbr(entry.teacher)) {
                      // find substitute who can teach subject
                      const candidates = (teacherRows || []).filter((t: any) => {
                        const abbrNorm = normalize(t.shortened || '');
                        const subs = (t.subjects || '');
                        const canTeach = teacherCanTeachSubject(subs, entry.subject);
                        return abbrNorm !== sickAbbr && !occupied[p]?.has(abbrNorm) && canTeach;
                      });
                      let substituteTeacher = 'Vertretung';
                      if (candidates.length > 0) {
                        const c = candidates[0];
                        substituteTeacher = `${c['first name']} ${c['last name']} (${c.shortened})`;
                        occupied[p].add(normalize(c.shortened || ''));
                      }
                      substitutions.push({
                        className,
                        period: p,
                        subject: entry.subject,
                        originalTeacher: teacherName,
                        room: entry.room,
                        substituteTeacher
                      });
                    }
                  });
                }
              }

              const dayName = new Date(dateISO + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long' });
              const teacherDisplay = (teacherRow && teacherRow['last name']) || teacherName;
              result = {
                message: substitutions.length > 0
                  ? `Vorschläge für Vertretungen für ${teacherDisplay} am ${dayName} (${dateISO}). Bitte bestätigen.`
                  : `Keine Stunden für ${teacherDisplay} am ${dayName} (${dateISO}) gefunden.`,
                details: { date: dateISO, teacher: teacherDisplay, substitutions }
              };
              success = true;
              break;
            } catch (e: any) {
              console.error('update_vertretungsplan planning error:', e);
              result = { error: e.message || 'Fehler bei der automatischen Planung' };
              break;
            }
          }

          // Direct insert path when all data provided explicitly
          const insertData = {
            date: dateISO,
            class_name: parameters.className || parameters.class_name,
            period: parseInt(parameters.period),
            original_teacher: parameters.originalTeacher || parameters.original_teacher,
            original_subject: parameters.originalSubject || parameters.original_subject,
            original_room: parameters.originalRoom || parameters.original_room || 'Unbekannt',
            substitute_teacher: parameters.substituteTeacher || parameters.substitute_teacher || 'Vertretung',
            substitute_subject: parameters.substituteSubject || parameters.substitute_subject || (parameters.originalSubject || parameters.original_subject),
            substitute_room: parameters.substituteRoom || parameters.substitute_room || (parameters.originalRoom || parameters.original_room) || 'Unbekannt',
            note: parameters.note || 'Automatisch generiert (AI)',
            created_by: null
          };

          // Basic validation
          if (!insertData.class_name || !insertData.original_subject || !insertData.period) {
            result = { error: 'Unvollständige Daten. Geben Sie mindestens className, period und originalSubject an oder lassen Sie automatisch planen.' };
            break;
          }

          console.log('Inserting data (direct):', insertData)
          const { data, error } = await supabase
            .from('vertretungsplan')
            .insert(insertData)
            .select()
            .single();
          if (!error) {
            const dateStrDE = new Date(insertData.date + 'T12:00:00').toLocaleDateString('de-DE');
            await supabase.from('announcements').insert({
              title: `Vertretungsplan aktualisiert – ${insertData.class_name}`,
              content: `${dateStrDE}, ${insertData.period}. Stunde: ${insertData.original_subject} bei ${insertData.original_teacher} → ${insertData.substitute_teacher} (Raum: ${insertData.substitute_room}).`,
              author: 'E.D.U.A.R.D.',
              priority: 'high',
              target_class: String(insertData.class_name || '').toLowerCase() || null,
              target_permission_level: 1,
              created_by: null,
            });
            result = { message: 'Vertretung eingetragen.', inserted: data };
            success = true;
          } else {
            console.error('update_vertretungsplan error:', error);
            result = { error: error.message };
          }
        } else {
          result = { error: 'Keine Berechtigung zum Bearbeiten des Vertretungsplans - Level 10 erforderlich' }
        }
        break

      case 'create_announcement':
        if (userProfile.permission_lvl >= 4) {
          const { data, error } = await supabase
            .from('announcements')
            .insert({
              title: parameters.title,
              content: parameters.content,
              author: userProfile.name,
              priority: parameters.priority || 'normal',
              target_class: parameters.targetClass,
              target_permission_level: parseInt(parameters.targetPermissionLevel) || null,
              created_by: null
            })
          
          if (!error) {
            result = { message: 'Ankündigung wurde erfolgreich erstellt.' }
            success = true
          } else {
            result = { error: error.message }
          }
        } else {
          result = { error: 'Keine Berechtigung zum Erstellen von Ankündigungen' }
        }
        break

      case 'create_tts':
        if (userProfile.permission_lvl >= 10) {
          try {
            const title = parameters.title || 'TTS Durchsage';
            const text = parameters.text;
            const voiceId = parameters.voiceId || 'alloy';
            
            console.log('Creating TTS with parameters:', { title, text, voiceId });
            
            if (!text || text.trim() === '') {
              result = { error: 'Text für TTS-Durchsage darf nicht leer sein.' };
              break;
            }
            
            // Insert TTS record
            const { data: insertData, error: insertError } = await supabase
              .from('audio_announcements')
              .insert({
                title: title,
                tts_text: text,
                voice_id: voiceId,
                is_tts: true,
                created_by: null
              })
              .select()
              .single();
            
            if (insertError) {
              console.error('TTS insert error:', insertError);
              result = { error: `Fehler beim Erstellen der TTS-Durchsage: ${insertError.message}` };
              break;
            }
            
            console.log('TTS record created:', insertData);
            result = { 
              message: `TTS-Durchsage "${title}" wurde erfolgreich erstellt.`,
              id: insertData.id
            };
            success = true;
          } catch (error) {
            console.error('TTS creation error:', error);
            result = { error: `Unerwarteter Fehler beim Erstellen der TTS-Durchsage: ${(error as any).message}` };
          }
        } else {
          result = { error: 'Keine Berechtigung zum Erstellen von TTS-Durchsagen - Level 10 erforderlich' };
        }
        break

      case 'get_announcements':
        let announceQuery = supabase
          .from('announcements')
          .select('*')
          .order('created_at', { ascending: false });
        
        // Filter by user's class if they have one assigned
        if ((userProfile as any).user_class) {
          announceQuery = announceQuery.or(`target_class.eq.${(userProfile as any).user_class},target_class.is.null`);
        }
        
        const { data: announcements, error: annError } = await announceQuery;
        
        if (annError) {
          result = { error: annError.message }
        } else {
          result = { announcements: announcements || [] }
          success = true
        }
        break

      case 'get_teachers':
        const { data: teachers, error: teacherError } = await supabase
          .from('teachers')
          .select('*')
          .order('shortened')
        
        if (teacherError) {
          result = { error: teacherError.message }
        } else {
          // Create HTML table for teachers list
          const htmlTable = `
            <table style="border-collapse:collapse; width:100%; font-family:Arial,sans-serif; margin:10px 0;">
              <thead style="background:#f0f0f0;">
                <tr>
                  <th style="border:1px solid #ddd; padding:8px; text-align:left;">Kürzel</th>
                  <th style="border:1px solid #ddd; padding:8px; text-align:left;">Name</th>
                  <th style="border:1px solid #ddd; padding:8px; text-align:left;">Fächer</th>
                </tr>
              </thead>
              <tbody>
                ${(teachers || []).map((teacher: any) => `
                <tr>
                  <td style="border:1px solid #ddd; padding:8px; font-weight:bold; text-align:center;">${teacher.shortened || '-'}</td>
                  <td style="border:1px solid #ddd; padding:8px;">${teacher['first name']} ${teacher['last name']}</td>
                  <td style="border:1px solid #ddd; padding:8px;">${teacher.subjects || '-'}</td>
                </tr>`).join('')}
              </tbody>
            </table>`;
          
          result = { 
            message: `📋 **Lehrerliste** (${(teachers || []).length} Lehrkräfte)`,
            htmlTable,
            teachers: teachers || [] 
          }
          success = true
        }
        break

      case 'get_current_substitution_plan':
        // Handle specific date requests (morgen, übermorgen, etc.)
        let targetDate = null;
        if (parameters.date) {
          targetDate = parseDateTextToBerlinSchoolDay(parameters.date);
        }
        
        let subQuery = supabase
          .from('vertretungsplan')
          .select('*');
        
        // If specific date requested, filter by that date
        if (targetDate) {
          const dateStr = targetDate.toISOString().split('T')[0];
          subQuery = subQuery.eq('date', dateStr);
        }
        
        // Filter by user's class if they have one assigned
        if ((userProfile as any).user_class) {
          subQuery = subQuery.eq('class_name', (userProfile as any).user_class);
        }
        
        subQuery = subQuery.order('date', { ascending: true })
                     .order('period', { ascending: true });
        
        const { data: substitutions, error: subError } = await subQuery;
        
        if (subError) {
          result = { error: subError.message }
        } else {
          result = { substitutions: substitutions || [] }
          success = true
        }
        break
        
      case 'get_class_substitutions_week':
        try {
          const classNameRaw = parameters.className || parameters.class_name || (userProfile as any)?.user_class || '10b';
          const className = String(classNameRaw).trim();

          // Calculate current week: Monday start, end = next Monday (inclusive)
          const now = new Date();
          const day = now.getDay(); // 0=Sun..6=Sat
          const monday = new Date(now);
          const diffToMonday = (day === 0 ? -6 : 1 - day);
          monday.setDate(now.getDate() + diffToMonday);
          const nextMonday = new Date(monday);
          nextMonday.setDate(monday.getDate() + 7);

          const startISO = monday.toISOString().split('T')[0];
          const endISO = nextMonday.toISOString().split('T')[0];

          let query = supabase
            .from('vertretungsplan')
            .select('*')
            .ilike('class_name', className)
            .gte('date', startISO)
            .lte('date', endISO)
            .order('date', { ascending: true })
            .order('period', { ascending: true });

          const { data: subs, error: subsErr } = await query;
          if (subsErr) {
            result = { error: subsErr.message };
            break;
          }

          const rows = subs || [];
          const formatter = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
          const htmlRows = rows.map((r) => {
            const d = new Date(r.date + 'T12:00:00');
            const datum = formatter.format(d);
            const original = `${r.original_subject} (${r.original_teacher})`;
            const vertretung = `${r.substitute_subject || '-'} ${r.substitute_teacher ? '('+r.substitute_teacher+')' : ''}`.trim();
            return `<tr><td>${datum}</td><td>${r.period}</td><td>${original}</td><td>${vertretung}</td><td>${r.substitute_room || '-'}</td><td>${r.note || '-'}</td></tr>`;
          }).join('');

          const htmlTable = `<table style="width:100%;border-collapse:collapse;min-width:520px"><thead><tr><th style="text-align:left;border-bottom:1px solid #ddd;padding:6px">Datum</th><th style="text-align:left;border-bottom:1px solid #ddd;padding:6px">Stunde</th><th style="text-align:left;border-bottom:1px solid #ddd;padding:6px">Original</th><th style="text-align:left;border-bottom:1px solid #ddd;padding:6px">Vertretung</th><th style="text-align:left;border-bottom:1px solid #ddd;padding:6px">Raum</th><th style="text-align:left;border-bottom:1px solid #ddd;padding:6px">Notiz</th></tr></thead><tbody>${htmlRows || '<tr><td colspan="6" style="padding:6px">Keine Vertretungen gefunden.</td></tr>'}</tbody></table>`;

          result = {
            message: `Vertretungsplan der ${className} für diese Woche (${startISO}–${endISO}).`,
            substitutions: rows,
            htmlTable
          }
          success = true
        } catch (e) {
          console.error('get_class_substitutions_week error:', e);
          result = { error: 'Fehler beim Laden des Vertretungsplans.' }
        }
        break

      case 'get_class_next_subject':
        // Enhanced function to find when a specific class has a specific subject next
        try {
          const className = parameters.className || parameters.class_name;
          const subjectName = parameters.subject || parameters.subjectName;
          
          if (!className || !subjectName) {
            result = { error: 'Klasse und Fach müssen angegeben werden.' };
            break;
          }
          
          // Building table name for the class schedule
          const availableTables = ['Stundenplan_10b_A', 'Stundenplan_10c_A'];
          const tableMap: Record<string, string> = {};
          
          for (const tableName of availableTables) {
            const raw = tableName.replace('Stundenplan_', '').replace('_A', '');
            const rawLower = raw.toLowerCase();
            tableMap[rawLower] = tableName;
            tableMap[rawLower.replace(/[_\s]/g, '')] = tableName;
          }
          
          const normalizedClassName = className.toLowerCase().replace(/[_\s]/g, '');
          const table = tableMap[normalizedClassName];
          
          if (!table) {
            result = { error: `Stundenplan für Klasse "${className}" nicht gefunden. Verfügbare Klassen: 10b, 10c` };
            break;
          }
          
          // Get current schedule data
          const { data: scheduleData, error: scheduleError } = await supabase
            .from(table)
            .select('*')
            .order('Stunde');
          
          if (scheduleError) {
            result = { error: `Fehler beim Laden des Stundenplans: ${scheduleError.message}` };
            break;
          }
          
          if (!scheduleData || scheduleData.length === 0) {
            result = { error: `Keine Stundenplandaten für Klasse ${className} gefunden.` };
            break;
          }
          
          // Find next occurrence of the subject
          const today = new Date();
          const currentDay = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
          const weekDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
          const germanWeekDays = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
          // Startzeiten je Schulstunde (gemäß Blockzeiten, Näherungswerte)
          const periodStartTimes: Record<number, string> = { 1: '07:45', 2: '08:30', 3: '09:35', 4: '10:20', 5: '11:50', 6: '12:35', 7: '13:45', 8: '14:30' };
          const todayISO = today.toISOString().split('T')[0];
          const makeDateTime = (dateISO: string, hhmm: string) => new Date(`${dateISO}T${hhmm}:00`);
          
          // Helper function to parse schedule entries
          const parseEntry = (cell?: string) => {
            if (!cell) return [];
            return cell.split('|').map(s => s.trim()).filter(Boolean).map(sub => {
              const parts = sub.split(/\s+/);
              if (parts.length >= 3) {
                return { subject: parts[0].toLowerCase(), teacher: parts[1], room: parts[2] };
              }
              return { subject: sub.toLowerCase(), teacher: '', room: '' };
            });
          };
          
          // Normalize subject name for comparison
          const normalizedSearchSubject = subjectName.toLowerCase()
            .replace(/mathe/g, 'mathematik')
            .replace(/^ma$/g, 'mathematik')
            .replace(/^de$/g, 'deutsch')
            .replace(/^en$/g, 'englisch')
            .replace(/^ge$/g, 'geschichte')
            .replace(/^ek$/g, 'erdkunde')
            .replace(/^bi$/g, 'biologie')
            .replace(/^ch$/g, 'chemie')
            .replace(/^ph$/g, 'physik')
            .replace(/^sp$/g, 'sport')
            .replace(/^ku$/g, 'kunst')
            .replace(/^mu$/g, 'musik')
            .replace(/^re$/g, 'religion')
            .replace(/^et$/g, 'ethik')
            .replace(/^if$/g, 'informatik');
          
          // Search through the week starting from today
          let foundDay = null;
          let foundDetails = null;
          
          // Check from current day onwards
          for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
            const checkDay = (currentDay + dayOffset - 1) % 7; // Convert to Monday=0 index
            if (checkDay < 0 || checkDay >= 5) continue; // Skip weekends
            
            const dayColumn = weekDays[checkDay];
            
            // Check each period of the day (skip past periods when checking today)
            for (const period of scheduleData) {
              const pNum = Number(period.Stunde);
              if (dayOffset === 0) {
                const startStr = periodStartTimes[pNum as keyof typeof periodStartTimes];
                if (startStr) {
                  const start = makeDateTime(todayISO, startStr);
                  if (new Date() >= start) { continue; }
                }
              }
              const dayEntries = parseEntry(period[dayColumn]);
              
              for (const entry of dayEntries) {
                // Check if subject matches (partial matching for flexibility)
                if (entry.subject.includes(normalizedSearchSubject) || 
                    normalizedSearchSubject.includes(entry.subject) ||
                    entry.subject === normalizedSearchSubject) {
                  foundDay = germanWeekDays[checkDay];
                  foundDetails = {
                    day: foundDay,
                    period: period.Stunde,
                    subject: entry.subject,
                    teacher: entry.teacher,
                    room: entry.room,
                    fullEntry: `${entry.subject} ${entry.teacher} ${entry.room}`.trim()
                  };
                  break;
                }
              }
              if (foundDay) break;
            }
            if (foundDay) break;
          }
          
          if (foundDay && foundDetails) {
            result = {
              message: `Die Klasse ${className} hat das nächste Mal ${subjectName} am ${foundDay}.`,
              details: foundDetails,
              day: foundDay,
              period: foundDetails.period,
              teacher: foundDetails.teacher,
              room: foundDetails.room
            };
            success = true;
          } else {
            result = { 
              message: `Die Klasse ${className} hat kein ${subjectName} in der aktuellen Woche im Stundenplan.`,
              searchedSubject: normalizedSearchSubject,
              availableSubjects: scheduleData.flatMap(period => 
                weekDays.flatMap(day => parseEntry(period[day]).map(e => e.subject))
              ).filter((v, i, a) => a.indexOf(v) === i) // unique subjects
            };
          }
        } catch (error) {
          console.error('Error in get_class_next_subject:', error);
          result = { error: `Fehler bei der Stundenplan-Abfrage: ${(error as any).message}` };
        }
        break
        if ((userProfile as any).user_class) {
          // Get current schedule for user's class
          const scheduleTableName = `Stundenplan_${(userProfile as any).user_class}_A`;
          
          const { data: scheduleData, error: scheduleError } = await supabase
            .from(scheduleTableName)
            .select('*');
          
          if (scheduleError) {
            result = { error: `Stundenplan für Klasse ${(userProfile as any).user_class} konnte nicht geladen werden.` };
          } else {
            // Process schedule and find next occurrence of subject
            const requestedSubject = parameters.subject?.toLowerCase();
            const nextLesson = findNextSubjectLesson(scheduleData, requestedSubject);
            
            if (nextLesson) {
              result = nextLesson;
              success = true;
            } else {
              result = { message: `Kein nächster Termin für ${parameters.subject} gefunden.` };
            }
          }
        } else {
          result = { error: 'Ihre Klasse ist nicht in Ihrem Profil hinterlegt.' };
        }
        break

      case 'get_class_next_subjects_all': {
        try {
          const className = parameters.className || parameters.class_name;
          if (!className) {
            result = { error: 'Klasse muss angegeben werden.' };
            break;
          }
          // Resolve schedule table
          const availableTables = ['Stundenplan_10b_A', 'Stundenplan_10c_A'];
          const tableMap: Record<string,string> = {};
          for (const t of availableTables) {
            const raw = t.replace('Stundenplan_','').replace('_A','');
            const key = raw.toLowerCase().replace(/[_\s]/g,'');
            tableMap[key] = t;
          }
          const tKey = String(className).toLowerCase().replace(/[_\s]/g,'');
          const table = tableMap[tKey];
          if (!table) { result = { error: `Stundenplan für Klasse "${className}" nicht gefunden.` }; break; }
          const { data: rows, error } = await supabase.from(table).select('*').order('Stunde');
          if (error) { result = { error: `Fehler beim Laden des Stundenplans: ${error.message}` }; break; }
          const weekDays = ['monday','tuesday','wednesday','thursday','friday'];
          const germanWeekDays = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag'];
          const parseEntry = (cell?: string) => {
            if (!cell) return [] as Array<{subject:string,teacher:string,room:string}>;
            return cell.split('|').map(s=>s.trim()).filter(Boolean).map(sub=>{
              const parts = sub.split(/\s+/);
              if (parts.length>=3) return {subject:parts[0].toLowerCase(),teacher:parts[1],room:parts[2]};
              return {subject:sub.toLowerCase(),teacher:'',room:''};
            });
          };
          const periodStartTimes: Record<number,string> = {1:'07:45',2:'08:30',3:'09:35',4:'10:20',5:'11:50',6:'12:35',7:'13:45',8:'14:30'};
          const today = new Date();
          const todayISO = today.toISOString().split('T')[0];
          const makeDateTime = (dateISO:string, hhmm:string) => new Date(`${dateISO}T${hhmm}:00`);
          // Collect unique subjects
          const subjects = new Set<string>();
          for (const r of rows || []) {
            for (const d of weekDays) parseEntry((r as any)[d]).forEach(e=>subjects.add(e.subject));
          }
          // Function to find next occurrence for a subject
          const findNext = (subject: string) => {
            const currentDay = today.getDay();
            for (let dayOffset=0; dayOffset<7; dayOffset++) {
              const checkDay = (currentDay + dayOffset - 1) % 7;
              if (checkDay < 0 || checkDay >= 5) continue;
              const dayCol = weekDays[checkDay];
              for (const r of rows || []) {
                const pNum = Number((r as any).Stunde);
                if (dayOffset===0) {
                  const startStr = periodStartTimes[pNum as keyof typeof periodStartTimes];
                  if (startStr) {
                    const start = makeDateTime(todayISO, startStr);
                    if (new Date() >= start) continue;
                  }
                }
                const entries = parseEntry((r as any)[dayCol]);
                const hit = entries.find(e=> e.subject===subject || e.subject.includes(subject) || subject.includes(e.subject));
                if (hit) {
                  return { subject, day: germanWeekDays[checkDay], period: pNum, teacher: hit.teacher, room: hit.room };
                }
              }
            }
            return null;
          };
          const results: Array<any> = [];
          subjects.forEach((subj)=>{
            const res = findNext(subj);
            if (res) results.push(res);
          });
          // Sort by day then period
          const dayOrder: Record<string,number> = {Montag:0,Dienstag:1,Mittwoch:2,Donnerstag:3,Freitag:4};
          results.sort((a,b)=> (dayOrder[a.day]-dayOrder[b.day]) || (a.period-b.period));
          const rowsHtml = results.map(r=>`<tr><td>${r.subject}</td><td>${r.day}</td><td>${r.period}</td><td>${r.teacher||'-'}</td><td>${r.room||'-'}</td></tr>`).join('');
          const htmlTable = `<table style="width:100%;border-collapse:collapse;min-width:520px"><thead><tr><th style=\"text-align:left;border-bottom:1px solid #ddd;padding:6px\">Fach</th><th style=\"text-align:left;border-bottom:1px solid #ddd;padding:6px\">Tag</th><th style=\"text-align:left;border-bottom:1px solid #ddd;padding:6px\">Stunde</th><th style=\"text-align:left;border-bottom:1px solid #ddd;padding:6px\">Lehrer</th><th style=\"text-align:left;border-bottom:1px solid #ddd;padding:6px\">Raum</th></tr></thead><tbody>${rowsHtml || '<tr><td colspan=\"5\" style=\"padding:6px\">Keine Daten gefunden.</td></tr>'}</tbody></table>`;
          result = { message: `Nächste Termine je Fach für Klasse ${String(className).toUpperCase()}.`, items: results, htmlTable };
          success = true;
        } catch (e:any) {
          console.error('get_class_next_subjects_all error:', e);
          result = { error: e.message || 'Fehler bei der Bestimmung der nächsten Fächer' };
        }
        break;
      }

      case 'get_schedule':
        try {
          const className = parameters.className || parameters.class_name || '10b';
          const dayParam = parameters.day;
          
          // Building weekly mapping and tables dynamically
          const WEEKDAY_MAP: Record<string, number> = {
            'montag': 1, 'monday': 1, 'mo': 1,
            'dienstag': 2, 'tuesday': 2, 'di': 2,
            'mittwoch': 3, 'wednesday': 3, 'mi': 3,
            'donnerstag': 4, 'thursday': 4, 'do': 4,
            'freitag': 5, 'friday': 5, 'fr': 5,
          };
          const WEEKDAY_COLUMNS: Record<number, string> = {
            1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday'
          };

          // Use static table list to avoid raw SQL in edge functions
          const availableTables = ['Stundenplan_10b_A', 'Stundenplan_10c_A'];
          
          // Build class mapping (robust normalization) - improved to handle all classes
          const tableMap: Record<string, string> = {};
          const availableClasses: string[] = [];
          
          for (const tableName of availableTables) {
            const raw = tableName.replace('Stundenplan_', '').replace('_A', ''); // e.g., '10b'
            const rawLower = raw.toLowerCase();
            const keyVariants = new Set<string>([
              rawLower,
              rawLower.replace(/[_\s]/g, ''), // remove underscores/spaces
            ]);
            keyVariants.forEach(k => tableMap[k] = tableName);
            availableClasses.push(raw); // display without 'Stundenplan_'
          }

          const normalizedInput = className.toLowerCase().replace(/[_\s]/g, '');
          let table = tableMap[normalizedInput];

          if (!table) {
            // Fallback: try partial matching safely
            const entry = Object.entries(tableMap).find(([k]) => 
              k === normalizedInput || k.startsWith(normalizedInput) || normalizedInput.startsWith(k)
            );
            if (entry) table = entry[1];
          }

          if (!table) {
            result = { 
              error: `E.D.U.A.R.D.: Stundenplan für Klasse "${className}" nicht gefunden. Verfügbare Klassen: ${availableClasses.join(', ')}` 
            };
            break;
          }

          const { data: rows, error } = await supabase.from(table).select('*').order('Stunde');
          if (error) throw error;
          
          if (!rows || rows.length === 0) {
            result = { 
              error: `E.D.U.A.R.D.: Keine Einträge für Klasse "${className}" gefunden. Bitte überprüfen Sie die Stundenplandaten.` 
            };
            break;
          }

          const normalizeDayToColumn = (d: string) => {
            const key = d.toLowerCase();
            const num = WEEKDAY_MAP[key];
            if (!num) return '';
            return WEEKDAY_COLUMNS[num] || '';
          };
          const dayKey = dayParam ? normalizeDayToColumn(dayParam) : '';

          // Parse helper like used in substitution planning
          const parseCell = (cell?: string) => {
            if (!cell) return [] as Array<{subject:string, teacher:string, room:string}>;
            return cell.split('|').map(s => s.trim()).filter(Boolean).map(sub => {
              const parts = sub.split(/\s+/);
              if (parts.length >= 3) {
                return { subject: parts[0], teacher: parts[1], room: parts[2] };
              }
              return { subject: sub, teacher: '', room: '' } as any;
            });
          };

          // Build weekly grid data
          const schedule = (rows || []).map((r: any) => {
            const period = r['Stunde'];
            return {
              period,
              monday: r['monday'],
              tuesday: r['tuesday'],
              wednesday: r['wednesday'],
              thursday: r['thursday'],
              friday: r['friday'],
            };
          });

          // Build HTML table like on the Stundenplan page
          const parseEntry = (cell?: string) => {
            if (!cell) return [];
            return cell.split('|').map(s => s.trim()).filter(Boolean).map(sub => {
              const parts = sub.split(/\s+/);
              if (parts.length >= 3) {
                return { subject: parts[0], teacher: parts[1], room: parts[2] };
              }
              return { subject: sub, teacher: '', room: '' };
            });
          };

          const formatCellHTML = (entry?: string) => {
            const entries = parseEntry(entry);
            if (entries.length === 0) return '<div style="text-align:center; color:#666;">-</div>';
            
            if (entries.length > 1) {
              return `<div style="display:grid; grid-template-columns:1fr 1fr; gap:4px;">${entries.map(e => 
                `<div style="padding:4px; background:#f5f5f5; border-radius:4px; font-size:12px; border:1px solid #ddd;">
                  <div style="font-weight:500;">${e.subject}</div>
                  <div style="color:#666;">${e.teacher}</div>
                  <div style="color:#666;">${e.room}</div>
                </div>`
              ).join('')}</div>`;
            } else {
              const e = entries[0];
              return `<div style="text-align:center; font-size:13px;">
                <div style="font-weight:500; margin-bottom:2px;">${e.subject}</div>
                <div style="color:#666; font-size:11px;">${e.teacher}</div>
                <div style="color:#666; font-size:11px;">${e.room}</div>
              </div>`;
            }
          };

          let htmlTable = '';
          if (dayKey && rows) {
            // Single day view (filtered by day column)
            htmlTable = `
            <table style="border-collapse:collapse; width:100%; font-family:Arial,sans-serif;">
              <thead style="background:#f0f0f0;">
                <tr>
                  <th style="border:1px solid #ddd; padding:8px; text-align:center;">Block</th>
                  <th style="border:1px solid #ddd; padding:8px; text-align:center;">${dayParam.charAt(0).toUpperCase() + dayParam.slice(1)}</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((r: any) => `
                <tr>
                  <td style="border:1px solid #ddd; padding:8px; text-align:center; font-weight:bold;">${r.Stunde}</td>
                  <td style="border:1px solid #ddd; padding:4px;">${formatCellHTML(r[dayKey])}</td>
                </tr>`).join('')}
              </tbody>
            </table>`;
          } else {
            // Full week view
            htmlTable = `
            <table style="border-collapse:collapse; width:100%; font-family:Arial,sans-serif;">
              <thead style="background:#f0f0f0;">
                <tr>
                  <th style="border:1px solid #ddd; padding:8px; text-align:center;">Block</th>
                  <th style="border:1px solid #ddd; padding:8px; text-align:center;">Montag</th>
                  <th style="border:1px solid #ddd; padding:8px; text-align:center;">Dienstag</th>
                  <th style="border:1px solid #ddd; padding:8px; text-align:center;">Mittwoch</th>
                  <th style="border:1px solid #ddd; padding:8px; text-align:center;">Donnerstag</th>
                  <th style="border:1px solid #ddd; padding:8px; text-align:center;">Freitag</th>
                </tr>
              </thead>
              <tbody>
                ${(rows || []).map((r: any) => `
                <tr>
                  <td style="border:1px solid #ddd; padding:8px; text-align:center; font-weight:bold;">${r.Stunde}</td>
                  <td style="border:1px solid #ddd; padding:4px;">${formatCellHTML(r.monday)}</td>
                  <td style="border:1px solid #ddd; padding:4px;">${formatCellHTML(r.tuesday)}</td>
                  <td style="border:1px solid #ddd; padding:4px;">${formatCellHTML(r.wednesday)}</td>
                  <td style="border:1px solid #ddd; padding:4px;">${formatCellHTML(r.thursday)}</td>
                  <td style="border:1px solid #ddd; padding:4px;">${formatCellHTML(r.friday)}</td>
                </tr>`).join('')}
              </tbody>
            </table>`;
          }

          result = {
            message: dayKey
              ? `Stundenplan für Klasse ${className.toUpperCase()} am ${dayParam.charAt(0).toUpperCase() + dayParam.slice(1)}`
              : `Stundenplan (Woche) für Klasse ${className.toUpperCase()}`,
            schedule,
            htmlTable,
          };
          success = true;
        } catch (e: any) {
          console.error('get_schedule error:', e);
          result = { error: e.message || 'Fehler beim Laden des Stundenplans' };
        }
        break;

      case 'plan_substitution': {
        // Check permissions - Level 9+ required for substitution planning
        const userLevel = userProfile?.permission_lvl || 1;
        if (userLevel < 9) {
          result = { error: 'Berechtigung Level 9+ erforderlich für Vertretungsplanung' };
          break;
        }
        
        try {
          const teacherName = String(parameters?.teacherName || '').trim();
          if (!teacherName) {
            result = { error: 'Bitte geben Sie den erkrankten Lehrer an.' };
            break;
          }

          // Parse date(s) - support single date and ranges
          const dateParam = parameters?.date || parameters?.dateFrom || 'heute';
          const dateToParam = parameters?.dateTo || null;
          
          // Parse natural language periods (e.g. "1. Stunde", "1-4", "in der 3.")
          let periodFrom: number | undefined;
          let periodTo: number | undefined;
          const periodParam = parameters?.period || parameters?.periodFrom || null;
          const periodToP = parameters?.periodTo || null;
          
          if (periodParam) {
            const pMatch = String(periodParam).match(/(\d+)/);
            if (pMatch) periodFrom = parseInt(pMatch[1]);
          }
          if (periodToP) {
            const pMatch = String(periodToP).match(/(\d+)/);
            if (pMatch) periodTo = parseInt(pMatch[1]);
          }
          // If only periodFrom set, make it a single-period filter
          if (periodFrom && !periodTo) periodTo = periodFrom;

          // Resolve teacher abbreviation
          const { data: teacherRows, error: tErr } = await supabase
            .from('teachers')
            .select('shortened, "last name", "first name", subjects');
          if (tErr) throw tErr;

          const teacherNameNorm = stripTitles(teacherName);
          const teacherRow = (teacherRows || []).find((t: any) => {
            const lastName = normalize(t['last name'] || '');
            const firstName = normalize(t['first name'] || '');
            const abbr = normalize(t.shortened || '');
            const full = `${firstName} ${lastName}`.trim();
            return lastName.includes(teacherNameNorm) || firstName.includes(teacherNameNorm) || full.includes(teacherNameNorm) || abbr === teacherNameNorm;
          });

          if (!teacherRow) {
            result = { error: `Lehrer "${teacherName}" nicht gefunden. Verfügbare: ${(teacherRows || []).map((t: any) => t['last name']).join(', ')}` };
            break;
          }

          const absentTeacher = teacherRow.shortened;
          const teacherDisplay = teacherRow['last name'] || teacherName;

          // Determine if range or single date
          const isRange = dateToParam != null;
          let engineAction: string;
          let engineData: any;

          if (isRange) {
            const from = parseDateTextToBerlinSchoolDay(dateParam);
            const to = parseDateTextToBerlinSchoolDay(dateToParam);
            engineAction = 'find_substitutions_range';
            engineData = {
              absentTeacher,
              dateFrom: from.toISOString().split('T')[0],
              dateTo: to.toISOString().split('T')[0],
              mode: 'assisted',
              ...(periodFrom != null ? { periodFrom, periodTo } : {})
            };
          } else {
            // Check for "diese woche" / "this week" keywords
            const dateNorm = normalize(dateParam);
            const isThisWeek = dateNorm.includes('diese woche') || dateNorm.includes('ganze woche') || dateNorm.includes('whole week');
            
            if (isThisWeek) {
              const now = new Date();
              const berlinTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (2 * 3600000));
              const dow = berlinTime.getDay();
              const monday = new Date(berlinTime);
              monday.setDate(berlinTime.getDate() - (dow === 0 ? 6 : dow - 1));
              const friday = new Date(monday);
              friday.setDate(monday.getDate() + 4);
              
              engineAction = 'find_substitutions_range';
              engineData = {
                absentTeacher,
                dateFrom: monday.toISOString().split('T')[0],
                dateTo: friday.toISOString().split('T')[0],
                mode: 'assisted',
                ...(periodFrom != null ? { periodFrom, periodTo } : {})
              };
            } else {
              const target = parseDateTextToBerlinSchoolDay(dateParam);
              engineAction = 'find_substitutions';
              engineData = {
                absentTeacher,
                date: target.toISOString().split('T')[0],
                mode: 'assisted',
                ...(periodFrom != null ? { periodFrom, periodTo } : {})
              };
            }
          }

          console.log('[ai-actions] Calling substitution-engine:', engineAction, engineData);

          // Call substitution-engine edge function internally via HTTP
          const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
          const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
          
          const engineResponse = await fetch(`${supabaseUrl}/functions/v1/substitution-engine`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              action: engineAction,
              sessionId,
              data: engineData
            })
          });

          const engineResult = await engineResponse.json();
          console.log('[ai-actions] Engine result success:', engineResult.success, 'stats:', engineResult.stats);

          if (!engineResult.success) {
            result = { error: engineResult.error || 'Fehler bei der Vertretungsplanung' };
            break;
          }

          // Flatten results: single day or multi-day
          let allSuggestions: any[] = [];
          let dateStr: string;
          
          if (engineResult.dayResults) {
            // Range result
            for (const [day, subs] of Object.entries(engineResult.dayResults)) {
              (subs as any[]).forEach((s: any) => allSuggestions.push({ ...s, date: day }));
            }
            dateStr = engineData.dateFrom;
          } else {
            allSuggestions = (engineResult.suggestions || []).map((s: any) => ({
              ...s,
              date: s.date || engineData.date
            }));
            dateStr = engineData.date;
          }

          // Format substitutions for the chat UI
          const substitutions = allSuggestions.map((s: any) => ({
            className: s.className,
            period: s.period,
            subject: s.subjectAbbrev || s.subject,
            originalTeacher: s.originalTeacher || absentTeacher,
            room: s.room,
            substituteRoom: s.substituteRoom || s.room,
            substituteTeacher: s.suggestedSubstitute || 'Entfall',
            substituteShortened: s.substituteShortened || null,
            alternativeSubject: s.alternativeSubject || null,
            reason: s.reason || '',
            score: s.score || 0,
            date: s.date || dateStr,
            isCascade: s.isCascade || false,
            originalVertretungId: s.originalVertretungId || null,
            swapSuggestion: s.swapSuggestion || null
          }));

          const stats = engineResult.stats || {};
          const dayName = new Date(dateStr + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long' });

          const cascadeCount = substitutions.filter((s: any) => s.isCascade).length;
          const timetableCount = substitutions.length - cascadeCount;
          const cascadeInfo = cascadeCount > 0 ? ` Davon ${cascadeCount} Kaskade-Einträge (${teacherDisplay} war als Vertretung eingetragen).` : '';

          result = { 
            details: { 
              date: dateStr, 
              teacher: teacherDisplay, 
              substitutions,
              engineUsed: true,
              cascadeDepth: engineResult.cascadeDepth || 0,
              excludedSickTeachers: engineResult.excludedSickTeachers || []
            }, 
            message: substitutions.length > 0
              ? `Vertretungsplan für ${teacherDisplay} erstellt (${stats.totalAssigned || stats.assigned || 0} zugewiesen, ${stats.totalCancelled || stats.cancelled || 0} Entfall).${cascadeInfo} ${engineResult.cascadeDepth > 0 ? `Kaskade Tiefe: ${engineResult.cascadeDepth}.` : ''}`
              : `Keine Stunden für ${teacherDisplay} am ${dayName} gefunden (weder im Stundenplan noch als Vertretung eingetragen).`
          };
          success = true;
        } catch (e: any) {
          console.error('plan_substitution error:', e);
          result = { error: e.message || 'Fehler beim Generieren des Vertretungsplans' };
        }
        break;
      }

      case 'confirm_substitution': {
        // Check permissions - Level 9+ required for substitution confirmation
        const confUserLevel = userProfile?.permission_lvl || 1;
        if (confUserLevel < 9) {
          result = { error: 'Berechtigung Level 9+ erforderlich für Vertretungsplan-Bestätigung' };
          break;
        }
        
        try {
          const subs: any[] = Array.isArray(parameters?.substitutions) ? parameters.substitutions : [];
          const sickTeacher: string = parameters?.sickTeacher || '';
          const dateStr: string = parameters?.date || '';

          if (subs.length === 0) {
            result = { error: 'Keine Einträge zum Speichern vorhanden.' };
            break;
          }

          // Check if substitutions came from the engine (have substituteShortened etc.)
          const engineUsed = subs.some((s: any) => s.substituteShortened || s.substituteRoom);

          if (engineUsed) {
            // Use substitution-engine confirm for proper room assignment, abbreviation, cascade notes
            const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
            const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
            
            const engineResponse = await fetch(`${supabaseUrl}/functions/v1/substitution-engine`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                action: 'confirm_substitutions',
                sessionId,
                data: {
                  date: dateStr || subs[0]?.date,
                  absentTeacher: sickTeacher,
                  substitutions: subs.map((s: any) => ({
                    className: s.className || s.class_name,
                    period: s.period,
                    subject: s.subject,
                    room: s.room,
                    substituteRoom: s.substituteRoom || s.room,
                    substituteTeacher: s.substituteTeacher || '',
                    substituteShortened: s.substituteShortened || '',
                    originalTeacher: s.originalTeacher || sickTeacher,
                    alternativeSubject: s.alternativeSubject || null,
                    date: s.date || dateStr,
                    isCascade: s.isCascade || false,
                    originalVertretungId: s.originalVertretungId || null,
                    swapSuggestion: s.swapSuggestion || null
                  }))
                }
              })
            });

            const engineResult = await engineResponse.json();
            
            if (!engineResult.success) {
              result = { error: engineResult.error || 'Fehler beim Speichern' };
              break;
            }

            result = { 
              message: `Vertretungsplan gespeichert (${engineResult.created || subs.length} Einträge)`,
              count: engineResult.created || subs.length,
              confirmed: subs.map((s: any) => `${(s.className || s.class_name || '').toUpperCase()} ${s.period}. Std: ${s.substituteTeacher || 'Entfall'}`)
            };
            success = true;
          } else {
            // Legacy path: direct insert
            const rows = subs.map((s: any) => ({
              date: s.date || dateStr,
              class_name: String(s.class_name || s.className || '').toLowerCase(),
              period: Number(s.period) || 1,
              original_teacher: sickTeacher || s.original_teacher || s.originalTeacher || 'Unbekannt',
              original_subject: s.original_subject || s.subject || 'Unbekannt',
              original_room: s.original_room || s.room || 'Unbekannt',
              substitute_teacher: s.substitute_teacher || s.substituteTeacher || 'Vertretung',
              substitute_subject: s.substitute_subject || s.subject || 'Vertretung',
              substitute_room: s.substitute_room || s.room || 'Unbekannt',
              note: 'Automatisch generiert (AI)',
              created_by: null
            }));

            const { error: insErr } = await supabase.from('vertretungsplan').insert(rows);
            if (insErr) throw insErr;

            result = { 
              message: 'Vertretungsplan gespeichert',
              count: rows.length,
              confirmed: rows.map((r: any) => `${r.class_name} ${r.period}. Std: ${r.substitute_teacher}`)
            };
            success = true;
          }

          // Create announcement only for legacy direct-insert path.
          // Engine-based confirmations create announcements in substitution-engine.
          if (!engineUsed) {
            const allDates = [...new Set(subs.map((s: any) => s.date || dateStr))];
            const dateDE = allDates
              .map((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00`).toLocaleDateString('de-DE') : d)
              .join(', ');
            const classNames = [...new Set(
              subs
                .map((s: any) => String(s.className || s.class_name || '').trim().toLowerCase())
                .filter(Boolean)
            )];

            const announcementRows = classNames.length > 0
              ? classNames.map((className) => ({
                  title: `Vertretungsplan aktualisiert – ${dateDE}`,
                  content: subs
                    .filter((s: any) => String(s.className || s.class_name || '').trim().toLowerCase() === className)
                    .map((s: any) => `${className.toUpperCase()}, ${s.period}. Stunde: ${s.subject} → ${s.substituteTeacher || s.substitute_teacher || 'Entfall'}`)
                    .join('\n'),
                  author: 'E.D.U.A.R.D.',
                  priority: 'high',
                  target_class: className,
                  target_permission_level: 1,
                  created_by: null,
                }))
              : [{
                  title: `Vertretungsplan aktualisiert – ${dateDE}`,
                  content: subs.map((s: any) =>
                    `${String(s.className || s.class_name || '').toUpperCase()}, ${s.period}. Stunde: ${s.subject} → ${s.substituteTeacher || s.substitute_teacher || 'Entfall'}`
                  ).join('\n'),
                  author: 'E.D.U.A.R.D.',
                  priority: 'high',
                  target_class: null,
                  target_permission_level: 1,
                  created_by: null,
                }];

            await supabase.from('announcements').insert(announcementRows);
          }

        } catch (e: any) {
          console.error('confirm_substitution error:', e);
          result = { error: e.message || 'Fehler beim Speichern des Vertretungsplans' };
        }
        break;
      }

      case 'show_schedule': {
        // Display normal schedule for a class
        try {
          const className = parameters.className || parameters.class_name;
          const dayParam = parameters.day;
          
          if (!className) {
            result = { error: 'Klasse muss angegeben werden (z.B. "10b").' };
            break;
          }

          // Build table mapping
          const availableTables = ['Stundenplan_10b_A', 'Stundenplan_10c_A'];
          const tableMap: Record<string, string> = {};
          const availableClasses: string[] = [];
          
          for (const tableName of availableTables) {
            const raw = tableName.replace('Stundenplan_', '').replace('_A', '');
            const rawLower = raw.toLowerCase();
            const keyVariants = [rawLower, rawLower.replace(/[_\s]/g, '')];
            keyVariants.forEach(k => tableMap[k] = tableName);
            availableClasses.push(raw);
          }

          const normalizedInput = className.toLowerCase().replace(/[_\s]/g, '');
          let table = tableMap[normalizedInput];

          if (!table) {
            const entry = Object.entries(tableMap).find(([k]) => 
              k === normalizedInput || k.startsWith(normalizedInput) || normalizedInput.startsWith(k)
            );
            if (entry) table = entry[1];
          }

          if (!table) {
            result = { 
              error: `Stundenplan für Klasse "${className}" nicht gefunden. Verfügbare Klassen: ${availableClasses.join(', ')}` 
            };
            break;
          }

          const { data: rows, error } = await supabase.from(table).select('*').order('Stunde');
          if (error) throw error;
          
          if (!rows || rows.length === 0) {
            result = { 
              error: `Keine Stundenplandaten für Klasse "${className}" gefunden.` 
            };
            break;
          }

          // Parse helper
          const parseEntry = (cell?: string) => {
            if (!cell) return [];
            return cell.split('|').map(s => s.trim()).filter(Boolean).map(sub => {
              const parts = sub.split(/\s+/);
              if (parts.length >= 3) {
                return { subject: parts[0], teacher: parts[1], room: parts[2] };
              }
              return { subject: sub, teacher: '', room: '' };
            });
          };

          const formatCellHTML = (entry?: string) => {
            const entries = parseEntry(entry);
            if (entries.length === 0) return '<div style="text-align:center; color:#666;">-</div>';
            
            if (entries.length > 1) {
              return `<div style="display:grid; grid-template-columns:1fr 1fr; gap:4px;">${entries.map(e => 
                `<div style="padding:4px; background:#f5f5f5; border-radius:4px; font-size:12px; border:1px solid #ddd;">
                  <div style="font-weight:500;">${e.subject}</div>
                  <div style="color:#666;">${e.teacher}</div>
                  <div style="color:#666;">${e.room}</div>
                </div>`
              ).join('')}</div>`;
            } else {
              const e = entries[0];
              return `<div style="text-align:center; font-size:13px;">
                <div style="font-weight:500; margin-bottom:2px;">${e.subject}</div>
                <div style="color:#666; font-size:11px;">${e.teacher}</div>
                <div style="color:#666; font-size:11px;">${e.room}</div>
              </div>`;
            }
          };

          // Build HTML table
          const htmlTable = `
            <table style="border-collapse:collapse; width:100%; font-family:Arial,sans-serif;">
              <thead style="background:#f0f0f0;">
                <tr>
                  <th style="border:1px solid #ddd; padding:8px; text-align:center;">Stunde</th>
                  <th style="border:1px solid #ddd; padding:8px; text-align:center;">Montag</th>
                  <th style="border:1px solid #ddd; padding:8px; text-align:center;">Dienstag</th>
                  <th style="border:1px solid #ddd; padding:8px; text-align:center;">Mittwoch</th>
                  <th style="border:1px solid #ddd; padding:8px; text-align:center;">Donnerstag</th>
                  <th style="border:1px solid #ddd; padding:8px; text-align:center;">Freitag</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((r: any) => `
                <tr>
                  <td style="border:1px solid #ddd; padding:8px; text-align:center; font-weight:bold; background:#f5f5f5;">${r.Stunde}</td>
                  <td style="border:1px solid #ddd; padding:4px;">${formatCellHTML(r.monday)}</td>
                  <td style="border:1px solid #ddd; padding:4px;">${formatCellHTML(r.tuesday)}</td>
                  <td style="border:1px solid #ddd; padding:4px;">${formatCellHTML(r.wednesday)}</td>
                  <td style="border:1px solid #ddd; padding:4px;">${formatCellHTML(r.thursday)}</td>
                  <td style="border:1px solid #ddd; padding:4px;">${formatCellHTML(r.friday)}</td>
                </tr>`).join('')}
              </tbody>
            </table>`;

          result = {
            message: `Stundenplan für Klasse ${className.toUpperCase()}`,
            htmlTable
          };
          success = true;
        } catch (e: any) {
          console.error('show_schedule error:', e);
          result = { error: e.message || 'Fehler beim Laden des Stundenplans' };
        }
        break;
      }

      case 'show_substitution_plan': {
        // Display substitution plan with normal schedule but substitutions highlighted in red
        try {
          const className = parameters.className || parameters.class_name;
          let targetDate = parameters.date ? parseDateTextToBerlinSchoolDay(parameters.date) : new Date();
          
          if (!className) {
            result = { error: 'Klasse muss angegeben werden (z.B. "10b").' };
            break;
          }

          // Determine week range (Monday to Friday) around targetDate
          const getISO = (d: Date) => d.toISOString().split('T')[0];
          const ref = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
          const dow = ref.getDay(); // 0=Sun..6=Sat
          const diffToMonday = (dow === 0 ? -6 : 1 - dow);
          const monday = new Date(ref);
          monday.setDate(ref.getDate() + diffToMonday);
          const nextMonday = new Date(monday);
          nextMonday.setDate(monday.getDate() + 7);
          const mondayISO = getISO(monday);
          const nextMondayISO = getISO(nextMonday);

          // Get schedule table
          const availableTables = ['Stundenplan_10b_A', 'Stundenplan_10c_A'];
          const tableMap: Record<string, string> = {};
          for (const tableName of availableTables) {
            const raw = tableName.replace('Stundenplan_', '').replace('_A', '');
            const rawLower = raw.toLowerCase();
            const keyVariants = [rawLower, rawLower.replace(/[_\s]/g, '')];
            keyVariants.forEach(k => tableMap[k] = tableName);
          }

          const normalizedInput = className.toLowerCase().replace(/[_\s]/g, '');
          let table = tableMap[normalizedInput];
          if (!table) {
            const entry = Object.entries(tableMap).find(([k]) => 
              k === normalizedInput || k.startsWith(normalizedInput) || normalizedInput.startsWith(k)
            );
            if (entry) table = entry[1];
          }
          if (!table) { result = { error: `Stundenplan für Klasse "${className}" nicht gefunden.` }; break; }

          // Get normal schedule (for layout)
          const { data: scheduleRows, error: scheduleError } = await supabase.from(table).select('*').order('Stunde');
          if (scheduleError) throw scheduleError;

          // Get ALL substitutions for the whole week for this class
          const { data: substitutions, error: subError } = await supabase
            .from('vertretungsplan')
            .select('*')
            .ilike('class_name', className)
            .gte('date', mondayISO)
            .lt('date', nextMondayISO);
          if (subError) throw subError;

          // Map substitutions by date+period => substitution
          const subMap: Record<string, any> = {};
          (substitutions || []).forEach(sub => {
            const key = `${sub.date}-${sub.period}`;
            if (!subMap[key]) subMap[key] = sub; // first wins
          });

          // Helper to parse schedule cell
          const parseEntry = (cell?: string) => {
            if (!cell) return [] as Array<{subject:string, teacher:string, room:string}>;
            return cell.split('|').map(s => s.trim()).filter(Boolean).map(sub => {
              const parts = sub.split(/\s+/);
              if (parts.length >= 3) return { subject: parts[0], teacher: parts[1], room: parts[2] };
              return { subject: sub, teacher: '', room: '' };
            });
          };

          // Dates for columns
          const colDates: Record<'monday'|'tuesday'|'wednesday'|'thursday'|'friday', string> = {
            monday: getISO(monday),
            tuesday: getISO(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 1)),
            wednesday: getISO(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 2)),
            thursday: getISO(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3)),
            friday: getISO(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4)),
          };

          const formatCellHTML = (entry?: string, period?: number, column?: keyof typeof colDates) => {
            const dateISO = (column && period) ? colDates[column] : undefined;
            const sub = (dateISO && period) ? subMap[`${dateISO}-${period}`] : null;

            if (sub) {
              return `<div style="padding:8px; min-height:60px; display:flex; flex-direction:column; justify-content:center; background:#ffebee; border:1px solid #f44336; border-radius:4px; color:#d32f2f;">
                <div style="font-weight:500; margin-bottom:2px;">${sub.substitute_subject || sub.original_subject}</div>
                <div style="font-size:11px; margin-bottom:1px;">${sub.substitute_teacher || 'Vertretung'}</div>
                <div style="font-size:11px; margin-bottom:2px;">${sub.substitute_room || sub.original_room || '-'}</div>
                <div style="font-size:10px; font-style:italic;">Vertretung</div>
              </div>`;
            }

            const entries = parseEntry(entry);
            if (entries.length === 0) return '<div style="text-align:center; color:#666;">-</div>';
            if (entries.length > 1) {
              return `<div style="display:grid; grid-template-columns:1fr 1fr; gap:4px;">${entries.map(e => 
                `<div style=\"padding:4px; background:#f5f5f5; border-radius:4px; font-size:12px; border:1px solid #ddd;\">
                  <div style=\"font-weight:500;\">${e.subject}</div>
                  <div style=\"color:#666;\">${e.teacher}</div>
                  <div style=\"color:#666;\">${e.room}</div>
                </div>`
              ).join('')}</div>`;
            }
            const e = entries[0];
            return `<div style="text-align:center; font-size:13px; padding:8px; min-height:60px; display:flex; flex-direction:column; justify-content:center;">
              <div style="font-weight:500; margin-bottom:2px;">${e.subject}</div>
              <div style="color:#666; font-size:11px;">${e.teacher}</div>
              <div style="color:#666; font-size:11px;">${e.room}</div>
            </div>`;
          };

          // Build HTML table (weekly view with red substitutions)
          const htmlTable = `
            <table style="border-collapse:collapse; width:100%; font-family:Arial,sans-serif;">
              <thead style="background:#f0f0f0;">
                <tr>
                  <th style="border:1px solid #ddd; padding:8px; text-align:center;">Stunde</th>
                  <th style="border:1px solid #ddd; padding:8px; text-align:center;">Montag<br/><span style=\"font-weight:normal; font-size:11px; color:#666;\">${colDates.monday}</span></th>
                  <th style="border:1px solid #ddd; padding:8px; text-align:center;">Dienstag<br/><span style=\"font-weight:normal; font-size:11px; color:#666;\">${colDates.tuesday}</span></th>
                  <th style="border:1px solid #ddd; padding:8px; text-align:center;">Mittwoch<br/><span style=\"font-weight:normal; font-size:11px; color:#666;\">${colDates.wednesday}</span></th>
                  <th style="border:1px solid #ddd; padding:8px; text-align:center;">Donnerstag<br/><span style=\"font-weight:normal; font-size:11px; color:#666;\">${colDates.thursday}</span></th>
                  <th style="border:1px solid #ddd; padding:8px; text-align:center;">Freitag<br/><span style=\"font-weight:normal; font-size:11px; color:#666;\">${colDates.friday}</span></th>
                </tr>
              </thead>
              <tbody>
                ${(scheduleRows || []).map((r: any) => `
                <tr>
                  <td style="border:1px solid #ddd; padding:8px; text-align:center; font-weight:bold; background:#f5f5f5;">${r.Stunde}</td>
                  <td style="border:1px solid #ddd; padding:1px;">${formatCellHTML(r.monday, r.Stunde, 'monday')}</td>
                  <td style="border:1px solid #ddd; padding:1px;">${formatCellHTML(r.tuesday, r.Stunde, 'tuesday')}</td>
                  <td style="border:1px solid #ddd; padding:1px;">${formatCellHTML(r.wednesday, r.Stunde, 'wednesday')}</td>
                  <td style="border:1px solid #ddd; padding:1px;">${formatCellHTML(r.thursday, r.Stunde, 'thursday')}</td>
                  <td style="border:1px solid #ddd; padding:1px;">${formatCellHTML(r.friday, r.Stunde, 'friday')}</td>
                </tr>`).join('')}
              </tbody>
            </table>`;

          // Message with week range and count
          const fmtDE = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
          const fmtDEFull = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
          const weekRange = `${fmtDE.format(monday)} – ${fmtDEFull.format(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4))}`;
          const substitutionCount = (substitutions || []).length;

          result = {
            message: `Vertretungsplan für Klasse ${className.toUpperCase()} – Woche ${weekRange} (${substitutionCount} Vertretung${substitutionCount === 1 ? '' : 'en'})`,
            htmlTable,
            substitutions: substitutions || []
          };
          success = true;
        } catch (e: any) {
          console.error('show_substitution_plan error:', e);
          result = { error: e.message || 'Fehler beim Laden des Vertretungsplans' };
        }
        break;
      }

      default:
        result = { error: 'Unbekannte Aktion' };
        break;
    }

    return new Response(
      JSON.stringify({ success, result }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in ai-actions:', error)
    return new Response(
      JSON.stringify({ success: false, error: (error as any).message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

// Helper function to parse German date text to Berlin school day
function parseDateTextToBerlinSchoolDay(text: string): Date {
  const now = new Date();
  // Approximate Berlin time (handles offset; DST differences are minor for day calc)
  const berlinTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (2 * 3600000));

  const norm = (s: string) => (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();

  const t = norm(text);
  console.log('Processing:', text, 'Normalized:', t, 'Current Berlin time:', berlinTime);

  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
  const nextSchoolDay = (d: Date) => {
    const x = new Date(d);
    while (isWeekend(x)) x.setDate(x.getDate() + 1);
    return x;
  };

  // Relative dates
  if (t.includes('heute') || t === '') {
    return nextSchoolDay(berlinTime);
  }
  if ((t.includes('morgen') && !t.includes('ubermorgen')) || t === 'morgen') {
    const d = new Date(berlinTime);
    d.setDate(d.getDate() + 1);
    return nextSchoolDay(d);
  }
  if (t.includes('ubermorgen') || t.includes('uebermorgen')) {
    const d = new Date(berlinTime);
    d.setDate(d.getDate() + 2);
    return nextSchoolDay(d);
  }
  if (t.includes('gestern')) {
    const d = new Date(berlinTime);
    d.setDate(d.getDate() - 1);
    return nextSchoolDay(d);
  }

  // Weekday names (German) → next occurrence
  const weekdayMap: Record<string, number> = {
    montag: 1,
    dienstag: 2,
    mittwoch: 3,
    donnerstag: 4,
    freitag: 5,
  };
  const keys = Object.keys(weekdayMap);
  const matchWeekday = keys.find(k => t.includes(k));
  if (matchWeekday) {
    const targetDow = weekdayMap[matchWeekday];
    const d = new Date(berlinTime);
    const currentDow = d.getDay();
    let delta: number;
    if (currentDow === 0) {
      delta = targetDow; // Sunday → next target this week
    } else if (currentDow < targetDow) {
      delta = targetDow - currentDow; // later this week
    } else {
      delta = 7 - currentDow + targetDow; // next week
    }
    // If same day explicitly mentioned, go to next week
    if (currentDow === targetDow) delta = 7;
    d.setDate(d.getDate() + delta);
    return nextSchoolDay(d);
  }

  // Try ISO date
  const isoMatch = t.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    const d = new Date(isoMatch[1] + 'T12:00:00');
    return nextSchoolDay(d);
  }

  // Fallback → next school day from today
  return nextSchoolDay(berlinTime);
}

function findNextSubjectLesson(scheduleData: any[], requestedSubject: string) {
  const now = new Date()
  const berlinTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (2 * 3600000))
  const currentWeekday = berlinTime.getDay() // 0=Sunday, 1=Monday, etc.
  const currentHour = berlinTime.getHours()
  const currentMinute = berlinTime.getMinutes()
  
  // Block times mapping
  const blockTimes = {
    1: { start: { hour: 7, minute: 45 }, end: { hour: 9, minute: 15 } },
    2: { start: { hour: 9, minute: 35 }, end: { hour: 11, minute: 5 } },
    3: { start: { hour: 11, minute: 50 }, end: { hour: 13, minute: 20 } },
    4: { start: { hour: 13, minute: 45 }, end: { hour: 15, minute: 15 } }
  }
  
  // Weekday mapping (Monday=1, Tuesday=2, ...)
  const weekdayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const columnMap = {
    'monday': 'monday',
    'tuesday': 'tuesday', 
    'wednesday': 'wednesday',
    'thursday': 'thursday',
    'friday': 'friday'
  }
  
  // Subject matching (German subjects)
  const subjectMap = {
    'deutsch': ['de', 'deutsch', 'german'],
    'mathematik': ['ma', 'math', 'mathematik', 'mathe'],
    'englisch': ['en', 'englisch', 'english'],
    'geschichte': ['ge', 'geschichte', 'history'],
    'erdkunde': ['ek', 'erdkunde', 'geography'],
    'biologie': ['bi', 'biologie', 'biology'],
    'chemie': ['ch', 'chemie', 'chemistry'],
    'physik': ['ph', 'physik', 'physics'],
    'sport': ['sp', 'sport', 'pe'],
    'kunst': ['ku', 'kunst', 'art'],
    'musik': ['mu', 'musik', 'music'],
    'religion': ['re', 'religion'],
    'ethik': ['et', 'ethik', 'ethics'],
    'informatik': ['if', 'informatik', 'computer science'],
    'französisch': ['fr', 'französisch', 'french'],
    'spanisch': ['es', 'spanisch', 'spanish'],
    'latein': ['la', 'latein', 'latin']
  }
  
  // Find which subjects match the request
  const matchingSubjects = []
  for (const [fullName, abbreviations] of Object.entries(subjectMap)) {
    if (abbreviations.some(abbr => abbr.includes(requestedSubject) || requestedSubject.includes(abbr))) {
      matchingSubjects.push(...abbreviations)
    }
  }
  
  if (matchingSubjects.length === 0) {
    // Direct match attempt
    matchingSubjects.push(requestedSubject)
  }
  
  // Search through schedule for next occurrence
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const checkDate = new Date(berlinTime)
    checkDate.setDate(checkDate.getDate() + dayOffset)
    const checkWeekday = checkDate.getDay()
    
    // Skip weekends
    if (checkWeekday === 0 || checkWeekday === 6) continue
    
    const dayName = weekdayMap[checkWeekday]
    const columnName = columnMap[dayName]
    
    if (!columnName) continue
    
    for (const row of scheduleData) {
      const lessonContent = row[columnName]
      if (!lessonContent || lessonContent.trim() === '') continue
      
      const block = row.Stunde || row.stunde
      const blockTime = blockTimes[block]
      if (!blockTime) continue
      
      // Check if this lesson contains the requested subject
      const lessonLower = lessonContent.toLowerCase()
      const isMatch = matchingSubjects.some(subject => 
        lessonLower.includes(subject.toLowerCase())
      )
      
      if (isMatch) {
        // If it's today, check if the lesson hasn't started yet
        if (dayOffset === 0) {
          const lessonStartTime = blockTime.start.hour * 60 + blockTime.start.minute
          const currentTime = currentHour * 60 + currentMinute
          
          if (currentTime >= lessonStartTime) {
            continue // This lesson has already started/ended today
          }
        }
        
        // Parse lesson content for teacher and room
        const parts = lessonContent.split(/[\s,/|]+/).filter(p => p.trim())
        let teacher = 'Unbekannt'
        let room = 'Unbekannt'
        
        // Look for teacher abbreviations (typically 2-3 letters)
        for (const part of parts) {
          if (part.length >= 2 && part.length <= 4 && /^[A-Za-z]+$/.test(part)) {
            if (!matchingSubjects.some(s => s.toLowerCase() === part.toLowerCase())) {
              teacher = part
              break
            }
          }
        }
        
        // Look for room numbers (typically numbers or number+letter combinations)
        for (const part of parts) {
          if (/^\d+[A-Za-z]?$/.test(part) || /^[A-Za-z]\d+$/.test(part)) {
            room = part
            break
          }
        }
        
        const dayNames = {
          1: 'Montag',
          2: 'Dienstag', 
          3: 'Mittwoch',
          4: 'Donnerstag',
          5: 'Freitag'
        }
        
        return {
          message: `Ihr nächster ${requestedSubject}-Unterricht ist am ${dayNames[checkWeekday]} in Block ${block} (${String(blockTime.start.hour).padStart(2, '0')}:${String(blockTime.start.minute).padStart(2, '0')} - ${String(blockTime.end.hour).padStart(2, '0')}:${String(blockTime.end.minute).padStart(2, '0')}) in Raum ${room} bei ${teacher}.`,
          day: dayNames[checkWeekday],
          block: block,
          time: `${String(blockTime.start.hour).padStart(2, '0')}:${String(blockTime.start.minute).padStart(2, '0')} - ${String(blockTime.end.hour).padStart(2, '0')}:${String(blockTime.end.minute).padStart(2, '0')}`,
          room: room,
          teacher: teacher,
          subject: requestedSubject
        }
      }
    }
  }
  
  return null
}
