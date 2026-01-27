import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Calendar } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface ScheduleEntry {
  Stunde: number;
  monday?: string;
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
}

interface ClassSchedule {
  className: string;
  tableName: string;
  schedule: ScheduleEntry[];
}

const Stundenplan = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [searchParams] = useSearchParams();
  const [classSchedules, setClassSchedules] = useState<ClassSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<string>('');

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    fetchAvailableSchedules();

    // Handle scroll to specific class
    const scrollToClass = searchParams.get('scrollTo');
    if (scrollToClass) {
      setTimeout(() => {
        const element = document.getElementById(`schedule-${scrollToClass}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 500);
    }
  }, [user, navigate, searchParams]);

  const fetchAvailableSchedules = async () => {
    try {
      const schedules: ClassSchedule[] = [];
      
      // Define known schedule tables and their class names
      const knownTables = [
        { tableName: 'Stundenplan_10b_A' as const, className: '10b' },
        { tableName: 'Stundenplan_10c_A' as const, className: '10c' }
      ];

      for (const { tableName, className } of knownTables) {
        try {
          const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .order('Stunde');

          if (!error && data) {
            schedules.push({
              className,
              tableName,
              schedule: data
            });
          }
        } catch (tableError) {
          console.warn(`Table ${tableName} not accessible:`, tableError);
        }
      }

      setClassSchedules(schedules);
      if (!selectedClass && schedules.length > 0) {
        setSelectedClass(schedules[0].className);
      }
    } catch (error) {
      console.error('Error fetching schedules:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Stundenplan konnte nicht geladen werden."
      });
    } finally {
      setLoading(false);
    }
  };

  const parseScheduleEntry = (entry: string) => {
    if (!entry || entry.trim() === '') return [];
    
    // Split by | for multiple subjects in one period
    const subjects = entry.split('|').map(s => s.trim());
    
    return subjects.map(subject => {
      // Filter out empty strings from multiple spaces
      const parts = subject.split(' ').filter(part => part.trim() !== '');
      if (parts.length >= 3) {
        return {
          subject: parts[0],
          teacher: parts[1],
          room: parts[2]
        };
      }
      return {
        subject: subject,
        teacher: '',
        room: ''
      };
    });
  };

  const renderScheduleTable = (schedule: ScheduleEntry[], className: string) => {
    const days = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
    const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;

    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-border">
          <thead>
            <tr className="bg-muted">
              <th className="border border-border p-3 text-left font-semibold">Stunde</th>
              {days.map((day) => (
                <th key={day} className="border border-border p-3 text-left font-semibold">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedule.map((entry) => (
              <tr key={entry.Stunde} className="hover:bg-muted/50">
                <td className="border border-border p-3 font-medium">
                  {entry.Stunde}. Stunde
                </td>
                {dayKeys.map((day) => {
                  const dayEntry = entry[day];
                  const parsedEntries = parseScheduleEntry(dayEntry);

                  return (
                    <td key={day} className="border border-border p-2">
                      <div className="space-y-1">
                         {parsedEntries.length > 0 ? (
                           parsedEntries.length > 1 ? (
                             <div className="grid grid-cols-2 gap-1">
                               {parsedEntries.map((parsed, idx) => (
                                 <div key={idx} className="p-2 bg-muted/30 rounded text-xs border">
                                   <div className="font-medium">{parsed.subject}</div>
                                   <div className="text-muted-foreground">{parsed.teacher}</div>
                                   <div className="text-muted-foreground">{parsed.room}</div>
                                 </div>
                               ))}
                             </div>
                           ) : (
                             <div className="p-2 bg-muted/30 rounded text-sm">
                               <div className="font-medium">{parsedEntries[0].subject}</div>
                               <div className="text-muted-foreground">{parsedEntries[0].teacher}</div>
                               <div className="text-muted-foreground">{parsedEntries[0].room}</div>
                             </div>
                           )
                         ) : (
                           <div className="text-center text-muted-foreground">-</div>
                         )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück zum Dashboard
              </Button>
              <div className="flex items-center gap-3">
                <Calendar className="h-6 w-6 text-primary" />
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Stundenplan</h1>
                  <p className="text-muted-foreground">Aktuelle Stundenpläne</p>
                </div>
              </div>
            </div>
            
            {/* Class Selection in Header */}
            {classSchedules.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Klasse:</span>
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {classSchedules.map((classSchedule) => (
                      <SelectItem key={classSchedule.className} value={classSchedule.className}>
                        {classSchedule.className}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Schedule Display */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {selectedClass ? `Klasse ${selectedClass}` : 'Stundenplan'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const currentSchedule = classSchedules.find(cs => cs.className === selectedClass);
              if (!currentSchedule) {
                return <p className="text-muted-foreground">Kein Stundenplan verfügbar.</p>;
              }
              
              return currentSchedule.schedule.length > 0 
                ? renderScheduleTable(currentSchedule.schedule, selectedClass)
                : <p className="text-muted-foreground">Kein Stundenplan verfügbar.</p>;
            })()}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Stundenplan;