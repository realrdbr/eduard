import React from 'react';
import { useSecurityMiddleware } from '@/hooks/useSecurityMiddleware';
import { useAdminRights } from '@/hooks/useAdminRights';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const SecurityMonitor: React.FC = () => {
  const { hasAdminRights } = useAdminRights();
  const { securityEvents, clearSecurityEvents } = useSecurityMiddleware();

  if (!hasAdminRights) {
    return null;
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'suspicious_activity':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'session_timeout':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'permission_change':
        return <Shield className="h-4 w-4 text-green-500" />;
      default:
        return <CheckCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'suspicious_activity':
        return 'destructive';
      case 'session_timeout':
        return 'secondary';
      case 'permission_change':
        return 'default';
      default:
        return 'outline';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Sicherheitsüberwachung
            </CardTitle>
            <CardDescription>
              Überwachung verdächtiger Aktivitäten und Sicherheitsereignisse
            </CardDescription>
          </div>
          {securityEvents.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearSecurityEvents}>
              Ereignisse löschen
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        {securityEvents.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <p className="text-muted-foreground">Keine Sicherheitsereignisse</p>
          </div>
        ) : (
          <div className="space-y-3">
            {securityEvents.map((event, index) => (
              <div 
                key={index}
                className="flex items-start justify-between p-3 border rounded-lg bg-card"
              >
                <div className="flex items-start gap-3">
                  {getEventIcon(event.type)}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={getEventColor(event.type) as any}>
                        {event.type.replace('_', ' ').toUpperCase()}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(event.timestamp, { 
                          addSuffix: true
                        })}
                      </span>
                    </div>
                    <p className="text-sm">{event.details}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SecurityMonitor;