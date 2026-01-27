import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEnhancedPermissions } from '@/hooks/useEnhancedPermissions';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { 
  MapPin, 
  ArrowLeft, 
  CalendarDays,
  Clock,
  User,
  Plus,
  RefreshCw,
  BookOpen,
  Search,
  Trash2
} from 'lucide-react';

interface Room {
  id: string;
  room_name: string;
  display_name: string | null;
}

interface ScheduleEntry {
  id: number;
  period: number;
  day_of_week: string;
  class_name: string;
  subject: string;
  teacher_shortened: string | null;
  room_name: string;
}

interface Substitution {
  id: string;
  date: string;
  period: number;
  class_name: string;
  original_subject: string;
  original_teacher: string;
  original_room: string;
  substitute_teacher: string | null;
  substitute_subject: string | null;
  substitute_room: string | null;
  note: string | null;
}

const PERIODS = [
  { value: 1, label: '1. Stunde (07:30 - 08:15)' },
  { value: 2, label: '2. Stunde (08:25 - 09:10)' },
  { value: 3, label: '3. Stunde (09:30 - 10:15)' },
  { value: 4, label: '4. Stunde (10:25 - 11:10)' },
  { value: 5, label: '5. Stunde (11:20 - 12:05)' },
  { value: 6, label: '6. Stunde (12:15 - 13:00)' },
  { value: 7, label: '7. Stunde (13:30 - 14:15)' },
  { value: 8, label: '8. Stunde (14:25 - 15:10)' },
];

const DAY_NAMES: Record<string, string> = {
  'monday': 'Montag',
  'tuesday': 'Dienstag',
  'wednesday': 'Mittwoch',
  'thursday': 'Donnerstag',
  'friday': 'Freitag'
};

