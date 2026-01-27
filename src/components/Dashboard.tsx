import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEnhancedPermissions } from '@/hooks/useEnhancedPermissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar, 
  Users, 
  Megaphone, 
  KeyRound, 
  Settings,
  LogOut,
  Clock,
  BookOpen,
  UserPlus,
  Volume2,
  FileText,
  Shield,
  Palette,
  Library,
  MessageCircle,
  Monitor,
  MapPin
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import CreateUserModal from './CreateUserModal';
import AIAssistant from './AIAssistant';
import MobileNavigation from './MobileNavigation';
import { MessageNotificationWidget } from './MessageNotificationWidget';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { hasPermission } = useEnhancedPermissions();
  const [showCreateUser, setShowCreateUser] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    toast({
      title: "Abgemeldet",
      description: "Sie wurden erfolgreich abgemeldet."
    });
  };

  const getPermissionBadgeVariant = (level: number) => {
    if (level >= 10) return "default"; // Schulleitung
    if (level >= 8) return "secondary"; // Verwaltung/Administrator  
    if (level >= 5) return "outline"; // Lehrer
    return "destructive"; // Besucher/Schüler
  };

  const getPermissionColor = (level: number) => {
    if (level >= 10) return "text-primary";
    if (level >= 8) return "text-secondary-foreground";
    if (level >= 5) return "text-muted-foreground";
    return "text-destructive";
  };

  const adminFeatures = [
    { icon: Users, title: "Benutzerverwaltung", description: "Benutzer und Berechtigungen verwalten", path: "/user-management" },
    { icon: Shield, title: "Berechtigungen", description: "Detaillierte Berechtigungen konfigurieren", path: "/permissions" },
    { icon: Monitor, title: "Display-Verwaltung", description: "BERT E-Paper Displays verwalten", path: "/display-management" },
    { icon: Volume2, title: "Audio-Durchsagen", description: "Durchsagen verwalten und TTS", path: "/audio-announcements" },
    { icon: Library, title: "Bibliothek", description: "Bücher & Ausleihen", path: "/bibliothek" },
    { icon: KeyRound, title: "Keycard-System", description: "Zugangskontrolle konfigurieren", path: "/keycard" },
    { icon: Settings, title: "Systemeinstellungen", description: "Arduino-Geräte verwalten", path: "/settings" }
  ];

  const teacherFeatures = [
    { icon: Calendar, title: "Vertretungsplan", description: "Stunden verwalten und Vertretungen planen", path: "/vertretungsplan" },
    { icon: MapPin, title: "Raumbelegung & Buchung", description: "Räume einsehen und spontan buchen", path: "/room-booking" },
    { icon: Megaphone, title: "Ankündigungen", description: "Durchsagen erstellen und verwalten", path: "/announcements" },
    { icon: FileText, title: "Dokumenten-Analyse", description: "Material hochladen und KI-Fragen stellen", path: "/document-analysis" },
    { icon: BookOpen, title: "Klassenverwaltung", description: "Klassen und Stundenpläne bearbeiten", path: "/klassenverwaltung" }
  ];

  const studentFeatures = [
    { icon: Clock, title: "Stundenplan", description: "Aktueller Stundenplan und Vertretungen", path: "/stundenplan" },
    { icon: Calendar, title: "Vertretungsplan", description: "Aktuelle Vertretungen einsehen", path: "/vertretungsplan" },
    { icon: Megaphone, title: "Ankündigungen", description: "Aktuelle Schulnachrichten", path: "/announcements" },
    { icon: Library, title: "Bibliothek", description: "Bücher ausleihen und verwalten", path: "/bibliothek" },
    { icon: MessageCircle, title: "Nachrichten öffnen", description: "Mit anderen Mitgliedern chatten", path: "/private-messages" },
    { icon: Palette, title: "Design & Farben", description: "Farbschema der App anpassen", path: "/theme-settings" }
  ];

  // Chat feature for all users (Level 2+)
  const chatFeature = [
    { icon: MessageCircle, title: "Private Nachrichten", description: "Mit anderen Mitgliedern chatten", path: "/private-messages", permission: 'private_messages' }
  ];

  // Theme feature for all users
  const themeFeature = [
    { icon: Palette, title: "Design & Farben", description: "Farbschema der App anpassen", path: "/theme-settings", permission: 'theme_settings' }
  ];

  // Filter features based on permissions
  const getFilteredFeatures = (features: any[]) => {
    return features.filter(feature => {
      if (!feature.permission) return true;
      return hasPermission(feature.permission);
    });
  };

  const adminFeaturesWithPermissions = [
    { ...adminFeatures[0], permission: 'user_management' },
    { ...adminFeatures[1], permission: 'permission_management' },
    { ...adminFeatures[2], permission: 'display_management' },
    { ...adminFeatures[3], permission: 'audio_announcements' },
    { ...adminFeatures[4], permission: 'library_manage_books' },
    { ...adminFeatures[5], permission: 'keycard_system' },
    { ...adminFeatures[6], permission: 'system_settings' }
  ];

  const teacherFeaturesWithPermissions = [
    { ...teacherFeatures[0], permission: 'view_vertretungsplan' },
    { ...teacherFeatures[1], permission: 'room_booking' },
    { ...teacherFeatures[2], permission: 'create_announcements' },
    { ...teacherFeatures[3], permission: 'document_analysis' },
    { ...teacherFeatures[4], permission: 'manage_schedules' }
  ];

  // Librarian features (Level 6) 
  const librarianFeatures = [
    { icon: Library, title: "Bibliothek", description: "Bücher und Ausleihen verwalten", path: "/bibliothek", permission: 'library_view' },
    { icon: Calendar, title: "Vertretungsplan", description: "Aktuelle Vertretungen einsehen", path: "/vertretungsplan", permission: 'view_vertretungsplan' },
    { icon: Megaphone, title: "Ankündigungen", description: "Aktuelle Schulnachrichten", path: "/announcements", permission: 'view_announcements' }
  ];

  const studentFeaturesWithPermissions = [
    { ...studentFeatures[0], permission: 'view_schedule' },
    { ...studentFeatures[1], permission: 'view_vertretungsplan' },
    { ...studentFeatures[2], permission: 'view_announcements' },
    { ...studentFeatures[3], permission: 'library_view' }
  ];

  const renderFeatureCards = (features: any[]) => {
    const filteredFeatures = getFilteredFeatures(features);
    
    if (filteredFeatures.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          Keine verfügbaren Funktionen für Ihre Berechtigung.
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {filteredFeatures.map((feature, index) => (
          <Card 
            key={index} 
            className="hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => feature.path && navigate(feature.path)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>{feature.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-2 sm:px-4 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <MobileNavigation />
              <div className="min-w-0 flex-1">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">E.D.U.A.R.D.</h1>
                <p className="text-sm sm:text-base text-muted-foreground">Education, Data, Utility & Automation for Resource Distribution</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:text-right w-full sm:w-auto">
                {/* Mobile Layout */}
                <div className="sm:hidden w-full">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <p className="font-medium text-foreground text-sm">{profile?.name || user?.email}</p>
                    <Badge variant={getPermissionBadgeVariant(profile?.permission_lvl || 1)} className="text-xs">
                      {profile?.permission_lvl >= 10 ? "Schulleitung" : profile?.permission_lvl >= 8 ? "Verwaltung" : profile?.permission_lvl === 6 ? "Bibliothekarin" : profile?.permission_lvl >= 5 ? "Lehrkraft" : profile?.permission_lvl > 1 ? "Schüler" : "Besucher"}
                    </Badge>
                  </div>
                  {hasPermission('user_management') && (
                    <Button variant="outline" size="sm" onClick={() => setShowCreateUser(true)} className="w-full text-xs">
                      <UserPlus className="h-3 w-3 mr-2" />
                      Benutzer erstellen
                    </Button>
                  )}
                </div>
                
                {/* Desktop Layout */}
                <div className="hidden sm:flex items-center gap-2">
                  <p className="font-medium text-foreground text-base">{profile?.name || user?.email}</p>
                </div>
                <div className="hidden sm:flex items-center gap-2 flex-wrap">
                  <Badge variant={getPermissionBadgeVariant(profile?.permission_lvl || 1)} className="text-xs">
                    {profile?.permission_lvl >= 10 ? "Schulleitung" : profile?.permission_lvl >= 8 ? "Verwaltung" : profile?.permission_lvl === 6 ? "Bibliothekarin" : profile?.permission_lvl >= 5 ? "Lehrkraft" : profile?.permission_lvl > 1 ? "Schüler" : "Besucher"}
                  </Badge>
                </div>
              </div>
              <div className="hidden sm:flex gap-2">
                {hasPermission('user_management') && (
                  <Button variant="outline" size="sm" onClick={() => setShowCreateUser(true)} className="text-sm">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Benutzer erstellen
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleSignOut} className="text-sm">
                  <LogOut className="h-4 w-4 mr-2" />
                  Abmelden
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        <div className="space-y-4 sm:space-y-8">
          {/* Welcome Section */}
          <Card>
            <CardHeader>
              <CardTitle>Willkommen, {profile?.name || "Benutzer"}!</CardTitle>
              <CardDescription className="space-y-2">
                <div>
                  {profile?.permission_lvl && profile.permission_lvl >= 10 
                    ? "Als Schulleitung haben Sie Zugriff auf alle Systemfunktionen."
                    : profile?.permission_lvl && profile.permission_lvl >= 8
                    ? "Als Verwaltung/Administrator haben Sie Zugriff auf erweiterte Systemfunktionen."
                    : profile?.permission_lvl === 6
                    ? "Als Bibliothekarin können Sie die Bibliothek und Bücher verwalten."
                    : profile?.permission_lvl && profile.permission_lvl >= 5
                    ? "Als Lehrkraft können Sie Stundenpläne und Ankündigungen verwalten."
                    : profile?.permission_lvl && profile.permission_lvl > 1
                    ? `Als Schüler der Klasse 10b (Klassenlehrer: Frau Kunadt) können Sie Ihren Stundenplan einsehen und den Hausaufgaben-Assistenten nutzen.`
                    : "Als Besucher haben Sie eingeschränkten Zugriff auf öffentliche Inhalte."
                  }
                </div>
                {(profile as any)?.keycard_number && (
                  <div className="flex items-center gap-2 text-sm">
                    <KeyRound className="h-4 w-4" />
                    <span>Ihre Keycard-Nummer: <strong>{(profile as any).keycard_number}</strong></span>
                  </div>
                )}
              </CardDescription>
            </CardHeader>
          </Card>
          
          {/* AI Assistant */}
          <AIAssistant />
          
          {/* Message Notifications */}
          <MessageNotificationWidget />
          
          {/* Admin Features */}
          {getFilteredFeatures(adminFeaturesWithPermissions).length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">
                {profile?.permission_lvl && profile.permission_lvl >= 10 ? "Schulleitung" : "Verwaltung"}
              </h2>
              {renderFeatureCards(adminFeaturesWithPermissions)}
            </div>
          )}

          {/* Teacher Features - Only for Level 5-7 and 8+ (but not librarians Level 6) */}
          {getFilteredFeatures(teacherFeaturesWithPermissions).length > 0 && profile?.permission_lvl !== 6 && (profile?.permission_lvl || 1) >= 5 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">
                {profile?.permission_lvl && profile.permission_lvl >= 8 ? "Lehrkraft-Funktionen" : "Ihre Funktionen"}
              </h2>
              {renderFeatureCards(teacherFeaturesWithPermissions)}
            </div>
          )}

          {/* Librarian Features */}
          {getFilteredFeatures(librarianFeatures).length > 0 && profile?.permission_lvl === 6 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">
                Ihre Funktionen
              </h2>
              {renderFeatureCards(librarianFeatures)}
            </div>
          )}

          {/* Chat Feature - Available for all users with permission */}
          {getFilteredFeatures(chatFeature).length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">Kommunikation</h2>
              {renderFeatureCards(chatFeature)}
            </div>
          )}

          {/* Theme Feature - Available for all users with permission */}
          {getFilteredFeatures(themeFeature).length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">Personalisierung</h2>
              {renderFeatureCards(themeFeature)}
            </div>
          )}

          {/* Student/Visitor Features - Only for Level 1-4 */}
          {getFilteredFeatures(studentFeaturesWithPermissions).length > 0 && (profile?.permission_lvl || 1) <= 4 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">
                {profile?.permission_lvl && profile.permission_lvl > 1 ? "Ihre Funktionen" : "Verfügbare Funktionen"}
              </h2>
              {renderFeatureCards(studentFeaturesWithPermissions)}
            </div>
          )}
        </div>
      </main>

      <CreateUserModal 
        isOpen={showCreateUser} 
        onClose={() => setShowCreateUser(false)}
      />
    </div>
  );
};

export default Dashboard;