import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSessionRequest } from '@/hooks/useSessionRequest';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, ArrowLeft, MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface Message {
  id: string;
  content: string;
  sender_id: number;
  created_at: string;
  is_read: boolean;
}

interface PrivateChatProps {
  conversationId: string;
  otherUser: {
    id: number;
    name: string;
  };
  onBack: () => void;
}

export const PrivateChat: React.FC<PrivateChatProps> = ({
  conversationId,
  otherUser,
  onBack
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const { profile, sessionId } = useAuth();
  const { withSession } = useSessionRequest();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(0);

  useEffect(() => {
    fetchMessages();
    markMessagesAsRead();
  }, [conversationId]);

  // Real-time updates for messages with immediate response
  useEffect(() => {
    const channel = supabase
      .channel(`private-messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          const newMessage = payload.new as Message;
          
          // Remove optimistic message if it exists and add real message
          setOptimisticMessages(prev => prev.filter(msg => 
            msg.content !== newMessage.content || msg.sender_id !== newMessage.sender_id
          ));
          
          setMessages(prev => {
            // Prevent duplicate messages
            const exists = prev.some(msg => msg.id === newMessage.id);
            if (exists) return prev;
            return [...prev, newMessage];
          });
          
          setTimeout(scrollToBottom, 50);
          
          // Mark as read immediately if not sent by current user
          if (newMessage.sender_id !== profile?.id) {
            setTimeout(() => markMessagesAsRead(), 100);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'private_messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        () => {
          // Only fetch if it's a read status update
          setTimeout(fetchMessages, 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, profile?.id]);

  // Ensure initial scroll to bottom on conversation open
  useEffect(() => {
    if (conversationId) {
      // Reset message count and scroll immediately
      lastMessageCountRef.current = 0;
      setTimeout(scrollToBottom, 200);
    }
  }, [conversationId]);

  // Auto-scroll only when message count actually increases
  useEffect(() => {
    const currentCount = messages.length + optimisticMessages.length;
    if (currentCount > lastMessageCountRef.current) {
      scrollToBottom();
      lastMessageCountRef.current = currentCount;
    }
  }, [messages.length, optimisticMessages.length]);

  // Reduced polling interval for better performance
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMessages();
    }, 5000); // Increased from 2s to 5s
    return () => clearInterval(interval);
  }, [conversationId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async () => {
    try {
      await withSession(async () => {
        const { data, error } = await supabase.rpc('list_private_messages_session', {
          conversation_id_param: conversationId,
          v_session_id: sessionId || ''
        });

        if (error) throw error;
        const serverMessages = data || [];
        setMessages(serverMessages);
        // Remove optimistic messages that now exist on server
        setOptimisticMessages(prev => prev.filter(om =>
          !serverMessages.some(sm => sm.content === om.content && sm.sender_id === om.sender_id)
        ));
      });
      // Mark as read immediately after syncing messages
      await markMessagesAsRead();
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast({
        title: "Fehler",
        description: "Nachrichten konnten nicht geladen werden",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const markMessagesAsRead = async () => {
    if (!profile?.id) return;

    try {
      await withSession(async () => {
        await supabase.rpc('mark_messages_as_read_session', {
          conversation_id_param: conversationId,
          v_session_id: sessionId || ''
        });
      });
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !profile?.id || sending) return;

    setSending(true);
    const messageContent = newMessage.trim();
    const tempId = `temp-${Date.now()}`;
    
    // Optimistic update - add message immediately
    const optimisticMessage: Message = {
      id: tempId,
      content: messageContent,
      sender_id: profile.id,
      created_at: new Date().toISOString(),
      is_read: false
    };
    
    setOptimisticMessages(prev => [...prev, optimisticMessage]);
    setNewMessage('');

    try {
      // Use Promise without withSession wrapper for faster response
      const { data, error } = await supabase.rpc('send_private_message_session', {
        conversation_id_param: conversationId,
        content_param: messageContent,
        v_session_id: sessionId || ''
      });
      
      if (error || (data && !(data as any).success)) {
        throw new Error((data as any)?.error || error?.message || 'Nachricht konnte nicht gesendet werden');
      }
      
      // Scroll after sending
      setTimeout(scrollToBottom, 50);
      
      // Ensure UI reflects the persisted message even if realtime is blocked
      await fetchMessages();
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Remove failed optimistic message and restore input
      setOptimisticMessages(prev => prev.filter(msg => msg.id !== tempId));
      setNewMessage(messageContent);
      
      const errorMessage = error instanceof Error ? error.message : 'Nachricht konnte nicht gesendet werden';
      
      toast({
        title: "Nachricht fehlgeschlagen",
        description: errorMessage,
        variant: "destructive",
        action: (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              setNewMessage(messageContent);
              setTimeout(() => {
                const input = document.querySelector('input[placeholder="Nachricht eingeben..."]') as HTMLInputElement;
                input?.focus();
              }, 100);
            }}
          >
            Wiederholen
          </Button>
        ),
      });
    } finally {
      setSending(false);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('de-DE', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } else {
      return date.toLocaleDateString('de-DE', { 
        day: '2-digit', 
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  if (loading) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-sm">
                {getInitials(otherUser.name)}
              </AvatarFallback>
            </Avatar>
            <CardTitle>{otherUser.name}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-muted-foreground">Lade Nachrichten...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-sm">
              {getInitials(otherUser.name)}
            </AvatarFallback>
          </Avatar>
          <CardTitle>{otherUser.name}</CardTitle>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0">
        <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
          {messages.length === 0 && optimisticMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-4">
              <MessageCircle className="h-16 w-16 opacity-50" />
              <div className="text-center space-y-2">
                <p className="text-lg font-medium">Noch keine Nachrichten</p>
                <p className="text-sm">Beginnen Sie die Unterhaltung mit {otherUser.name}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground/70">
                  Schreiben Sie eine Nachricht unten, um zu beginnen
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {[...messages, ...optimisticMessages].map((message, index) => {
                const allMessages = [...messages, ...optimisticMessages];
                const isOwnMessage = message.sender_id === profile?.id;
                const showAvatar = index === 0 || allMessages[index - 1].sender_id !== message.sender_id;
                const isOptimistic = message.id.startsWith('temp-');
                
                return (
                  <div
                    key={message.id}
                    className={`flex items-end gap-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isOwnMessage && (
                      <Avatar className={`h-6 w-6 ${showAvatar ? '' : 'invisible'}`}>
                        <AvatarFallback className="text-xs">
                          {getInitials(otherUser.name)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    
                    <div
                      className={`
                        max-w-[70%] rounded-lg px-3 py-2 
                        ${isOwnMessage 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted'
                        }
                        ${isOptimistic ? 'opacity-70' : ''}
                      `}
                    >
                      <div className="whitespace-pre-wrap break-words">
                        {message.content}
                      </div>
                      <div 
                        className={`
                          text-xs mt-1 
                          ${isOwnMessage 
                            ? 'text-primary-foreground/70' 
                            : 'text-muted-foreground'
                          }
                        `}
                      >
                        {formatMessageTime(message.created_at)}
                      </div>
                    </div>
                    
                    {isOwnMessage && (
                      <Avatar className={`h-6 w-6 ${showAvatar ? '' : 'invisible'}`}>
                        <AvatarFallback className="text-xs">
                          {getInitials(profile?.name || 'U')}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>
        
        <div className="border-t p-4">
          <form onSubmit={sendMessage} className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Nachricht eingeben..."
              disabled={sending}
              className="flex-1"
            />
            <Button type="submit" disabled={!newMessage.trim() || sending} size="sm">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
};