const RoomBooking = () => {
  const navigate = useNavigate();
  const { profile, loading, sessionId } = useAuth();
  const { hasPermission, isLoaded } = useEnhancedPermissions();
  const { toast } = useToast();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [roomSchedule, setRoomSchedule] = useState<ScheduleEntry[]>([]);
  const [roomSubstitutions, setRoomSubstitutions] = useState<Substitution[]>([]);
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [bookingDate, setBookingDate] = useState<Date>(new Date());
  const [bookingPeriod, setBookingPeriod] = useState<number>(1);
  const [bookingRoom, setBookingRoom] = useState<Room | null>(null);
  const [isBooking, setIsBooking] = useState(false);
  const [isDeletingReservation, setIsDeletingReservation] = useState<string | null>(null);

  const canBookRooms = hasPermission('room_booking');

  useEffect(() => {
    if (!loading && !profile) {
      navigate('/auth');
      return;
    }

    if (!isLoaded) return;

    if (profile && !canBookRooms && (profile.permission_lvl ?? 0) < 5) {
      navigate('/');
      toast({
        variant: "destructive",
        title: "Zugriff verweigert",
        description: "Sie haben keine Berechtigung für die Raumbuchung."
      });
      return;
    }

    loadRooms();
  }, [profile, loading, isLoaded, canBookRooms, navigate]);

  const loadRooms = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('room_displays')
        .select('id, room_name, display_name')
        .order('room_name');

      if (error) throw error;
      setRooms(data || []);
    } catch (error) {
      console.error('Error loading rooms:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Räume konnten nicht geladen werden."
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadRoomDetails = async (room: Room) => {
    setSelectedRoom(room);
    
    try {
      // Load room schedule
      const { data: scheduleData, error: scheduleError } = await supabase
        .from('room_schedule')
        .select('*')
        .eq('room_name', room.room_name)
        .order('period');

      if (scheduleError) throw scheduleError;
      setRoomSchedule(scheduleData || []);

      // Load substitutions for this room
      const today = new Date();
      const { data: subData, error: subError } = await supabase
        .from('vertretungsplan')
        .select('*')
        .or(`original_room.eq.${room.room_name},substitute_room.eq.${room.room_name}`)
        .gte('date', today.toISOString().split('T')[0])
        .order('date')
        .order('period');

      if (subError) throw subError;
      setRoomSubstitutions(subData || []);
    } catch (error) {
      console.error('Error loading room details:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Raumbelegung konnte nicht geladen werden."
      });
    }
  };

  const handleSpontaneousBooking = async () => {
    if (!bookingRoom || !profile || !sessionId) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Buchungsdaten unvollständig."
      });
      return;
    }

    setIsBooking(true);

    try {
      const dateStr = format(bookingDate, 'yyyy-MM-dd');
      
      const { data, error } = await supabase.rpc('create_vertretung_session', {
        v_session_id: sessionId,
        v_date: dateStr,
        v_period: bookingPeriod,
        v_class_name: 'Reserviert',
        v_original_subject: 'Buchung',
        v_original_teacher: profile.name || profile.username || 'Unbekannt',
        v_original_room: bookingRoom.room_name,
        v_substitute_teacher: profile.name || profile.username || 'Unbekannt',
        v_substitute_subject: 'Reservierung',
        v_substitute_room: bookingRoom.room_name,
        v_note: `Spontanbuchung von ${profile.name || profile.username}`
      });

      if (error) throw error;
      
      // Handle RPC response - it returns JSON with success/error fields
      const result = data as { success?: boolean; error?: string } | null;
      if (result && result.success === false) {
        throw new Error(result.error || 'Buchung fehlgeschlagen');
      }

      toast({
        title: "Erfolg",
        description: `Raum ${bookingRoom.room_name} für ${format(bookingDate, 'dd.MM.yyyy', { locale: de })}, ${bookingPeriod}. Stunde reserviert.`
      });

      setShowBookingDialog(false);
      setBookingRoom(null);
      
      // Reload room details if we're viewing this room
      if (selectedRoom?.id === bookingRoom.id) {
        loadRoomDetails(bookingRoom);
      }
    } catch (error) {
      console.error('Error booking room:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error instanceof Error ? error.message : "Buchung fehlgeschlagen."
      });
    } finally {
      setIsBooking(false);
    }
  };

  const handleDeleteReservation = async (reservationId: string) => {
    if (!sessionId) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Keine aktive Sitzung."
      });
      return;
    }

    setIsDeletingReservation(reservationId);

    try {
      const { data, error } = await supabase.rpc('delete_vertretung_session', {
        v_id: reservationId,
        v_session_id: sessionId
      });

      if (error) throw error;

      const result = data as { success?: boolean; error?: string } | null;
      if (result && result.success === false) {
        throw new Error(result.error || 'Löschen fehlgeschlagen');
      }

      toast({
        title: "Erfolg",
        description: "Reservierung wurde gelöscht."
      });

      // Reload room details
      if (selectedRoom) {
        loadRoomDetails(selectedRoom);
      }
    } catch (error) {
      console.error('Error deleting reservation:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error instanceof Error ? error.message : "Reservierung konnte nicht gelöscht werden."
      });
    } finally {
      setIsDeletingReservation(null);
    }
  };

  const isOwnReservation = (sub: Substitution): boolean => {
    if (!profile) return false;
    const userName = profile.name || profile.username || '';
    // Check if the note contains the user's name (Spontanbuchung pattern)
    return sub.class_name === 'Reserviert' && 
           sub.original_subject === 'Buchung' &&
           (sub.note?.includes(userName) || sub.original_teacher === userName);
  };

  const openBookingDialog = (room: Room) => {
    setBookingRoom(room);
    setBookingDate(new Date());
    setBookingPeriod(1);
    setShowBookingDialog(true);
  };

  const filteredRooms = rooms.filter(room => 
    room.room_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (room.display_name?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const groupScheduleByDay = () => {
    const grouped: Record<string, ScheduleEntry[]> = {};
    roomSchedule.forEach(entry => {
      if (!grouped[entry.day_of_week]) {
        grouped[entry.day_of_week] = [];
      }
      grouped[entry.day_of_week].push(entry);
    });
    return grouped;
  };

  if (loading || !isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => selectedRoom ? setSelectedRoom(null) : navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <MapPin className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  {selectedRoom ? `Raum ${selectedRoom.room_name}` : 'Raumbelegung & Buchung'}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {selectedRoom ? (selectedRoom.display_name || 'Belegungsplan') : 'Räume einsehen und buchen'}
                </p>
              </div>
            </div>
            <div className="ml-auto">
              <Button variant="outline" size="sm" onClick={selectedRoom ? () => loadRoomDetails(selectedRoom) : loadRooms}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Aktualisieren
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {!selectedRoom ? (
          <>
            {/* Search */}
            <div className="mb-6">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Raum suchen..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Room Grid */}
            {isLoading ? (
              <div className="flex justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredRooms.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Keine Räume gefunden.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredRooms.map(room => (
                  <Card 
                    key={room.id} 
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => loadRoomDetails(room)}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-primary" />
                        {room.room_name}
                      </CardTitle>
                      {room.display_name && (
                        <CardDescription>{room.display_name}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1"
                          onClick={e => {
                            e.stopPropagation();
                            loadRoomDetails(room);
                          }}
                        >
                          <BookOpen className="h-4 w-4 mr-1" />
                          Belegung
                        </Button>
                        <Button 
                          size="sm"
                          onClick={e => {
                            e.stopPropagation();
                            openBookingDialog(room);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Buchen
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Room Detail View */}
            <div className="space-y-6">
              {/* Quick Booking Button */}
              <div className="flex justify-end">
                <Button onClick={() => openBookingDialog(selectedRoom)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Spontanbuchung
                </Button>
              </div>

              {/* Upcoming Reservations / Substitutions */}
              {roomSubstitutions.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CalendarDays className="h-5 w-5" />
                      Aktuelle Buchungen & Vertretungen
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {roomSubstitutions.map(sub => (
                        <div key={sub.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                          <div className="flex-1">
                            <div className="font-medium">
                              {format(new Date(sub.date), 'EEEE, dd.MM.yyyy', { locale: de })}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {sub.period}. Stunde • {sub.class_name}
                              {sub.note && <span className="ml-2 italic">({sub.note})</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={sub.class_name === 'Reserviert' ? 'secondary' : 'default'}>
                              {sub.class_name === 'Reserviert' ? 'Reserviert' : sub.substitute_teacher || sub.original_teacher}
                            </Badge>
                            {isOwnReservation(sub) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteReservation(sub.id)}
                                disabled={isDeletingReservation === sub.id}
                              >
                                {isDeletingReservation === sub.id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Regular Schedule */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Regulärer Stundenplan
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {roomSchedule.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">
                      Kein regulärer Stundenplan für diesen Raum hinterlegt.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(groupScheduleByDay()).map(([day, entries]) => (
                        <div key={day}>
                          <h4 className="font-medium mb-2">{DAY_NAMES[day] || day}</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {entries.sort((a, b) => a.period - b.period).map(entry => (
                              <div key={entry.id} className="flex items-center gap-3 p-2 bg-muted rounded">
                                <Badge variant="outline">{entry.period}. Std</Badge>
                                <div className="text-sm">
                                  <span className="font-medium">{entry.class_name}</span>
                                  <span className="text-muted-foreground"> • {entry.subject}</span>
                                  {entry.teacher_shortened && (
                                    <span className="text-muted-foreground"> ({entry.teacher_shortened})</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>

      {/* Booking Dialog */}
      <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Spontanbuchung</DialogTitle>
            <DialogDescription>
              Raum {bookingRoom?.room_name} reservieren
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Datum</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {format(bookingDate, 'EEEE, dd.MM.yyyy', { locale: de })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={bookingDate}
                    onSelect={date => date && setBookingDate(date)}
                    disabled={date => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Stunde</Label>
              <Select value={bookingPeriod.toString()} onValueChange={v => setBookingPeriod(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map(p => (
                    <SelectItem key={p.value} value={p.value.toString()}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Gebucht von</Label>
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{profile?.name || profile?.username || 'Unbekannt'}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBookingDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSpontaneousBooking} disabled={isBooking}>
              {isBooking ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Wird gebucht...
                </>
              ) : (
                'Raum buchen'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RoomBooking;
