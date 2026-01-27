import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ClassAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    id: number;
    username: string;
    name: string;
    user_class?: string;
  };
}

const ClassAssignmentModal = ({ isOpen, onClose, user }: ClassAssignmentModalProps) => {
  const [selectedClass, setSelectedClass] = useState<string>(user.user_class || 'none');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('permissions')
        .update({ user_class: selectedClass === 'none' ? null : selectedClass })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: "Erfolg",
        description: `Klasse für ${user.name} wurde ${selectedClass ? 'auf ' + selectedClass + ' gesetzt' : 'entfernt'}.`,
      });

      onClose();
    } catch (error) {
      console.error('Error updating class:', error);
      toast({
        title: "Fehler",
        description: "Klasse konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Klasse zuweisen - {user.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              Klasse auswählen
            </label>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger>
                <SelectValue placeholder="Keine Klasse zugewiesen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Keine Klasse</SelectItem>
                <SelectItem value="10b">10b</SelectItem>
                <SelectItem value="10c">10c</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? "Speichern..." : "Speichern"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ClassAssignmentModal;