import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSessionRequest } from '@/hooks/useSessionRequest';
import { useEnhancedPermissions } from '@/hooks/useEnhancedPermissions';
import { supabase } from '@/integrations/supabase/client';
import { PrivateChatSidebar } from '@/components/PrivateChat/PrivateChatSidebar';
import { PrivateChat } from '@/components/PrivateChat/PrivateChat';
import { ContactSearch } from '@/components/PrivateChat/ContactSearch';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

type View = 'sidebar' | 'chat' | 'contacts';

interface CurrentChat {
  conversationId: string;
  otherUser: {
    id: number;
    name: string;
  };
}

const PrivateMessaging = () => {
  const [currentView, setCurrentView] = useState<View>('sidebar');
  const [currentChat, setCurrentChat] = useState<CurrentChat | null>(null);
  const { profile, sessionId } = useAuth();
  const { withSession } = useSessionRequest();
  const { hasPermission } = useEnhancedPermissions();
  const navigate = useNavigate();
  const location = useLocation();

  // Open chat directly when a conversation=... query param is present
  // MUST come before any conditional returns to avoid hooks order issues
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const convId = params.get('conversation');
    if (convId && profile?.id && hasPermission('private_messages')) {
      (async () => {
        try {
          const { data: convs, error: convErr } = await supabase.rpc('list_private_conversations_session', {
            v_session_id: sessionId || localStorage.getItem('school_session_id') || ''
          });
          if (convErr) throw convErr;
          const conv = Array.isArray(convs) ? (convs as any[]).find((c) => c.id === convId) : null;
          if (!conv) return;
          const otherUserId = conv.user1_id === profile.id ? conv.user2_id : conv.user1_id;
          const { data: userData } = await (supabase as any).rpc('get_user_public_info', {
            user_id_param: otherUserId
          });
          const user = Array.isArray(userData) ? userData[0] : userData;
          setCurrentChat({
            conversationId: convId,
            otherUser: { id: user?.id || otherUserId, name: user?.name || user?.username || 'Unbekannt' }
          });
          setCurrentView('chat');
        } catch (e) {
          console.error('Deep-link chat open failed:', e);
        }
      })();
    }
  }, [location.search, profile?.id, sessionId, hasPermission]);

  // Check if user has private messages permission
  if (!profile || !hasPermission('private_messages')) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Zugriff verweigert</h2>
          <p className="text-muted-foreground">Sie benötigen die Berechtigung für private Nachrichten, um die Chat-Funktion zu nutzen.</p>
        </div>
      </div>
    );
  }

  const handleConversationSelect = (conversationId: string, otherUser: { id: number; name: string }) => {
    setCurrentChat({ conversationId, otherUser });
    setCurrentView('chat');
  };

  const handleShowContacts = () => {
    setCurrentView('contacts');
  };

  const handleContactAdded = () => {
    // Refresh conversations when a contact is added
    setCurrentView('sidebar');
  };

  const handleStartChat = async (userId: number, userName: string) => {
    try {
      console.log('🚀 Starting chat with user:', { userId, userName, currentUserId: profile?.id });
      
      if (!profile?.id) {
        console.error('❌ No current user profile');
        return;
      }

      const conversationId = await withSession(async () => {
        const { data, error } = await supabase.rpc('get_or_create_conversation_session', {
          other_user_id: userId,
          v_session_id: sessionId || ''
        });

        if (error) {
          console.error('❌ Error getting/creating conversation:', error);
          throw error;
        }

        console.log('✅ Got/created conversation:', data);
        return data;
      });

      console.log('✅ Setting up chat with conversation:', conversationId);
      
      setCurrentChat({
        conversationId,
        otherUser: { id: userId, name: userName }
      });
      setCurrentView('chat');
      
      console.log('✅ Chat setup complete');
    } catch (error) {
      console.error('❌ Error starting chat:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      console.error('Chat konnte nicht gestartet werden:', errorMessage);
    }
  };

  const handleBack = () => {
    setCurrentView('sidebar');
    setCurrentChat(null);
  };

  return (
    <div className="container mx-auto p-6 h-[calc(100vh-6rem)]">
      {/* Header with Back Button */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/')}
          className="flex items-center gap-2"
        >
          <Home className="h-4 w-4" />
          Startseite
        </Button>
        <h1 className="text-2xl font-bold">Private Nachrichten</h1>
      </div>
      
      <div className="h-full max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
          {/* Sidebar - Always visible on desktop, conditional on mobile */}
          <div className={`
            ${currentView === 'sidebar' ? 'block' : 'hidden lg:block'}
            lg:col-span-1 h-full
          `}>
            <PrivateChatSidebar
              currentConversationId={currentChat?.conversationId}
              onConversationSelect={handleConversationSelect}
              onShowContacts={handleShowContacts}
            />
          </div>

          {/* Main Content Area */}
          <div className={`
            ${currentView === 'sidebar' ? 'hidden lg:block' : 'block'}
            lg:col-span-2 h-full
          `}>
            {currentView === 'chat' && currentChat ? (
              <PrivateChat
                conversationId={currentChat.conversationId}
                otherUser={currentChat.otherUser}
                onBack={handleBack}
              />
            ) : currentView === 'contacts' ? (
              <div className="h-full">
                <ContactSearch
                  onContactAdded={handleContactAdded}
                  onStartChat={handleStartChat}
                />
                <div className="mt-4">
                  <button
                    onClick={handleBack}
                    className="text-primary hover:underline"
                  >
                    ← Zurück zu den Chats
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center bg-muted/10 rounded-lg border-2 border-dashed border-muted-foreground/20">
                <div className="text-center text-muted-foreground">
                  <div className="text-lg font-medium mb-2">Willkommen beim privaten Chat</div>
                  <div>Wählen Sie eine Unterhaltung aus oder fügen Sie neue Kontakte hinzu</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivateMessaging;