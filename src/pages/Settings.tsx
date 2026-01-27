import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  ArrowLeft, 
  Settings as SettingsIcon, 
  Wifi, 
  WifiOff, 
  CircuitBoard,
  Activity,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const Settings = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Check permissions
  if (!profile || profile.permission_lvl < 8) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardHeader>
            <CardTitle>Zugriff verweigert</CardTitle>
            <CardDescription>
              Sie haben keine Berechtigung für die Systemeinstellungen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zurück zum Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No sample devices - empty state
  const arduinoDevices: any[] = [];

  const getStatusIcon = (status: string) => {
    return status === "Online" ? (
      <Wifi className="h-4 w-4 text-green-500" />
    ) : (
      <WifiOff className="h-4 w-4 text-red-500" />
    );
  };

  const getStatusBadge = (status: string) => {
    return status === "Online" ? "default" : "destructive";
  };

  const handleDeviceAction = (deviceId: number, action: string) => {
    toast({
      title: "Aktion ausgeführt",
      description: `${action} für Gerät ID ${deviceId} wurde ausgelöst.`
    });
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
              <h1 className="text-2xl font-bold text-foreground">Systemeinstellungen</h1>
              <p className="text-muted-foreground">Arduino-Geräte und Systemkonfiguration</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* System Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Geräte Online</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">0/0</div>
                <p className="text-xs text-muted-foreground">
                  Keine Geräte
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Warnungen</CardTitle>
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">0</div>
                <p className="text-xs text-muted-foreground">
                  Keine Warnungen
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Netzwerk</CardTitle>
                <Activity className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">98%</div>
                <p className="text-xs text-muted-foreground">
                  Uptime heute
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Letztes Update</CardTitle>
                <SettingsIcon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">11:30</div>
                <p className="text-xs text-muted-foreground">
                  Automatisch
                </p>
              </CardContent>
            </Card>
          </div>

          {/* User Profile */}
          <Card>
            <CardHeader>
              <CardTitle>Benutzerprofil</CardTitle>
              <CardDescription>
                Ihre persönlichen Informationen und Keycard-Details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Name</Label>
                  <p className="text-sm text-muted-foreground mt-1">{profile?.name}</p>
                </div>
                <div>
                  <Label>Benutzername</Label>
                  <p className="text-sm text-muted-foreground mt-1">{profile?.username}</p>
                </div>
                <div>
                  <Label>Berechtigung</Label>
                  <p className="text-sm text-muted-foreground mt-1">Level {profile?.permission_lvl}</p>
                </div>
                <div>
                  <Label>Keycard-Nummer</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {(profile as any)?.keycard_number || 'Keine Keycard zugewiesen'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Systemkonfiguration</CardTitle>
              <CardDescription>
                Allgemeine Einstellungen für das E.D.U.A.R.T. System
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto-refresh">Automatische Aktualisierung</Label>
                  <p className="text-sm text-muted-foreground">
                    Geräteliste alle 30 Sekunden aktualisieren
                  </p>
                </div>
                <Switch
                  id="auto-refresh"
                  checked={autoRefresh}
                  onCheckedChange={setAutoRefresh}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="server-ip">Server IP-Adresse</Label>
                  <Input
                    id="server-ip"
                    value="192.168.1.100"
                    readOnly
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="server-port">Server Port</Label>
                  <Input
                    id="server-port"
                    value="8080"
                    readOnly
                    className="mt-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Arduino Devices */}
          <Card>
            <CardHeader>
              <CardTitle>Arduino-Geräte</CardTitle>
              <CardDescription>
                Übersicht und Verwaltung aller angeschlossenen Arduino-Geräte
              </CardDescription>
            </CardHeader>
            <CardContent>
              {arduinoDevices.length === 0 ? (
                <div className="text-center py-8">
                  <CircuitBoard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Keine Arduino-Geräte konfiguriert.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {arduinoDevices.map((device) => (
                    <Card key={device.id}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-primary/10 rounded-lg">
                              <CircuitBoard className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                              <h3 className="font-semibold">{device.name}</h3>
                              <p className="text-sm text-muted-foreground">
                                {device.type} • {device.ipAddress}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {device.function}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="flex items-center gap-2 mb-1">
                                {getStatusIcon(device.status)}
                                <Badge variant={getStatusBadge(device.status)}>
                                  {device.status}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Letzter Ping: {device.lastPing}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Uptime: {device.uptime}
                              </p>
                            </div>
                            
                            <div className="flex gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleDeviceAction(device.id, "Ping")}
                              >
                                Ping
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleDeviceAction(device.id, "Neustart")}
                              >
                                Neustart
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleDeviceAction(device.id, "Konfiguration")}
                              >
                                Config
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Settings;