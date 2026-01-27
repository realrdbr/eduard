import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSessionRequest } from '@/hooks/useSessionRequest';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MessageCircle, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface UnreadMessage {
  conversation_id: string;
  sender: {
    id: number;
    name: string;
    username: string;
  };
  message_count: number;
  last_message: {
    content: string;
    created_at: string;
  };
}

export const MessageNotificationWidget: React.FC = () => {
  const [unreadMessages, setUnreadMessages] = useState<UnreadMessage[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { withSession } = useSessionRequest();

  useEffect(() => {
    if (profile?.id) {
      fetchUnreadMessages();
    }
  }, [profile?.id]);

  // Optimized real-time updates with debouncing
  useEffect(() => {
    if (!profile?.id) return;

    let debounceTimer: NodeJS.Timeout;
    const debouncedFetch = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchUnreadMessages, 500);
    };

    const channel = supabase
      .channel('unread-message-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages'
        },
        (payload) => {
          // Only count messages not sent by current user
          if (payload.new.sender_id !== profile.id) {
            debouncedFetch();
          }
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
          debouncedFetch();
        }
      )
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const fetchUnreadMessages = async () => {
    if (!profile?.id) return;

    try {
      setLoading(true);
      const sessionFetch = async () => {
        // Fetch conversations via session-aware RPC
        const { data: conversations, error: convError } = await supabase
          .rpc('list_private_conversations_session', {
            v_session_id: (localStorage.getItem('school_session_id') || '')
          });
        if (convError) throw convError;

        if (!conversations || conversations.length === 0) {
          setUnreadMessages([]);
          setTotalUnread(0);
          return;
        }

        const unreadData = await Promise.all(
          conversations.map(async (conv: any) => {
            const otherUserId = conv.user1_id === profile.id ? conv.user2_id : conv.user1_id;

            // Count unread messages for this conversation
            const { data: unreadCount } = await supabase.rpc('count_unread_messages_session', {
              conversation_id_param: conv.id,
              v_session_id: (localStorage.getItem('school_session_id') || '')
            });

            if (!unreadCount || unreadCount === 0) return null;

            // Get other user info
            const { data: otherUserData } = await (supabase as any).rpc('get_user_public_info', {
              user_id_param: otherUserId
            });
            const otherUser = Array.isArray(otherUserData) ? otherUserData[0] : otherUserData;

            // Get last unread message
            const { data: lastUnreadArr } = await supabase.rpc('list_private_last_message_session', {
              conversation_id_param: conv.id,
              v_session_id: (localStorage.getItem('school_session_id') || '')
            });
            const lastUnread = Array.isArray(lastUnreadArr) && lastUnreadArr.length > 0
              ? lastUnreadArr[0]
              : { content: '', created_at: new Date().toISOString() };

            return {
              conversation_id: conv.id,
              sender: otherUser || { id: otherUserId, name: 'Unbekannt', username: 'unknown' },
              message_count: unreadCount as number,
              last_message: lastUnread
            } as UnreadMessage;
          })
        );

        const validUnread = (unreadData.filter(Boolean) as UnreadMessage[]);
        setUnreadMessages(validUnread);
        setTotalUnread(validUnread.reduce((sum, item) => sum + item.message_count, 0));
      };

      // Execute within session context
      await withSession(sessionFetch);
    } catch (error) {
      console.error('Error fetching unread messages (session):', error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatMessagePreview = (message: string) => {
    return message.length > 40 ? message.substring(0, 40) + '...' : message;
  };

  const handleOpenMessages = (conversationId?: string) => {
    if (conversationId) {
      navigate(`/private-messages?conversation=${conversationId}`);
    } else {
      navigate('/private-messages');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Nachrichten
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-3 bg-muted rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Nachrichten
            {totalUnread > 0 && (
              <Badge variant="destructive" className="text-xs px-2 py-0">
                {totalUnread > 99 ? '99+' : totalUnread}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleOpenMessages()}
            className="h-8 px-2"
          >
            <Users className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {totalUnread === 0 ? (
          <div className="text-sm text-muted-foreground">
            Keine neuen Nachrichten
          </div>
        ) : (
          <div className="space-y-3">
            {unreadMessages.slice(0, 3).map((item) => (
              <div
                key={item.conversation_id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => handleOpenMessages(item.conversation_id)}
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {getInitials(item.sender.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm truncate">
                      {item.sender.name}
                    </div>
                    <Badge variant="secondary" className="text-xs px-1.5 py-0">
                      {item.message_count}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {formatMessagePreview(item.last_message.content)}
                  </div>
                </div>
              </div>
            ))}
            
            {unreadMessages.length > 3 && (
              <div className="text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenMessages()}
                  className="text-xs h-8"
                >
                  +{unreadMessages.length - 3} weitere...
                </Button>
              </div>
            )}
          </div>
        )}
        
        {totalUnread > 0 && (
          <div className="mt-3 pt-3 border-t">
            <Button
              onClick={() => handleOpenMessages()}
              size="sm"
              className="w-full"
            >
              Alle Nachrichten öffnen
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};