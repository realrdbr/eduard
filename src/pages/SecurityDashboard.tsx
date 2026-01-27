import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield, Users, Database, Key } from 'lucide-react';
import SecurityMonitor from '@/components/SecurityMonitor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminRights } from '@/hooks/useAdminRights';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

const SecurityDashboard = () => {
  const navigate = useNavigate();
  const { hasAdminRights } = useAdminRights();
  const { profile } = useAuth();

  if (!profile || !hasAdminRights) {
    toast({
      variant: "destructive",
      title: "Zugriff verweigert",
      description: "Sie haben keine Berechtigung für diese Seite."
    });
    navigate('/', { replace: true });
    return null;
  }

  const securityFeatures = [
    {
      icon: <Shield className="h-6 w-6" />,
      title: "RLS-Richtlinien",
      description: "Row-Level Security für alle Tabellen aktiviert",
      status: "Aktiv"
    },
    {
      icon: <Key className="h-6 w-6" />,
      title: "Passwort-Verschlüsselung",
      description: "Alle Passwörter werden mit bcrypt gehashed",
      status: "Aktiv"
    },
    {
      icon: <Users className="h-6 w-6" />,
      title: "Brute-Force-Schutz",
      description: "Schutz vor wiederholten Anmeldeversuchen",
      status: "Aktiv"
    },
    {
      icon: <Database className="h-6 w-6" />,
      title: "Session-Verwaltung",
      description: "Sichere Session-Token mit automatischer Rotation",
      status: "Aktiv"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zurück zum Dashboard
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Shield className="h-6 w-6" />
                Sicherheitsdashboard
              </h1>
              <p className="text-muted-foreground">
                Überwachung und Verwaltung der Systemsicherheit
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Security Status Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {securityFeatures.map((feature, index) => (
            <Card key={index}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  {feature.icon}
                  <span className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 px-2 py-1 rounded">
                    {feature.status}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <CardTitle className="text-sm mb-1">{feature.title}</CardTitle>
                <CardDescription className="text-xs">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Security Monitor */}
        <SecurityMonitor />

        {/* Security Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Sicherheitsaktionen</CardTitle>
            <CardDescription>
              Administrative Sicherheitsfunktionen
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <Button 
              variant="outline" 
              onClick={() => navigate('/user-management')}
              className="flex items-center gap-2"
            >
              <Users className="h-4 w-4" />
              Benutzerverwaltung
            </Button>
            <Button 
              variant="outline" 
              onClick={() => navigate('/permissions')}
              className="flex items-center gap-2"
            >
              <Shield className="h-4 w-4" />
              Berechtigungen
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default SecurityDashboard;