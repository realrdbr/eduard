import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Loader2, Bot, ArrowLeft, Upload, Paperclip, X, Menu, CheckCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import ChatSidebar from '@/components/ChatSidebar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ReactMarkdown from 'react-markdown';
import DOMPurify from 'dompurify';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const OLLAMA_PROXY_URL = 'https://gymolb.eduard.services/ai/api/chat'; // <-- Stelle sicher, dass die URL korrekt ist

const AIChat = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, sessionId } = useAuth();
  const [input, setInput] = useState(location.state?.initialMessage || '');
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Modal state for confirming substitutions (same UI as on Vertretungsplan page)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [chatProposedPlan, setChatProposedPlan] = useState<{
    date: string;
    teacher: string;
    affectedLessons: Array<{
      className: string;
      period: number;
      subject: string;
      room: string;
      substituteTeacher?: string;
      originalTeacher?: string;
      substituteRoom?: string;
      alternativeSubject?: string | null;
      isCascade?: boolean;
    }>;
  } | null>(null);
  // Global functions for substitution confirmation buttons
  useEffect(() => {
    (window as any).confirmSubstitution = async (data: any) => {
      try {
        // SECURITY FIX: Use sessionId for server-side validation instead of client userProfile
        const { data: actionResult, error } = await supabase.functions.invoke('ai-actions', {
          body: {
            action: 'confirm_substitution',
            parameters: data,
            sessionId: sessionId
          }
        });

        if (error) throw error;

        const confirmationMessage = {
          role: 'assistant' as const,
          content: actionResult?.success ? 
            `✅ ${actionResult.result?.message || 'Vertretungsplan erfolgreich erstellt!'}\n${(actionResult.result?.confirmed || []).map((c: string) => `- ${c}`).join('\n')}` :
            `❌ ${actionResult?.result?.error || 'Fehler beim Erstellen des Vertretungsplans'}`
        };

        setConversation(prev => [...prev, confirmationMessage]);

        // Save confirmation message
        if (currentConversationId) {
          await saveMessage(confirmationMessage, currentConversationId);
        }

        toast({
          title: actionResult?.success ? "Erfolg" : "Fehler",
          description: actionResult?.success ? "Vertretungsplan wurde erstellt" : "Fehler beim Erstellen",
          variant: actionResult?.success ? "default" : "destructive"
        });
      } catch (error) {
        console.error('Confirmation error:', error);
        toast({
          title: "Fehler",
          description: "Fehler beim Bestätigen der Vertretung",
          variant: "destructive"
        });
      }
    };

    (window as any).cancelSubstitution = () => {
      const cancelMessage = {
        role: 'assistant' as const,
        content: 'Vertretungsplanung abgebrochen.'
      };
      setConversation(prev => [...prev, cancelMessage]);
    };

    return () => {
      delete (window as any).confirmSubstitution;
      delete (window as any).cancelSubstitution;
    };
  }, [profile, sessionId, currentConversationId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation]);

  // Deterministically map numeric permission profile id to a valid UUID string
  const getProfileUUID = () => {
    const num = Number(profile?.id);
    if (!num || Number.isNaN(num)) return '00000000-0000-0000-0000-000000000000';
    const tail = num.toString(16).padStart(12, '0');
    return `00000000-0000-0000-0000-${tail}`;
  };

  // Load conversation when selected
  const loadConversation = async (conversationId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('chat-service', {
        body: {
          action: 'list_messages',
          conversationId,
          sessionId,
        }
      });

      if (error) throw error;
      const msgs = (data?.messages || []).map((m: any) => ({ role: m.role, content: m.content })) as ChatMessage[];
      setConversation(msgs);
      setCurrentConversationId(conversationId);
    } catch (error) {
      console.error('Error loading conversation:', error);
      toast({
        title: "Fehler",
        description: "Chat konnte nicht geladen werden",
        variant: "destructive"
      });
    }
  };

  // Save message to database
  const saveMessage = async (message: ChatMessage, conversationId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('chat-service', {
        body: {
          action: 'add_message',
          sessionId,
          conversationId,
          role: message.role,
          content: message.content,
        }
      });
      if (error || !data?.success) throw (error || new Error('Save message failed'));
    } catch (error) {
      console.error('Error saving message:', error);
    }
  };

  // Create new conversation
  const createNewConversation = async (firstMessage: string) => {
    if (!profile?.id) return null;

    try {
      const { data, error } = await supabase.functions.invoke('chat-service', {
        body: {
          action: 'create_conversation',
          sessionId,
          title: firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : ''),
        }
      });

      if (error || !data?.success) throw (error || new Error('Create conversation failed'));
      return data.conversationId as string;
    } catch (error) {
      console.error('Error creating conversation:', error);
      return null;
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf', 'text/plain'];
    
    const validFiles = files.filter(file => {
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Fehler",
          description: `Dateityp ${file.type} nicht unterstützt. Erlaubt: PNG, JPG, PDF, TXT`,
          variant: "destructive"
        });
        return false;
      }
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
          title: "Fehler", 
          description: `Datei ${file.name} ist zu groß (max. 10MB)`,
          variant: "destructive"
        });
        return false;
      }
      return true;
    });

    setUploadedFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && uploadedFiles.length === 0) || isLoading) return;

    let messageContent = input;
    if (uploadedFiles.length > 0) {
      const fileDescriptions = uploadedFiles.map(file =>
        `📎 ${file.name} (${file.type}, ${(file.size / 1024).toFixed(1)} KB)`
      ).join('\n');
      messageContent = `${input}\n\n--- Angehängte Dateien ---\n${fileDescriptions}`;
    }

    const userMessage = { role: 'user' as const, content: messageContent };
    setConversation(prev => [...prev, userMessage]);
    setIsLoading(true);
    const currentInput = input;
    const currentFiles = uploadedFiles;
    setInput('');
    setUploadedFiles([]);

    let conversationId = currentConversationId;
    if (!conversationId) {
      conversationId = await createNewConversation(currentInput || 'Datei-Upload');
      if (conversationId) {
        setCurrentConversationId(conversationId);
      }
    }

    if (conversationId) {
      await saveMessage(userMessage, conversationId);
    }

    try {
      const messages = [
        {
          role: 'system',
          content: `Du bist E.D.U.A.R.D. - ein KI-Assistent für das Schulmanagementsystem. Benutzer: "${profile?.name}", Level ${profile?.permission_lvl}.

HEUTE: ${new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
MORGEN (ISO): ${new Date(Date.now() + 86400000).toISOString().split('T')[0]}

KRITISCHE REGELN:
1. Wenn eine Aktion nötig ist, antworte NUR mit der AKTION-Zeile. KEIN weiterer Text, KEINE erfundenen Daten, KEINE eigenen Vorschläge für Vertretungen.
2. ERFINDE NIEMALS Lehrernamen, Stundenpläne oder Vertretungspläne. Die Engine liefert echte Daten.
3. Bei Vertretungsplanung: Gib NUR die AKTION-Zeile aus. Das System zeigt dann automatisch die Ergebnisse.
4. Nach einer AKTION-Zeile: Schreibe NICHTS weiter. Kein "Hier ist der Plan", keine Liste, keine Zusammenfassung.

AKTIONEN (nur die Zeile ausgeben, KEIN weiterer Text):
- AKTION:PLAN_SUBSTITUTION|teacherName:NAME|date:DATUM → Vertretung planen (Engine mit Kaskade)
- AKTION:PLAN_SUBSTITUTION|teacherName:NAME|date:DATUM|period:X → nur bestimmte Stunde(n)
- AKTION:PLAN_SUBSTITUTION|teacherName:NAME|date:DATUM|period:X|periodTo:Y → Stundenbereich
- AKTION:PLAN_SUBSTITUTION|teacherName:NAME|date:montag|dateTo:mittwoch → Zeitraum
- AKTION:CONFIRM_SUBSTITUTION → bestätigt letzten Vorschlag
- AKTION:SHOW_SCHEDULE|className:KLASSE → Stundenplan anzeigen
- AKTION:SHOW_SUBSTITUTION_PLAN|className:KLASSE → Vertretungsplan anzeigen
- AKTION:GET_TEACHERS → Lehrerliste
- AKTION:GET_CLASS_NEXT_SUBJECT|className:KLASSE|subject:FACH → nächstes Fach finden

DATUMSBEISPIELE:
- "morgen" → date:morgen
- "diese Woche" → date:diese woche
- "nächsten Dienstag" → date:dienstag
- "Montag bis Mittwoch" → date:montag|dateTo:mittwoch

STUNDENBEISPIELE:
- "in der 3. Stunde" → period:3
- "1. bis 4. Stunde" → period:1|periodTo:4

BEISPIELE (gib GENAU SO eine Zeile aus, NICHTS weiter):
Nutzer: "Herr König fehlt morgen" → AKTION:PLAN_SUBSTITUTION|teacherName:König|date:morgen
Nutzer: "König ist morgen in der 3. Stunde krank" → AKTION:PLAN_SUBSTITUTION|teacherName:König|date:morgen|period:3
Nutzer: "Schmidt fehlt diese Woche" → AKTION:PLAN_SUBSTITUTION|teacherName:Schmidt|date:diese woche
Nutzer: "bestätige den Plan" → AKTION:CONFIRM_SUBSTITUTION
Nutzer: "Stundenplan 10b" → AKTION:SHOW_SCHEDULE|className:10b
Nutzer: "Harzer fehlt auch morgen" → AKTION:PLAN_SUBSTITUTION|teacherName:Harzer|date:morgen
Nutzer: "Der Vertretungslehrer Müller ist auch krank" → AKTION:PLAN_SUBSTITUTION|teacherName:Müller|date:morgen
Nutzer: "Lang fehlt morgen auch" → AKTION:PLAN_SUBSTITUTION|teacherName:Lang|date:morgen

WICHTIG ZU KASKADEN:
- Wenn ein Vertretungslehrer krank wird, einfach AKTION:PLAN_SUBSTITUTION mit dessen Namen verwenden.
- Die Engine erkennt automatisch, dass dieser Lehrer als Vertretung eingetragen war (Kaskade).
- Du musst NICHTS über vorherige Vertretungen wissen - die Engine löst das automatisch.

SCHULZEITEN: 07:45–13:20 (Block 1–3) oder bis 15:15 (mit Block 4).

${profile?.permission_lvl && profile.permission_lvl >= 10 ? 'ADMIN-AKTIONEN:\n- AKTION:CREATE_ANNOUNCEMENT|title:TITEL|content:INHALT\n- AKTION:CREATE_TTS|title:TITEL|text:TEXT' : ''}

Bei normalen Fragen (keine Aktion nötig) antworte kurz und hilfreich auf Deutsch.`
        },
        ...conversation,
        { role: 'user', content: currentInput }
      ];

      const proxyResponse = await fetch(OLLAMA_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'Redbear/e.d.u.a.r.d.:latest',
          messages,
          stream: true
        })
      });

      if (!proxyResponse.ok || !proxyResponse.body) {
        throw new Error(`Proxy error: ${proxyResponse.statusText}`);
      }

      const reader = proxyResponse.body.pipeThrough(new TextDecoderStream()).getReader();
      let assistantContent = '';

              const assistantMessageIndex = conversation.length + 1;
              setConversation(prev => [...prev, { role: 'assistant', content: '' }]);

              while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const lines = value.split('\n');
                for (const line of lines) {
                  if (line.trim() === '') continue;

                  try {
                    const json = JSON.parse(line);
                    if (json.done === false) {
                      const newContent = json.message?.content || '';
                      assistantContent += newContent;
                      setConversation(prev => {
                        const newConversation = [...prev];
                        newConversation[assistantMessageIndex] = {
                          role: 'assistant',
                          content: assistantContent
                        };
                        return newConversation;
                      });
                      scrollToBottom();
                    } else if (json.done === true) {
                      // Process AI actions after completion
                      await processAIActions(assistantContent, conversationId);
                      
                      if (conversationId) {
                        const finalAssistantResponse = {
                          role: 'assistant' as const,
                          content: assistantContent
                        };
                        await saveMessage(finalAssistantResponse, conversationId);
                        await supabase.functions.invoke('chat-service', {
                          body: {
                            action: 'touch_conversation',
                            sessionId,
                            conversationId,
                          }
                        });
                      }
                    }
                  } catch (e) {
                    console.error('Failed to parse line as JSON:', e, line);
                  }
                }
              }
      
    } catch (error) {
      console.error('Ollama error:', error);
      toast({
        title: "Fehler",
        description: "Der Server ist gerade nicht erreichbar. Bitte versuchen Sie es später erneut.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Process AI Actions
  const processAIActions = async (content: string, conversationId: string | null) => {
    const actionRegex = /AKTION:([A-Z_]+)\|?([^\n]*)/g;
    const matches = [...content.matchAll(actionRegex)];
    
    if (matches.length === 0) return;

    // When an action is detected, replace the AI's verbose response with a loading indicator
    // The AI often generates fake data alongside the action line - we strip that
    setConversation(prev => {
      const updated = [...prev];
      // Find the last assistant message and replace it with just a brief note
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].role === 'assistant') {
          updated[i] = { role: 'assistant', content: '⏳ Aktion wird ausgeführt...' };
          break;
        }
      }
      return updated;
    });

    for (const match of matches) {
      const [fullMatch, actionName, paramString] = match;
      
      try {
        // Parse parameters
        const parameters: any = {};
        if (paramString) {
          const paramPairs = paramString.split('|');
          const standaloneTokens: string[] = [];
          for (const pair of paramPairs) {
            const colonIdx = pair.indexOf(':');
            if (colonIdx > 0) {
              const key = pair.substring(0, colonIdx).trim();
              const value = pair.substring(colonIdx + 1).trim();
              if (key && value) {
                parameters[key] = value;
              }
            } else if (pair && !pair.includes(':')) {
              standaloneTokens.push(pair.trim());
            }
          }
          // Map standalone tokens to date
          if (!parameters.date && standaloneTokens.length > 0) {
            const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
            for (const tkRaw of standaloneTokens) {
              const tk = norm(tkRaw);
              if (['heute','morgen','ubermorgen','uebermorgen','gestern','montag','dienstag','mittwoch','donnerstag','freitag'].includes(tk)) {
                parameters.date = tkRaw;
                break;
              }
            }
          }
        }

        // Handle CONFIRM_SUBSTITUTION without parameters
        if (actionName.toLowerCase() === 'confirm_substitution') {
          // Use stored plan from chat modal or window
          if (chatProposedPlan) {
            // Directly trigger the confirmation via the same handler
            await handleConfirmChatSubstitution();
            // Remove loading message
            setConversation(prev => prev.filter(m => m.content !== '⏳ Aktion wird ausgeführt...'));
            continue;
          }
          const stored = (window as any).lastProposedSubstitution;
          if (stored) {
            Object.assign(parameters, stored);
          } else {
            const errorMessage = { role: 'assistant' as const, content: '❌ Kein Vertretungsplan zum Bestätigen vorhanden.' };
            setConversation(prev => {
              const updated = prev.filter(m => m.content !== '⏳ Aktion wird ausgeführt...');
              return [...updated, errorMessage];
            });
            continue;
          }
        }
        
        // Execute the action via ai-actions edge function
        const { data: actionResult, error } = await supabase.functions.invoke('ai-actions', {
          body: {
            action: actionName.toLowerCase(),
            parameters,
            sessionId: sessionId
          }
        });

        if (error) {
          console.error('Action execution error:', error);
          const errorMsg = { role: 'assistant' as const, content: `❌ Fehler: ${error.message}` };
          setConversation(prev => [...prev, errorMsg]);
          continue;
        }

        // Remove the "loading" message and add the real result
        setConversation(prev => {
          const updated = [...prev];
          // Remove the "⏳ Aktion wird ausgeführt..." message
          const loadingIdx = updated.findIndex(m => m.content === '⏳ Aktion wird ausgeführt...');
          if (loadingIdx >= 0) updated.splice(loadingIdx, 1);
          return updated;
        });

        // Add result message
        const htmlTable = actionResult?.result?.htmlTable;
        const resultContent = actionResult?.success
          ? `${actionResult.result?.message || 'Aktion erfolgreich!'}${htmlTable ? '<br/>' + htmlTable : ''}`
          : `❌ ${actionResult?.result?.error || 'Fehler'}`;
        const resultMessage = { role: 'assistant' as const, content: resultContent };
        setConversation(prev => [...prev, resultMessage]);

        if (conversationId) {
          await saveMessage(resultMessage, conversationId);
        }

        toast({
          title: actionResult?.success ? "Aktion ausgeführt" : "Fehler",
          description: actionResult?.success ? actionResult.result?.message || "Erfolgreich!" : actionResult?.result?.error || "Fehler",
          variant: actionResult?.success ? "default" : "destructive"
        });

        // Handle substitution proposals - show confirmation dialog
        const actionNameLower = actionName.toLowerCase();
        const details = actionResult?.result?.details;
        const subs = details?.substitutions || [];
        if (actionResult?.success && (actionNameLower === 'plan_substitution' || actionNameLower === 'update_vertretungsplan') && subs.length > 0) {
          const proposedPlan = {
            date: details.date,
            teacher: details.teacher,
            affectedLessons: subs.map((s: any) => ({
              className: s.className || s.class_name,
              period: s.period,
              subject: s.subject || s.original_subject,
              room: s.substituteRoom || s.room || s.substitute_room || s.original_room,
              substituteTeacher: s.substituteTeacher || s.substitute_teacher || 'Entfall',
              originalTeacher: s.originalTeacher || s.original_teacher || details.teacher,
              substituteShortened: s.substituteShortened || null,
              substituteRoom: s.substituteRoom || s.room,
              alternativeSubject: s.alternativeSubject || null,
              date: s.date || details.date,
              isCascade: s.isCascade || false,
              originalVertretungId: s.originalVertretungId || null,
              swapSuggestion: s.swapSuggestion || null
            }))
          };

          setChatProposedPlan(proposedPlan);
          setConfirmOpen(true);
          
          // Build summary
          const cascadeInfo = details.cascadeDepth > 0 ? `\n🔄 **Kaskade Tiefe:** ${details.cascadeDepth}` : '';
          const summaryMessage = {
            role: 'assistant' as const,
            content: `📋 **Vertretungsplan-Vorschlag für ${details.teacher}**\n` +
                     `📅 ${new Date(details.date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}` +
                     cascadeInfo + `\n\n` +
                     subs.map((s: any) => {
                       const roomInfo = s.substituteRoom || s.room || '-';
                       const scoreInfo = s.score ? ` [Score: ${s.score}]` : '';
                       const reasonInfo = s.reason ? ` (${s.reason})` : '';
                       return `• ${(s.className || '').toUpperCase()}, ${s.period}. Std: ${s.subject} → **${s.substituteTeacher || 'Entfall'}** (Raum: ${roomInfo})${reasonInfo}${scoreInfo}`;
                     }).join('\n') +
                     `\n\n💡 "bestätige Vertretungsplan" zum Speichern.`
          };

          setConversation(prev => [...prev, summaryMessage]);
          if (conversationId) await saveMessage(summaryMessage, conversationId);

          (window as any).lastProposedSubstitution = {
            substitutions: subs,
            sickTeacher: details.teacher,
            date: details.date
          };
        }
      } catch (error) {
        console.error('Error processing action:', error);
        const errorMessage = { role: 'assistant' as const, content: `❌ Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}` };
        setConversation(prev => [...prev, errorMessage]);
        if (conversationId) await saveMessage(errorMessage, conversationId);
      }
    }
  };

  // Confirm the proposed substitution plan (chat modal)
  const handleConfirmChatSubstitution = async () => {
    if (!chatProposedPlan) return;
    try {
      const { data: actionResult, error } = await supabase.functions.invoke('ai-actions', {
        body: {
          action: 'confirm_substitution',
          parameters: {
            substitutions: chatProposedPlan.affectedLessons,
            sickTeacher: chatProposedPlan.teacher,
            date: chatProposedPlan.date,
          },
          sessionId: sessionId
        }
      });

      if (error) throw error;

      const msg = actionResult?.success
        ? `✅ ${actionResult.result?.message}\n${(actionResult.result?.confirmed || []).map((c: string) => `- ${c}`).join('\n')}`
        : `❌ ${actionResult?.result?.error || 'Fehler beim Erstellen des Vertretungsplans'}`;
      const confirmationMessage = { role: 'assistant' as const, content: msg };
      setConversation(prev => [...prev, confirmationMessage]);
      if (currentConversationId) await saveMessage(confirmationMessage, currentConversationId);

      toast({
        title: actionResult?.success ? 'Erfolg' : 'Fehler',
        description: actionResult?.success ? 'Vertretungsplan wurde erstellt' : 'Fehler beim Erstellen',
        variant: actionResult?.success ? 'default' : 'destructive'
      });

      setConfirmOpen(false);
      setChatProposedPlan(null);
    } catch (e: any) {
      console.error('Confirm chat substitution failed:', e);
      toast({ title: 'Fehler', description: e.message || 'Fehler beim Bestätigen', variant: 'destructive' });
    }
  };

  const handleConversationSelect = (conversationId: string | null) => {
    if (conversationId) {
      loadConversation(conversationId);
    } else {
      setConversation([]);
      setCurrentConversationId(null);
    }
    setSidebarOpen(false); // Close sidebar on mobile after selection
  };

  const handleNewChat = () => {
    setConversation([]);
    setCurrentConversationId(null);
    setInput('');
    setSidebarOpen(false); // Close sidebar on mobile after creating new chat
  };

  // Handle initial message from location state
  useEffect(() => {
    if (location.state?.initialMessage && !currentConversationId) {
      // Auto-submit initial message
      const submitInitialMessage = async () => {
        const event = new Event('submit') as any;
        await handleSubmit(event);
      };
      if (input === location.state.initialMessage) {
        submitInitialMessage();
      }
    }
  }, [location.state?.initialMessage, currentConversationId, input]);

  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block lg:w-80 lg:h-full">
          <ChatSidebar
            currentConversationId={currentConversationId}
            onConversationSelect={handleConversationSelect}
            onNewChat={handleNewChat}
          />
        </div>

        {/* Mobile Sidebar Sheet */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          {/* Main Content */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Header */}
            <header className="border-b bg-card">
              <div className="container mx-auto px-2 sm:px-4 py-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <SheetTrigger asChild className="lg:hidden">
                      <Button variant="ghost" size="sm">
                        <Menu className="h-4 w-4" />
                      </Button>
                    </SheetTrigger>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="flex-shrink-0">
                      <ArrowLeft className="h-4 w-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Zurück</span>
                    </Button>
                    <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                      <Bot className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">E.D.U.A.R.D. Chat</h1>
                        <p className="text-xs sm:text-sm text-muted-foreground hidden md:block truncate">
                          Education, Data, Utility & Automation for Resource Distribution
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 container mx-auto px-2 sm:px-4 py-4 sm:py-8">
              <div className="max-w-4xl mx-auto h-full flex flex-col space-y-4">
                <Card className="flex-1 min-h-0">
                  <CardHeader>
                    <CardTitle>
                      {currentConversationId ? 'Chat' : 'Neuer Chat'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="h-full flex flex-col">
                    {conversation.length === 0 ? (
                      <div className="flex-1 flex items-center justify-center text-center text-muted-foreground">
                        <div>
                          <Bot className="h-16 w-16 mx-auto mb-4 opacity-50" />
                          <h3 className="text-lg font-medium mb-2">Willkommen bei E.D.U.A.R.D.</h3>
                          <p>Education, Data, Utility & Automation for Resource Distribution</p>
                          <p className="text-sm mt-2">Stellen Sie eine Frage oder bitten Sie mich, eine Aktion durchzuführen.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 space-y-4 overflow-y-auto max-h-[60vh]">
                        {conversation.map((message, index) => (
                          <div
                            key={index}
                            className={`p-4 rounded-lg ${
                              message.role === 'user'
                                ? 'bg-primary text-primary-foreground ml-8'
                                : 'bg-muted mr-8'
                            }`}
                          >
                            {/<[^>]+>/i.test(message.content) ? (
                              <div
                                className="prose prose-sm max-w-none dark:prose-invert"
                                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(message.content, {
                                  ALLOWED_TAGS: ['br', 'pre', 'code', 'p', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
                                  ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'class'],
                                  ALLOW_DATA_ATTR: false
                                }) }}
                              />
                            ) : (
                              <div className="prose prose-sm max-w-none dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                                <ReactMarkdown>{message.content}</ReactMarkdown>
                              </div>
                            )}
                          </div>
                        ))}
                        {isLoading && (
                          <div className="flex items-center gap-2 p-4 bg-muted mr-8 rounded-lg">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>KI denkt nach...</span>
                          </div>
                        )}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    {uploadedFiles.length > 0 && (
                      <div className="mb-4 p-3 bg-muted rounded-lg">
                        <p className="text-sm font-medium mb-2">Angehängte Dateien:</p>
                        <div className="space-y-2">
                          {uploadedFiles.map((file, index) => (
                            <div key={index} className="flex items-center justify-between bg-background p-2 rounded">
                              <div className="flex items-center gap-2">
                                <Paperclip className="h-4 w-4" />
                                <span className="text-sm">{file.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  ({(file.size / 1024).toFixed(1)} KB)
                                </span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeFile(index)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Stellen Sie hier Ihre Frage oder bitten Sie um eine Aktion..."
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          disabled={isLoading}
                          className="flex-1"
                        />
                        <input
                          type="file"
                          id="file-upload"
                          multiple
                          accept=".png,.jpg,.jpeg,.pdf,.txt"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => document.getElementById('file-upload')?.click()}
                          disabled={isLoading}
                        >
                          <Upload className="h-4 w-4" />
                        </Button>
                        <Button type="submit" disabled={(!input.trim() && uploadedFiles.length === 0) || isLoading}>
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Unterstützte Dateien: PNG, JPG, PDF, TXT (max. 10MB)
                      </p>
                    </form>
                  </CardContent>
                </Card>
              </div>
            </main>
          </div>

          <SheetContent side="left" className="w-80 p-0">
            <ChatSidebar
              currentConversationId={currentConversationId}
              onConversationSelect={handleConversationSelect}
              onNewChat={handleNewChat}
            />
          </SheetContent>
        </Sheet>

        {/* Confirmation Dialog (matches Vertretungsplan page) */}
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                Vertretungsplan bestätigen
              </DialogTitle>
            </DialogHeader>
            {chatProposedPlan && (
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-medium mb-2">Abwesenheit: {chatProposedPlan.teacher}</h3>
                  <p className="text-sm text-muted-foreground">
                    Datum: {new Date(chatProposedPlan.date + 'T00:00:00').toLocaleDateString('de-DE', {
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                    })}
                  </p>
                </div>
                {chatProposedPlan.affectedLessons?.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Betroffene Stunden:</h4>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {chatProposedPlan.affectedLessons.map((lesson, index) => (
                        <div key={index} className="p-3 bg-muted rounded-lg space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{lesson.className}</span>
                            <span className="text-sm font-medium text-muted-foreground">{lesson.period}. Stunde</span>
                            {lesson.isCascade && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded border border-orange-400 text-orange-600">Kaskade</span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Originalfach: <strong>{lesson.subject ? lesson.subject.charAt(0).toUpperCase() + lesson.subject.slice(1) : '-'}</strong> · Raum: {lesson.room || '-'}
                          </div>
                          {lesson.substituteTeacher && (
                            <div className="text-sm text-primary">
                              → <strong>{lesson.substituteTeacher}</strong>
                              {lesson.alternativeSubject && lesson.alternativeSubject !== lesson.subject && (
                                <span className="ml-1">({lesson.alternativeSubject.charAt(0).toUpperCase() + lesson.alternativeSubject.slice(1)})</span>
                              )}
                              {lesson.substituteRoom && lesson.substituteRoom !== lesson.room && (
                                <span className="ml-1 text-muted-foreground">· Raum: {lesson.substituteRoom}</span>
                              )}
                              {(!lesson.substituteRoom || lesson.substituteRoom === lesson.room) && (
                                <span className="ml-1 text-muted-foreground">· Raum: {lesson.substituteRoom || lesson.room || '-'}</span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2 pt-4">
                  <Button variant="outline" onClick={() => setConfirmOpen(false)} className="flex-1">Abbrechen</Button>
                  <Button onClick={handleConfirmChatSubstitution} className="flex-1">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Bestätigen und Speichern
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default AIChat;