import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Send, MessageCircle, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const Hausaufgaben = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [question, setQuestion] = useState('');
  const [conversation, setConversation] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendQuestion = async () => {
    if (!question.trim()) return;

    const userMessage = { role: 'user' as const, content: question };
    setConversation(prev => [...prev, userMessage]);
    setIsLoading(true);
    setQuestion('');

    try {
      // TODO: Implement API call to Redbear/e.d.u.a.r.d.
      // For now, show a placeholder response
      setTimeout(() => {
        const assistantResponse = {
          role: 'assistant' as const,
          content: 'Ich helfe gerne bei Ihren Hausaufgaben! Diese Funktion wird bald mit dem Redbear/e.d.u.a.r.d. Modell implementiert.'
        };
        setConversation(prev => [...prev, assistantResponse]);
        setIsLoading(false);
      }, 1000);
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Es gab ein Problem beim Senden Ihrer Frage.",
        variant: "destructive"
      });
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendQuestion();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zurück
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Hausaufgaben-Assistent</h1>
              <p className="text-muted-foreground">KI-gestützte Lernhilfe mit Redbear/e.d.u.a.r.d.</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Welcome Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Willkommen beim Hausaufgaben-Assistenten
              </CardTitle>
              <CardDescription>
                Stellen Sie Fragen zu Ihren Hausaufgaben und erhalten Sie hilfreiche Erklärungen und Lösungsansätze.
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Conversation */}
          <Card className="min-h-[400px]">
            <CardHeader>
              <CardTitle>Unterhaltung</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {conversation.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Stellen Sie eine Frage, um zu beginnen!</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[400px] overflow-y-auto">
                  {conversation.map((message, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded-lg ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground ml-8'
                          : 'bg-muted mr-8'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex items-center gap-2 p-4 bg-muted mr-8 rounded-lg">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Der Assistent denkt nach...</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Input */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <Textarea
                  placeholder="Stellen Sie hier Ihre Frage zu den Hausaufgaben..."
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={handleKeyPress}
                  className="flex-1"
                  rows={3}
                />
                <Button 
                  onClick={handleSendQuestion}
                  disabled={!question.trim() || isLoading}
                  className="self-end"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Hausaufgaben;