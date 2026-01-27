import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useSessionRequest } from '@/hooks/useSessionRequest';

interface EditSubstitutionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  substitution: any;
  onUpdate: () => void;
}

export const EditSubstitutionDialog = ({ 
  isOpen, 
  onClose, 
  substitution, 
  onUpdate 
}: EditSubstitutionDialogProps) => {
  const [formData, setFormData] = useState({
    substituteTeacher: '',
    substituteSubject: '',
    substituteRoom: '',
    note: ''
  });

  useEffect(() => {
    if (substitution) {
      setFormData({
        substituteTeacher: substitution.substitute_teacher || '',
        substituteSubject: substitution.substitute_subject || '',
        substituteRoom: substitution.substitute_room || '',
        note: substitution.note || ''
      });
    }
  }, [substitution]);

  const { profile, sessionId } = useAuth();
  const { withSession } = useSessionRequest();

  // Only show delete button to level 10+ users
  const canDelete = profile && profile.permission_lvl >= 10;

  const handleUpdate = async () => {
    if (!substitution?.id) return;

    if (!sessionId) {
      toast({
        variant: "destructive",
        title: "Nicht angemeldet",
        description: "Bitte melde dich erneut an und versuche es nochmal."
      });
      return;
    }

    try {
      console.log('Updating substitution with sessionId:', sessionId);
      const { data, error } = await supabase.rpc('update_vertretung_session', {
        v_id: substitution.id,
        v_substitute_teacher: formData.substituteTeacher || '',
        v_substitute_subject: formData.substituteSubject || '',
        v_substitute_room: formData.substituteRoom || '',
        v_note: formData.note || '',
        v_session_id: sessionId
      });
      console.log('Update result:', { data, error });

      if (error || !(data as any)?.success) {
        throw new Error((data as any)?.error || (error as any)?.message || 'Aktualisierung fehlgeschlagen');
      }

      toast({
        title: "Vertretung aktualisiert",
        description: "Die Vertretung wurde erfolgreich aktualisiert."
      });

      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error updating substitution:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error instanceof Error ? error.message : "Die Vertretung konnte nicht aktualisiert werden."
      });
    }
  };

  const handleDelete = async () => {
    if (!substitution?.id || !canDelete) return;

    if (!sessionId) {
      toast({
        variant: "destructive",
        title: "Nicht angemeldet",
        description: "Bitte melde dich erneut an und versuche es nochmal."
      });
      return;
    }

    try {
      console.log('Deleting substitution with sessionId:', sessionId);
      const { data, error } = await supabase.rpc('delete_vertretung_session', {
        v_id: substitution.id,
        v_session_id: sessionId
      });
      console.log('Delete result:', { data, error });

      if (error || !(data as any)?.success) {
        throw new Error((data as any)?.error || (error as any)?.message || 'Löschen fehlgeschlagen');
      }

      toast({
        title: "Vertretung gelöscht",
        description: "Die Vertretung wurde erfolgreich gelöscht."
      });

      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error deleting substitution:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error instanceof Error ? error.message : "Die Vertretung konnte nicht gelöscht werden."
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Vertretung bearbeiten</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Ursprünglicher Unterricht:</div>
            <div className="p-3 bg-muted rounded-md">
              <div className="font-medium">{substitution?.original_subject}</div>
              <div className="text-sm">{substitution?.original_teacher}</div>
              <div className="text-sm">{substitution?.original_room}</div>
              <div className="text-sm text-muted-foreground">
                {substitution?.period}. Stunde - {substitution?.class_name}
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="substituteTeacher">Vertretungslehrer</Label>
            <Input
              id="substituteTeacher"
              value={formData.substituteTeacher}
              onChange={(e) => setFormData({...formData, substituteTeacher: e.target.value})}
              placeholder="Leer lassen für Entfall"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="substituteSubject">Fach</Label>
            <Input
              id="substituteSubject"
              value={formData.substituteSubject}
              onChange={(e) => setFormData({...formData, substituteSubject: e.target.value})}
              placeholder="Fach"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="substituteRoom">Raum</Label>
            <Input
              id="substituteRoom"
              value={formData.substituteRoom}
              onChange={(e) => setFormData({...formData, substituteRoom: e.target.value})}
              placeholder="Raum"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="note">Notiz (optional)</Label>
            <Input
              id="note"
              value={formData.note}
              onChange={(e) => setFormData({...formData, note: e.target.value})}
              placeholder="Zusätzliche Informationen"
            />
          </div>
          
          <div className="flex gap-2">
            <Button onClick={handleUpdate}>Änderungen speichern</Button>
            {canDelete && (
              <Button variant="destructive" onClick={handleDelete}>
                Vertretung löschen
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};