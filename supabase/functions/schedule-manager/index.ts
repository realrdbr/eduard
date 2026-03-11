import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Valid actions whitelist
const VALID_ACTIONS = [
  'store_schedule',
  'get_schedule', 
  'find_affected_lessons',
  'find_substitute_teacher',
  'create_substitution_plan'
] as const;

// Permission levels required for each action
const ACTION_PERMISSIONS: Record<string, number> = {
  'store_schedule': 10,           // Only admins can modify schedules
  'get_schedule': 1,              // All authenticated users can view
  'find_affected_lessons': 5,     // Teachers and above
  'find_substitute_teacher': 10,  // Only admins
  'create_substitution_plan': 10  // Only admins
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, data, sessionId } = await req.json()
    
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const deny = (status = 401, message = 'Unauthorized') =>
      new Response(JSON.stringify({ success: false, error: message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status,
      });

    // SECURITY FIX: Validate action is in whitelist
    if (!action || !VALID_ACTIONS.includes(action)) {
      return deny(400, `Invalid or missing action. Valid actions: ${VALID_ACTIONS.join(', ')}`);
    }

    // SECURITY FIX: Validate sessionId format
    if (!sessionId || typeof sessionId !== 'string' || !UUID_REGEX.test(sessionId)) {
      return deny(400, 'Missing or invalid sessionId (must be UUID)');
    }

    // SECURITY FIX: Resolve actor from session using secure RPC function
    const { data: actorData, error: actorErr } = await supabase.rpc('get_actor_from_session_secure', {
      v_session_id: sessionId
    });

    if (actorErr) {
      console.error('schedule-manager session resolution error:', actorErr);
      return deny(500, 'Session resolution failed');
    }

    if (!actorData || actorData.length === 0) {
      return deny(401, 'Invalid or expired session');
    }

    const actor = actorData[0];
    console.log('[schedule-manager] actor resolved from session', { 
      id: actor.id, 
      username: actor.username, 
      permission_lvl: actor.permission_lvl 
    });

    // SECURITY FIX: Check permission level for the requested action
    const requiredLevel = ACTION_PERMISSIONS[action] ?? 10;
    if ((actor.permission_lvl ?? 0) < requiredLevel) {
      return deny(403, `Insufficient permissions. Required level: ${requiredLevel}, your level: ${actor.permission_lvl ?? 0}`);
    }

    // SECURITY FIX: Validate data object exists for actions that need it
    if (action !== 'get_schedule' && (!data || typeof data !== 'object')) {
      return deny(400, 'Missing or invalid data object');
    }

    let result = {}

    switch (action) {
      case 'store_schedule':
        // SECURITY FIX: Validate required fields
        if (!data.className || typeof data.className !== 'string' || data.className.length > 20) {
          return deny(400, 'Invalid className');
        }
        if (!data.dayOfWeek || typeof data.dayOfWeek !== 'number' || data.dayOfWeek < 1 || data.dayOfWeek > 7) {
          return deny(400, 'Invalid dayOfWeek (must be 1-7)');
        }
        if (!data.period || typeof data.period !== 'number' || data.period < 1 || data.period > 12) {
          return deny(400, 'Invalid period (must be 1-12)');
        }

        // Store persistent class schedule
        const { data: scheduleData, error: scheduleError } = await supabase
          .from('class_schedules')
          .upsert({
            class_name: data.className,
            day_of_week: data.dayOfWeek,
            period: data.period,
            subject: data.subject?.substring(0, 50) || '',
            teacher: data.teacher?.substring(0, 100) || '',
            room: data.room?.substring(0, 20) || '',
            start_time: data.startTime,
            end_time: data.endTime,
            updated_at: new Date().toISOString()
          })
          .select()

        if (scheduleError) throw scheduleError
        result = { success: true, schedule: scheduleData }
        break

      case 'get_schedule':
        // SECURITY FIX: Validate className
        if (!data?.className || typeof data.className !== 'string' || data.className.length > 20) {
          return deny(400, 'Invalid or missing className');
        }

        // Retrieve class schedule
        const { data: allSchedules, error: getError } = await supabase
          .from('class_schedules')
          .select('*')
          .eq('class_name', data.className)
          .order('day_of_week, period')

        if (getError) throw getError
        result = { success: true, schedules: allSchedules }
        break

      case 'find_affected_lessons':
        // SECURITY FIX: Validate required fields
        if (!data.teacherName || typeof data.teacherName !== 'string' || data.teacherName.length > 100) {
          return deny(400, 'Invalid teacherName');
        }
        if (!data.dayOfWeek || typeof data.dayOfWeek !== 'number' || data.dayOfWeek < 1 || data.dayOfWeek > 7) {
          return deny(400, 'Invalid dayOfWeek (must be 1-7)');
        }

        // Find lessons affected by teacher absence
        const { data: affectedLessons, error: affectedError } = await supabase
          .from('class_schedules')
          .select('*')
          .eq('teacher', data.teacherName)
          .eq('day_of_week', data.dayOfWeek)

        if (affectedError) throw affectedError
        result = { success: true, affected_lessons: affectedLessons }
        break

      case 'find_substitute_teacher':
        // SECURITY FIX: Validate required fields
        if (!data.date || typeof data.date !== 'string') {
          return deny(400, 'Invalid date');
        }
        if (!data.period || typeof data.period !== 'number' || data.period < 1 || data.period > 12) {
          return deny(400, 'Invalid period');
        }

        // Find suitable substitute teacher
        const { data: teachers, error: teachersError } = await supabase
          .from('teachers')
          .select('*')

        if (teachersError) throw teachersError

        // Get existing substitutions for the day to check availability
        const { data: existingSubstitutions, error: subError } = await supabase
          .from('vertretungsplan')
          .select('substitute_teacher, period')
          .eq('date', data.date)

        if (subError) throw subError

        // Find best substitute based on subject expertise and availability
        const availableTeachers = teachers.filter(teacher => {
          // Skip the absent teacher
          if (teacher.name === data.absentTeacher) return false
          
          // Check if teacher is already assigned during this period
          const isAlreadyAssigned = existingSubstitutions.some(sub => 
            sub.substitute_teacher === teacher.name && sub.period === data.period
          )
          
          return !isAlreadyAssigned
        })

        // Prioritize teachers by subject match and preferred room
        const bestSubstitute = availableTeachers.find(teacher => 
          teacher.subjects?.includes(data.subject) && 
          teacher.preferred_rooms?.includes(data.room)
        ) || availableTeachers.find(teacher => 
          teacher.subjects?.includes(data.subject)
        ) || availableTeachers[0]

        result = { 
          success: true, 
          substitute: bestSubstitute,
          available_teachers: availableTeachers.length 
        }
        break

      case 'create_substitution_plan':
        // SECURITY FIX: Validate required fields
        if (!data.teacherName || typeof data.teacherName !== 'string' || data.teacherName.length > 100) {
          return deny(400, 'Invalid teacherName');
        }
        if (!data.date || typeof data.date !== 'string') {
          return deny(400, 'Invalid date');
        }

        // Create comprehensive substitution plan for teacher absence
        const teacherName = data.teacherName
        const absenceDate = data.date
        
        // Get day of week for the date
        const date = new Date(absenceDate)
        if (isNaN(date.getTime())) {
          return deny(400, 'Invalid date format');
        }
        const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay() // Convert Sunday=0 to Sunday=7
        
        // Find all lessons for this teacher on this day
        const { data: teacherLessons, error: lessonsError } = await supabase
          .from('class_schedules')
          .select('*')
          .eq('teacher', teacherName)
          .eq('day_of_week', dayOfWeek)

        if (lessonsError) throw lessonsError

        // Get all available teachers
        const { data: allTeachers, error: allTeachersError } = await supabase
          .from('teachers')
          .select('*')

        if (allTeachersError) throw allTeachersError

        // Get existing substitutions for conflict checking
        const { data: existingSubs, error: existingSubsError } = await supabase
          .from('vertretungsplan')
          .select('substitute_teacher, period')
          .eq('date', absenceDate)

        if (existingSubsError) throw existingSubsError

        const substitutionPlan = []

        for (const lesson of teacherLessons) {
          // Find best substitute
          const availableForPeriod = allTeachers.filter(teacher => {
            if (teacher.name === teacherName) return false
            
            const isAlreadyAssigned = existingSubs.some(sub => 
              sub.substitute_teacher === teacher.name && sub.period === lesson.period
            )
            
            return !isAlreadyAssigned
          })

          let bestSubstituteForLesson = null
          let substituteReason = "Keine Vertretung verfügbar"

          if (availableForPeriod.length > 0) {
            // Priority 1: Same subject + preferred room
            bestSubstituteForLesson = availableForPeriod.find(teacher => 
              teacher.subjects?.includes(lesson.subject) && 
              teacher.preferred_rooms?.includes(lesson.room)
            )
            
            // Priority 2: Same subject
            if (!bestSubstituteForLesson) {
              bestSubstituteForLesson = availableForPeriod.find(teacher => 
                teacher.subjects?.includes(lesson.subject)
              )
            }
            
            // Priority 3: Any available teacher
            if (!bestSubstituteForLesson) {
              bestSubstituteForLesson = availableForPeriod[0]
            }

            if (bestSubstituteForLesson) {
              substituteReason = `Vertretung durch ${bestSubstituteForLesson.name}`
              
              // Add to existing substitutions to prevent double-booking
              existingSubs.push({
                substitute_teacher: bestSubstituteForLesson.name,
                period: lesson.period
              })
            }
          }

          substitutionPlan.push({
            class_name: lesson.class_name,
            period: lesson.period,
            original_teacher: teacherName,
            original_subject: lesson.subject,
            original_room: lesson.room,
            substitute_teacher: bestSubstituteForLesson?.name || "Entfall",
            substitute_subject: bestSubstituteForLesson ? lesson.subject : "Entfall",
            substitute_room: bestSubstituteForLesson ? 
              (bestSubstituteForLesson.preferred_rooms?.[0] || lesson.room) : 
              lesson.room,
            note: substituteReason,
            start_time: lesson.start_time,
            end_time: lesson.end_time
          })
        }

        result = { 
          success: true, 
          substitution_plan: substitutionPlan,
          affected_lessons_count: teacherLessons.length
        }
        break

      default:
        // This should never happen due to whitelist check above
        return deny(400, `Unknown action: ${action}`)
    }

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Schedule Manager Error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})