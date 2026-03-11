import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Bot, Zap, Users, Calendar, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface AIVertretungsGeneratorProps {
  onGenerated?: () => void;
}

interface Teacher {
  shortened: string;
  'first name': string;
  'last name': string;
  subjects: string;
}

interface SubstitutionPlan {
  date: string;
  teacher: string;
  affectedLessons: Array<{
    className: string;
    period: number;
    subject: string;
    room: string;
    originalTeacher?: string;
    substituteTeacher?: string;
  }>;
}

const AIVertretungsGenerator = ({ onGenerated }: AIVertretungsGeneratorProps) => {
  const { profile, sessionId } = useAuth();
  const { toast } = useToast();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [selectedDate, setSelectedDate] = useState('morgen');
  const [loading, setLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [proposedPlan, setProposedPlan] = useState<SubstitutionPlan | null>(null);

  useEffect(() => {
    fetchTeachers();
  }, []);

  const fetchTeachers = async () => {
    try {
      const { data, error } = await supabase
        .from('teachers')
        .select('shortened, "first name", "last name", subjects')
        .order('"last name"');

      if (error) throw error;
      
      setTeachers(data || []);
      
      // Set default to König if available
      const konigTeacher = data?.find(t => t['last name']?.toLowerCase().includes('könig'));
      if (konigTeacher) {
        setSelectedTeacher(konigTeacher['last name']);
      } else if (data && data.length > 0) {
        setSelectedTeacher(data[0]['last name']);
      }
    } catch (error) {
      console.error('Error fetching teachers:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Lehrkräfte konnten nicht geladen werden."
      });
    }
  };

  const dateOptions = [
    { value: 'heute', label: 'Heute' },
    { value: 'morgen', label: 'Morgen' },
    { value: 'übermorgen', label: 'Übermorgen' },
    { value: 'montag', label: 'Nächster Montag' },
    { value: 'dienstag', label: 'Nächster Dienstag' },
    { value: 'mittwoch', label: 'Nächster Mittwoch' },
    { value: 'donnerstag', label: 'Nächster Donnerstag' },
    { value: 'freitag', label: 'Nächster Freitag' }
  ];

  const calculateTargetDate = (dateOption: string) => {
    const now = new Date();
    let targetDate = new Date(now);
    
    // Ensure we're working with school days (Mon-Fri)
    const isWeekend = (date: Date) => {
      const day = date.getDay();
      return day === 0 || day === 6; // Sunday or Saturday
    };
    
    const getNextSchoolDay = (date: Date) => {
      const next = new Date(date);
      do {
        next.setDate(next.getDate() + 1);
      } while (isWeekend(next));
      return next;
    };
    
    if (dateOption === 'heute') {
      // If today is weekend, move to next Monday
      if (isWeekend(targetDate)) {
        targetDate = getNextSchoolDay(targetDate);
      }
    } else if (dateOption === 'morgen') {
      targetDate.setDate(targetDate.getDate() + 1);
      // If tomorrow is weekend, move to next Monday
      if (isWeekend(targetDate)) {
        targetDate = getNextSchoolDay(targetDate);
      }
    } else if (dateOption === 'übermorgen') {
      targetDate.setDate(targetDate.getDate() + 2);
      // If day after tomorrow is weekend, move to next Monday
      if (isWeekend(targetDate)) {
        targetDate = getNextSchoolDay(targetDate);
      }
    } else {
      // Handle specific weekdays (montag, dienstag, etc.)
      const weekdayMap: Record<string, number> = { 
        montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5 
      };
      const targetDow = weekdayMap[dateOption];
      
      if (targetDow) {
        const currentDow = targetDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
        
        // Calculate days until target weekday
        let daysUntilTarget;
        if (currentDow === 0) { // Sunday
          daysUntilTarget = targetDow; // Monday = 1, Tuesday = 2, etc.
        } else if (currentDow <= targetDow) {
          // Same week, but check if it's later today or next week
          if (currentDow === targetDow) {
            daysUntilTarget = 7; // Next week same day
          } else {
            daysUntilTarget = targetDow - currentDow; // Later this week
          }
        } else {
          // Next week
          daysUntilTarget = 7 - currentDow + targetDow;
        }
        
        targetDate.setDate(targetDate.getDate() + daysUntilTarget);
      }
    }
    
    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const d = String(targetDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const targetDate = calculateTargetDate(selectedDate);
      
      const { data, error } = await supabase.functions.invoke('ai-actions', {
        body: {
          action: 'plan_substitution',
          parameters: {
            teacherName: selectedTeacher,
            date: targetDate
          },
          sessionId
        }
      });

      if (error) throw error;

      if (data.success) {
        const result = data.result;
        
        console.log('AI Response result:', result);
        console.log('AI Response substitutions:', result?.details?.substitutions);
        
        // Map server data to component-expected format
        const substitutions = result?.details?.substitutions || [];
        
        // Check if any substitutions were found
        if (substitutions.length === 0) {
          toast({
            variant: "destructive",
            title: "Keine Stunden gefunden",
            description: result?.message || `${selectedTeacher} unterrichtet an diesem Tag nicht oder wurde nicht im Stundenplan gefunden.`
          });
          return;
        }
        
        const mappedSubstitutions = substitutions.map((sub: any) => ({
          className: sub.className || sub.class_name,
          period: sub.period,
          subject: sub.subject || sub.original_subject,
          room: sub.room || sub.original_room || sub.substitute_room,
          substituteTeacher: sub.substituteTeacher || sub.substitute_teacher,
          originalTeacher: sub.originalTeacher || sub.original_teacher,
          // Keep both formats for compatibility
          class_name: sub.className || sub.class_name,
          original_subject: sub.subject || sub.original_subject,
          original_teacher: sub.originalTeacher || sub.original_teacher,
          original_room: sub.room || sub.original_room,
          substitute_subject: sub.subject || sub.substitute_subject,
          substitute_room: sub.room || sub.substitute_room
        }));
        
        console.log('Mapped substitutions for display:', mappedSubstitutions);
        
        // Create proposed plan for confirmation
        setProposedPlan({
          date: targetDate,
          teacher: selectedTeacher,
          affectedLessons: mappedSubstitutions
        });
        
        setShowConfirmation(true);
        
        toast({
          title: 'Vertretungsplan erstellt',
          description: `${mappedSubstitutions.length} Stunde(n) gefunden. Bitte überprüfen Sie den Plan.`
        });
      } else {
        throw new Error(data.result?.error || 'Fehler beim Generieren');
      }
    } catch (error: any) {
      console.error('AI Generator error:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error.message || 'Unbekannter Fehler'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!proposedPlan) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-actions', {
        body: {
          action: 'confirm_substitution',
          parameters: {
            substitutions: proposedPlan.affectedLessons,
            sickTeacher: proposedPlan.teacher,
            date: proposedPlan.date
          },
          userProfile: {
            user_id: profile?.id,
            name: profile?.name || profile?.username,
            permission_lvl: profile?.permission_lvl
          }
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: 'Vertretungsplan bestätigt',
          description: 'Der Vertretungsplan wurde erfolgreich erstellt und gespeichert.'
        });
        
        setShowConfirmation(false);
        setProposedPlan(null);
        onGenerated?.();
      } else {
        throw new Error(data.result.error);
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error.message
      });
    }
  };

  return (
    <>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            AI Vertretungsplan Generator
            <Badge variant="secondary" className="ml-2">
              <Zap className="h-3 w-3 mr-1" />
              Beta
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Selection Interface */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Abwesende Lehrkraft</label>
              <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
                <SelectTrigger>
                  <SelectValue placeholder="Lehrkraft auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((teacher) => (
                    <SelectItem key={teacher.shortened} value={teacher['last name']}>
                      {teacher['first name']} {teacher['last name']} ({teacher.shortened})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Datum der Abwesenheit</label>
              <Select value={selectedDate} onValueChange={setSelectedDate}>
                <SelectTrigger>
                  <SelectValue placeholder="Datum auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {dateOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Generate Button */}
          <Button 
            onClick={handleGenerate} 
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Bot className="h-4 w-4 mr-2 animate-spin" />
                AI generiert Vertretungsplan...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Vertretungsplan generieren
              </>
            )}
          </Button>

          {/* Info */}
          <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded">
            <Calendar className="h-3 w-3 inline mr-1" />
            Die AI analysiert verfügbare Lehrer, Räume und erstellt automatisch passende Vertretungen.
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-primary" />
              Vertretungsplan bestätigen
            </DialogTitle>
          </DialogHeader>
          
          {proposedPlan && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <h3 className="font-medium mb-2">
                  Abwesenheit: {proposedPlan.teacher}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Datum: {new Date(proposedPlan.date + 'T00:00:00').toLocaleDateString('de-DE', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>

              {proposedPlan.affectedLessons && proposedPlan.affectedLessons.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Betroffene Stunden:</h4>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {proposedPlan.affectedLessons.map((lesson, index) => (
                      <div key={index} className="flex justify-between items-center p-2 bg-muted rounded">
                        <div>
                          <span className="font-medium">{lesson.className}</span>
                          <span className="text-muted-foreground ml-2">
                            {lesson.period}. Stunde - {lesson.subject} (Raum {lesson.room})
                          </span>
                        </div>
                        {lesson.substituteTeacher && (
                          <Badge variant="secondary">
                            Vertretung: {lesson.substituteTeacher}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                  {proposedPlan.affectedLessons.length > 5 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {proposedPlan.affectedLessons.length} Stunden insgesamt
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setShowConfirmation(false)}
                  className="flex-1"
                >
                  Abbrechen
                </Button>
                <Button 
                  onClick={handleConfirm}
                  className="flex-1"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Bestätigen und Speichern
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AIVertretungsGenerator;