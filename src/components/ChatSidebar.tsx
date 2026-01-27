import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, MessageSquare, Trash2, TrashIcon } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface ChatConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatSidebarProps {
  currentConversationId?: string;
  onConversationSelect: (conversationId: string | null) => void;
  onNewChat: () => void;
}

const ChatSidebar = ({ currentConversationId, onConversationSelect, onNewChat }: ChatSidebarProps) => {
  const { profile, sessionId } = useAuth();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = async () => {
    if (!profile?.id || !sessionId) return;

    try {
      // Hole Konversationen über Edge Function (um RLS-Probleme zu vermeiden)
      const { data, error } = await supabase.functions.invoke('chat-service', {
        body: {
          action: 'list_conversations',
          sessionId,
        }
      });

      if (error) throw error;
      setConversations(data?.conversations || []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      toast({
        title: "Fehler",
        description: "Chatverlauf konnte nicht geladen werden",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      const { data, error } = await supabase.functions.invoke('chat-service', {
        body: {
          action: 'delete_conversation',
          sessionId,
          conversationId,
        }
      });

      if (error || !data?.success) throw (error || new Error('Delete failed'));

      setConversations(prev => prev.filter(conv => conv.id !== conversationId));
      
      if (currentConversationId === conversationId) {
        onConversationSelect(null);
      }

      toast({
        title: "Erfolg",
        description: "Chat wurde gelöscht"
      });
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast({
        title: "Fehler",
        description: "Chat konnte nicht gelöscht werden",
        variant: "destructive"
      });
    }
  };

  const deleteAllConversations = async () => {
    if (!profile?.id || !sessionId) return;

    try {
      const { data, error } = await supabase.functions.invoke('chat-service', {
        body: {
          action: 'delete_all_conversations',
          sessionId,
        }
      });

      if (error || !data?.success) throw (error || new Error('Delete all failed'));

      setConversations([]);
      onConversationSelect(null);

      toast({
        title: "Erfolg",
        description: "Alle Chats wurden gelöscht"
      });
    } catch (error) {
      console.error('Error deleting all conversations:', error);
      toast({
        title: "Fehler",
        description: "Chats konnten nicht gelöscht werden",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [profile?.id]);

  if (loading) {
    return (
      <div className="w-80 border-r bg-card p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-10 bg-muted rounded"></div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-muted rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full border-r bg-card flex flex-col">
      {/* Header with proper spacing for close button */}
      <div className="p-2 sm:p-4 border-b space-y-2 relative">
        {/* Leave space for close button on mobile */}
        <div className="pr-8 lg:pr-0">
          <Button onClick={onNewChat} className="w-full text-sm">
            <Plus className="h-4 w-4 mr-2" />
            Neuer Chat
          </Button>
        </div>
        {conversations.length > 0 && (
          <Button 
            onClick={deleteAllConversations} 
            variant="outline" 
            size="sm" 
            className="w-full text-destructive hover:bg-destructive hover:text-destructive-foreground text-xs sm:text-sm"
          >
            <TrashIcon className="h-4 w-4 mr-1 sm:mr-2" />
            Alle löschen
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {conversations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Keine Chats vorhanden</p>
              <p className="text-xs">Starten Sie einen neuen Chat</p>
            </div>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`p-3 rounded-lg cursor-pointer group transition-colors flex items-center justify-between ${
                  currentConversationId === conversation.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
                onClick={() => onConversationSelect(conversation.id)}
              >
                <div className="flex-1 min-w-0 pr-2">
                  <h4 className="font-medium text-sm truncate">
                    {conversation.title.length > 30 
                      ? `${conversation.title.substring(0, 30)}…` 
                      : conversation.title}
                  </h4>
                  <p className="text-xs opacity-70 mt-1">
                    {formatDistanceToNow(new Date(conversation.updated_at), {
                      addSuffix: true,
                      locale: de
                    })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-8 w-8 p-0 flex-shrink-0 ${
                    currentConversationId === conversation.id 
                      ? 'hover:bg-primary-foreground/20 text-primary-foreground' 
                      : 'hover:bg-destructive hover:text-destructive-foreground'
                  }`}
                  onClick={(e) => deleteConversation(conversation.id, e)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ChatSidebar;