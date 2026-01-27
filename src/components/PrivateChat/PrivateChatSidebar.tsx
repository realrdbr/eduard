import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSessionRequest } from '@/hooks/useSessionRequest';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface Conversation {
  id: string;
  user1_id: number;
  user2_id: number;
  updated_at: string;
  other_user: {
    id: number;
    name: string;
    username: string;
  };
  unread_count: number;
  last_message?: {
    content: string;
    created_at: string;
    sender_id: number;
  };
}

interface PrivateChatSidebarProps {
  currentConversationId?: string;
  onConversationSelect: (conversationId: string, otherUser: { id: number; name: string }) => void;
  onShowContacts: () => void;
}

export const PrivateChatSidebar: React.FC<PrivateChatSidebarProps> = ({
  currentConversationId,
  onConversationSelect,
  onShowContacts
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const { profile, sessionId } = useAuth();
  const { withSession } = useSessionRequest();

  useEffect(() => {
    if (profile?.id) {
      fetchConversations();
    }
  }, [profile?.id]);

  // Real-time updates for conversations
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel('private-conversations-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'private_conversations'
        },
        () => {
          fetchConversations();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages'
        },
        () => {
          // Delay to ensure message is processed
          setTimeout(fetchConversations, 200);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'private_messages'
        },
        () => {
          // Update conversation when messages are marked as read
          setTimeout(fetchConversations, 200);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const fetchConversations = async () => {
    if (!profile?.id) return;

    try {
      const conversationsData = await withSession(async () => {
        const { data, error } = await supabase.rpc('list_private_conversations_session', {
          v_session_id: sessionId || ''
        });

        if (error) throw error;
        return data;
      });

      if (!conversationsData || conversationsData.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      // Get other users data and last messages
      const conversationsWithData = await Promise.all(
        conversationsData.map(async (conv) => {
          const otherUserId = conv.user1_id === profile.id ? conv.user2_id : conv.user1_id;
          
          console.log('🔍 Looking up user data for ID:', otherUserId);
          
          // Get other user data via secure RPC to avoid exposing sensitive columns
          const userData = await withSession(async () => {
            const { data, error } = await (supabase as any).rpc('get_user_public_info', {
              user_id_param: otherUserId
            });
            if (error) {
              console.error('❌ Error fetching user data for ID', otherUserId, ':', error);
              return null;
            }
            const row = Array.isArray(data) ? data[0] : data;
            return row as { id: number; name: string; username: string } | null;
          });

          console.log('✅ Found user data for ID', otherUserId, ':', userData);

          console.log('✅ Found user data for ID', otherUserId, ':', userData);

          // Get last message
          const lastMessage = await withSession(async () => {
            const { data } = await supabase.rpc('list_private_last_message_session', {
              conversation_id_param: conv.id,
              v_session_id: sessionId || ''
            });
            return Array.isArray(data) && data.length > 0 ? data[0] : null;
          });

          // Get unread count using session context for correct authentication
          const unreadCount = await withSession(async () => {
            const { data } = await supabase.rpc('count_unread_messages_session', {
              conversation_id_param: conv.id,
              v_session_id: sessionId || ''
            });
            return data || 0;
          });

          return {
            ...conv,
            other_user: userData || { id: otherUserId, name: 'Unbekannter Benutzer', username: 'unknown' },
            last_message: lastMessage,
            unread_count: unreadCount
          };
        })
      );

      setConversations(conversationsWithData);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatMessagePreview = (message: string) => {
    return message.length > 50 ? message.substring(0, 50) + '...' : message;
  };

  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Private Chats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 animate-pulse">
                <div className="w-10 h-10 bg-muted-foreground/20 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="w-3/4 h-4 bg-muted-foreground/20 rounded" />
                  <div className="w-1/2 h-3 bg-muted-foreground/20 rounded" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Private Chats
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={onShowContacts}
            className="flex items-center gap-2"
          >
            <Users className="h-4 w-4" />
            Kontakte
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-full">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground space-y-3">
              <MessageCircle className="h-12 w-12 mx-auto opacity-50" />
              <div>
                <p className="text-lg font-medium">Noch keine Unterhaltungen</p>
                <p className="text-sm mt-1">Beginnen Sie eine Unterhaltung mit Ihren Kontakten</p>
              </div>
              <Button
                onClick={onShowContacts}
                className="mt-4"
                variant="default"
              >
                <Users className="h-4 w-4 mr-2" />
                Kontakte anzeigen
              </Button>
            </div>
          ) : (
            <div className="space-y-1 p-4">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`
                    flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors
                    ${currentConversationId === conversation.id 
                      ? 'bg-primary text-primary-foreground' 
                      : 'hover:bg-muted/50'
                    }
                  `}
                  onClick={() => onConversationSelect(conversation.id, conversation.other_user)}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="text-sm">
                      {getInitials(conversation.other_user.name)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="font-medium truncate">
                        {conversation.other_user.name}
                      </div>
                      <div className="flex items-center gap-2">
                        {conversation.unread_count > 0 && (
                          <Badge variant="destructive" className="text-xs px-2 py-0 min-w-[1.25rem] h-5">
                            {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
                          </Badge>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(conversation.updated_at), { 
                            addSuffix: true, 
                            locale: de 
                          })}
                        </div>
                      </div>
                    </div>
                    
                    {conversation.last_message && (
                      <div className="text-sm text-muted-foreground truncate mt-1">
                        {conversation.last_message.sender_id === profile?.id ? 'Sie: ' : ''}
                        {formatMessagePreview(conversation.last_message.content)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};