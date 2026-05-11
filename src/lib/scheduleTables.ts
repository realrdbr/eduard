import { supabase } from '@/integrations/supabase/client';

export interface ScheduleRow {
  Stunde: number;
  monday?: string | null;
  tuesday?: string | null;
  wednesday?: string | null;
  thursday?: string | null;
  friday?: string | null;
}

export interface ScheduleTable {
  tableName: string;
  className: string;
  schedule?: ScheduleRow[];
}

interface ScheduleTablesResponse {
  success?: boolean;
  error?: string;
  tables?: ScheduleTable[];
}

export const fetchScheduleTables = async (
  sessionId: string,
  includeSchedules = false,
): Promise<ScheduleTable[]> => {
  const { data, error } = await supabase.functions.invoke('schedule-tables', {
    body: { sessionId, includeSchedules },
  });

  const payload = data as ScheduleTablesResponse | null;

  if (error || !payload?.success) {
    throw error ?? new Error(payload?.error || 'Stundenpläne konnten nicht geladen werden.');
  }

  return (payload.tables || [])
    .map((table) => ({
      tableName: table.tableName,
      className: table.className.trim(),
      schedule: (table.schedule || []).sort((a, b) => (a.Stunde ?? 0) - (b.Stunde ?? 0)),
    }))
    .sort((a, b) => a.className.localeCompare(b.className, 'de-DE', { numeric: true }));
};
