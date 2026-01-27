import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermissionGuard } from '@/hooks/usePermissionGuard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Send, Bot, ShieldX } from 'lucide-react';

const AIAssistant = () => {
  const [input, setInput] = useState('');
  const navigate = useNavigate();
  const { isVisible, isLoading } = usePermissionGuard({ requiredPermission: 'view_chat' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Navigate to chat page with the initial message
    navigate('/ai-chat', { state: { initialMessage: input } });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <div className="animate-pulse">Lade KI-Assistent...</div>
        </CardContent>
      </Card>
    );
  }

  if (!isVisible) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4 text-muted-foreground">
            <ShieldX className="h-5 w-5" />
            <h3 
              className="font-semibold cursor-pointer hover:text-primary transition-colors" 
              onClick={() => navigate('/ai-chat')}
            >
              KI-Assistent
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Sie haben keine Berechtigung für den KI-Chat. Wenden Sie sich an einen Administrator.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 mb-4">
          <Bot className="h-5 w-5 text-primary" />
          <h3 
            className="font-semibold cursor-pointer hover:text-primary transition-colors" 
            onClick={() => navigate('/ai-chat')}
          >
            KI-Assistent
          </h3>
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            placeholder="Frage mich etwas oder bitte mich, eine Aktion durchzuführen..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={!input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2">
          Die KI prüft automatisch deine Berechtigung und führt erlaubte Aktionen aus.
        </p>
      </CardContent>
    </Card>
  );
};

export default AIAssistant;