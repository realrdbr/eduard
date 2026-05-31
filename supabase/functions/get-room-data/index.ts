import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const weekdays = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const subjectMap: { [key: string]: string } = {
  "DE": "Deutsch", "MA": "Mathematik", "EN": "Englisch", "BIO": "Biologie", "PH": "Physik",
  "CH": "Chemie", "GE": "Geschichte", "GEO": "Geografie", "MU": "Musik", "KU": "Kunst",
  "SP": "Sport", "SPO": "Sport", "INF": "Informatik", "ETH": "Ethik", "REL": "Religion",
  "GRW": "GRW", "TC": "Technik", "FR": "Französisch", "LA": "Latein"
};

function getFullSubject(short: string | null) {
  if (!short) return "";
  const key = short.trim().toUpperCase();
  return subjectMap[key] || short;
}

function formatTeacherName(tObj: any) {
  if (!tObj) return null;
  const prefix = tObj.salutation ? tObj.salutation + " " : ""; 
  return `${prefix}${tObj["last name"]}`;
}

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const requestBody = await req.json();
    const { display_id, battery_level } = requestBody;
    if (!display_id) return new Response("Missing ID", { status: 400 });

    await supabase.from('room_displays').update({ 
      last_seen: new Date().toISOString(),
      battery_level: battery_level 
    }).eq('id', display_id);

    const { data: displayData, error: displayError } = await supabase
      .from('room_displays')
      .select('*, update_schedule:update_schedules (*)')
      .eq('id', display_id).single();

    if (displayError || !displayData) return new Response("Display Not Found", { status: 404 });

    const today = new Date();
    const currentDay = today.getDay();
    const currentHour = today.getHours();
    const currentDayName = weekdays[currentDay];
    const todayDateString = today.toISOString().split('T')[0];

    const cleanDisplayData = { ...displayData };
    delete cleanDisplayData.last_seen; delete cleanDisplayData.battery_level;
    delete cleanDisplayData.created_at; delete cleanDisplayData.updated_at;

    const scheduleSettings = displayData.update_schedule || {};
    let isWeekend = (currentDay === 0 || currentDay === 6 || (currentDay === 5 && currentHour >= 13));
    let activeMode = displayData.display_mode;
    let activeInfo = displayData.info_mode_content;

    if (isWeekend && scheduleSettings.enable_weekend_mode !== false) {
      if (activeMode !== 'info') {
        activeMode = "info";
        activeInfo = "Schönes Wochenende!\nWir sehen uns am Montag.";
      }
    }

    const { data: allTeachers } = await supabase.from('teachers').select('*');
    const teacherMap = new Map(allTeachers?.map(t => [t.shortened, formatTeacherName(t)]) || []);

    const { data: regularSchedule } = await supabase.from('room_schedule').select('*, teachers (*)')
      .eq('room_name', displayData.room_name).eq('day_of_week', currentDayName);

    const { data: allSubs } = await supabase.from('vertretungsplan').select('*').eq('date', todayDateString);

    const finalSchedule = [];
    if (activeMode !== 'info') {
      for (let p = 1; p <= 8; p++) {
        const regs = regularSchedule?.filter(l => l.period === p) || [];
        const subs = allSubs?.filter(s => s.period === p && (
          (s.original_room === displayData.room_name && regs.some(r => r.class_name === s.class_name)) ||
          s.substitute_room === displayData.room_name
        )) || [];

        if (regs.length === 0 && subs.length === 0) {
          finalSchedule.push({ type: 'free', period: p });
          continue;
        }

        const periodEntries = [];
        
        for (const r of regs) {
          const matchingSub = subs.find(s => s.class_name === r.class_name && s.original_room === displayData.room_name);
          const tName = formatTeacherName(r.teachers) || r.teacher_shortened;
          const sName = getFullSubject(r.subject);
          const cName = r.class_name.replace(/_[a-zA-Z0-9]+$/, "");

          if (matchingSub) {
            if (!matchingSub.substitute_room || matchingSub.substitute_room !== displayData.room_name) {
              periodEntries.push({ type: 'cancellation', class: cName, subject: sName, teacher: tName, note: matchingSub.note || "Entfällt" });
            } else {
              const newSubj = matchingSub.substitute_subject ? getFullSubject(matchingSub.substitute_subject) : sName;
              const newTeachRaw = matchingSub.substitute_teacher || r.teacher_shortened;
              const newTeach = teacherMap.get(newTeachRaw) || newTeachRaw;
              periodEntries.push({ 
                type: 'substitution', 
                class: cName, 
                subject: newSubj, 
                teacher: newTeach, 
                note: matchingSub.note,
                changed_subject: newSubj !== sName,
                changed_teacher: newTeach !== tName
              });
            }
          } else {
            periodEntries.push({ type: 'normal', class: cName, subject: sName, teacher: tName });
          }
        }

        for (const s of subs) {
          if (s.substitute_room === displayData.room_name && !regs.some(r => r.class_name === s.class_name)) {
            const newSubj = getFullSubject(s.substitute_subject || s.original_subject);
            const newTeachRaw = s.substitute_teacher || s.original_teacher;
            const newTeach = teacherMap.get(newTeachRaw) || newTeachRaw;
            periodEntries.push({ 
              type: 'new_entry', // ALLES ROT
              class: s.class_name.replace(/_[a-zA-Z0-9]+$/, ""),
              subject: newSubj,
              teacher: newTeach,
              note: s.note || "Raumwechsel"
            });
          }
        }

        const first = periodEntries[0]; // Wir nehmen primär den ersten Eintrag
        finalSchedule.push({ period: p, ...first });
      }
    }

    return new Response(JSON.stringify({ 
      ...cleanDisplayData, 
      display_mode: activeMode, 
      info_mode_content: activeInfo, 
      schedule: finalSchedule 
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
