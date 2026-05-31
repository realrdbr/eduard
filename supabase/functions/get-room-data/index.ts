// API VERSION 12 - STABILISIERUNG (Ghost Update Fix)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
const weekdays = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag"
];
const subjectMap = {
  "DE": "Deutsch",
  "MA": "Mathe",
  "EN": "Englisch",
  "BIO": "Bio",
  "PH": "Physik",
  "CH": "Chemie",
  "GE": "Geschichte",
  "GEO": "Geo",
  "MU": "Musik",
  "KU": "Kunst",
  "SP": "Sport",
  "SPO": "Sport",
  "INF": "Info",
  "ETH": "Ethik",
  "REL": "Religion",
  "GRW": "GRW",
  "TC": "Technik",
  "FR": "Französisch",
  "LA": "Latein",
  "RE": "Religion",
  "EV": "Religion",
  "RK": "Religion",
  "RE/E": "Religion",
  "ET": "Ethik"
};
function getFullSubject(short) {
  if (!short) return "-";
  const key = short.trim().toUpperCase();
  return subjectMap[key] || short;
}
function formatTeacherName(tObj) {
  if (!tObj) return null;
  const prefix = tObj.salutation ? tObj.salutation + " " : "";
  return `${prefix}${tObj["last name"]}`;
}
serve(async (req)=>{
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization')
        }
      }
    });
    const { display_id } = await req.json();
    if (!display_id) return new Response(JSON.stringify({
      error: "No ID"
    }), {
      status: 400
    });
    // Update Last Seen in DB
    await supabase.from('room_displays').update({
      last_seen: new Date().toISOString()
    }).eq('id', display_id);
    // Daten holen
    const { data: displayData, error: displayError } = await supabase.from('room_displays').select('*, update_schedule:update_schedules (*)').eq('id', display_id).single();
    if (displayError || !displayData) return new Response(JSON.stringify({
      error: "DB Error"
    }), {
      status: 404
    });
    // ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    // GHOST UPDATE FIX: Wir entfernen Felder, die sich dauernd ändern
    // Damit bleibt der Hash auf dem ESP32 gleich.
    // ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    delete displayData.last_seen;
    delete displayData.created_at;
    delete displayData.updated_at;
    if (displayData.update_schedule) {
      delete displayData.update_schedule.created_at;
    // Den Zeitplan selbst brauchen wir für den Sleep-Timer, aber er ändert sich selten
    }
    // ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    if (displayData.is_active === false) {
      return new Response(JSON.stringify({
        ...displayData,
        schedule: []
      }), {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    const today = new Date();
    const currentDay = today.getDay();
    const currentHour = today.getHours();
    const todayDateString = today.toISOString().split('T')[0];
    const currentDayName = weekdays[currentDay];
    let activeMode = displayData.display_mode;
    let activeInfo = displayData.info_mode_content;
    const schedSet = displayData.update_schedule || {};
    // Automatik: Wochenende
    if (schedSet.enable_weekend_mode !== false && (currentDay === 0 || currentDay === 6 || currentDay === 5 && currentHour >= 13)) {
      if (activeMode !== 'info') {
        activeMode = "info";
        activeInfo = "Schönes Wochenende!\nStart: Montag 07:30";
      }
    }
    const { data: allTeachers } = await supabase.from('teachers').select('*');
    const teacherMap = new Map();
    if (allTeachers) allTeachers.forEach((t)=>teacherMap.set(t.shortened, formatTeacherName(t)));
    const { data: regularSchedule } = await supabase.from('room_schedule').select('*, teachers (shortened, "first name", "last name", salutation)').eq('room_name', displayData.room_name).eq('day_of_week', currentDayName).order('period', {
      ascending: true
    });
    const { data: substitutions } = await supabase.from('vertretungsplan').select('*').eq('date', todayDateString);
    const finalSchedule = [];
    if (activeMode !== 'info') {
      for(let p = 1; p <= 8; p++){
        const lessonsInPeriod = regularSchedule?.filter((l)=>l.period === p) || [];
        if (lessonsInPeriod.length === 0) {
          finalSchedule.push({
            type: 'free',
            period: p
          });
          continue;
        }
        const classes = new Set();
        const subjects = new Set();
        const teachers = new Set();
        let subType = "normal";
        let note = "";
        for (const l of lessonsInPeriod){
          // FIX: Class name cleanup
          let cl = l.class_name.replace(/_[a-zA-Z0-9]+$/, "");
          let subj = getFullSubject(l.subject);
          let teach = formatTeacherName(l.teachers) || teacherMap.get(l.teacher_shortened) || l.teacher_shortened;
          const sub = substitutions?.find((s)=>s.class_name === l.class_name && s.period === p && s.original_room === displayData.room_name);
          if (sub) {
            if (!sub.substitute_teacher && !sub.substitute_subject) {
              subType = "cancellation";
              note = sub.note || "Entfall";
            } else {
              subType = "substitution";
              if (sub.substitute_subject) subj = getFullSubject(sub.substitute_subject);
              if (sub.substitute_teacher) {
                teach = teacherMap.get(sub.substitute_teacher) || sub.substitute_teacher;
              }
              if (sub.note) note = sub.note;
            }
          }
          classes.add(cl);
          subjects.add(subj);
          teachers.add(teach);
        }
        let finalClass = Array.from(classes).join("/");
        const finalSubject = Array.from(subjects).join("/");
        const finalTeacher = Array.from(teachers).join("/");
        if (classes.size > 1) {
          const arr = Array.from(classes);
          const numbers = arr.map((c)=>c.match(/^\d+/)?.[0]);
          if (numbers[0] && numbers.every((n)=>n === numbers[0])) finalClass = "Jg. " + numbers[0];
        }
        finalSchedule.push({
          type: subType,
          period: p,
          class: finalClass,
          subject: finalSubject,
          teacher: finalTeacher,
          note: note
        });
      }
    }
    const responsePayload = {
      ...displayData,
      display_mode: activeMode,
      info_mode_content: activeInfo,
      date: todayDateString,
      schedule: finalSchedule
    };
    return new Response(JSON.stringify(responsePayload), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500
    });
  }
});
