import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEnhancedPermissions } from '@/hooks/useEnhancedPermissions';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Menu, 
  Home,
  Calendar, 
  Users, 
  Megaphone, 
  KeyRound, 
  Settings,
  LogOut,
  Clock,
  BookOpen,
  Volume2,
  FileText,
  Shield,
  MessageSquare,
  MessageCircle,
  Palette,
  X
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface MobileNavigationProps {
  className?: string;
}

const MobileNavigation: React.FC<MobileNavigationProps> = ({ className = "" }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const { hasPermission } = useEnhancedPermissions();
  const [isOpen, setIsOpen] = useState(false);

  const handleSignOut = async () => {
    setIsOpen(false);
    await signOut();
    toast({
      title: "Abgemeldet",
      description: "Sie wurden erfolgreich abgemeldet."
    });
  };

  const handleNavigation = (path: string) => {
    setIsOpen(false);
    navigate(path);
  };

  const getPermissionBadgeVariant = (level: number) => {
    if (level >= 10) return "default";
    if (level >= 8) return "secondary";
    if (level >= 5) return "outline";
    return "destructive";
  };

  // Navigation items with permission requirements
  const navigationItems = [
    { 
      icon: Home, 
      label: "Dashboard", 
      path: "/", 
      permission: null 
    },
    { 
      icon: MessageSquare, 
      label: "KI-Chat", 
      path: "/ai-chat", 
      permission: "view_chat" 
    },
    { 
      icon: MessageCircle, 
      label: "Private Nachrichten", 
      path: "/private-messages", 
      permission: "private_messages" 
    },
    { 
      icon: Clock, 
      label: "Stundenplan", 
      path: "/stundenplan", 
      permission: "view_schedule" 
    },
    { 
      icon: Calendar, 
      label: "Vertretungsplan", 
      path: "/vertretungsplan", 
      permission: "view_vertretungsplan" 
    },
    { 
      icon: Megaphone, 
      label: "Ankündigungen", 
      path: "/announcements", 
      permission: "view_announcements" 
    },
    { 
      icon: FileText, 
      label: "Dokumenten-Analyse", 
      path: "/document-analysis", 
      permission: "document_analysis" 
    },
    { 
      icon: BookOpen, 
      label: "Klassenverwaltung", 
      path: "/klassenverwaltung", 
      permission: "manage_schedules" 
    },
    { 
      icon: Volume2, 
      label: "Audio-Durchsagen", 
      path: "/audio-announcements", 
      permission: "audio_announcements" 
    },
    { 
      icon: Users, 
      label: "Benutzer", 
      path: "/user-management", 
      permission: "user_management" 
    },
    { 
      icon: Shield, 
      label: "Berechtigungen", 
      path: "/permissions", 
      permission: "permission_management" 
    },
    { 
      icon: KeyRound, 
      label: "Keycard", 
      path: "/keycard", 
      permission: "keycard_system" 
    },
  { 
    icon: Palette, 
    label: "Farben", 
    path: "/theme-settings", 
    permission: "theme_settings" 
  },
  { 
    icon: Settings, 
    label: "Einstellungen", 
    path: "/settings", 
    permission: "system_settings" 
  }
  ];

  // Filter items based on permissions
  const visibleItems = navigationItems.filter(item => 
    !item.permission || hasPermission(item.permission)
  );

  const isCurrentPath = (path: string) => location.pathname === path;

  return (
    <div className={`md:hidden ${className}`}>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="p-2"
            aria-label="Menü öffnen"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-80 overflow-y-auto">
          <SheetHeader className="space-y-4">
            <SheetTitle className="text-lg font-bold">E.D.U.A.R.D.</SheetTitle>
            
            {/* User Info */}
            <div className="flex flex-col items-start space-y-2 p-3 bg-muted/50 rounded-lg">
              <p className="font-medium text-sm text-foreground">
                {profile?.name || profile?.username || 'Benutzer'}
              </p>
              <div className="flex items-center gap-2">
                <Badge variant={getPermissionBadgeVariant(profile?.permission_lvl || 1)} className="text-xs">
                  {profile?.permission_lvl >= 10 ? "Schulleitung" : 
                   profile?.permission_lvl >= 8 ? "Verwaltung" : 
                   profile?.permission_lvl >= 5 ? "Lehrkraft" : 
                   profile?.permission_lvl > 1 ? "Schüler" : "Besucher"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Level {profile?.permission_lvl || 1}
                </span>
              </div>
              {(profile as any)?.user_class && (
                <span className="text-xs text-muted-foreground">
                  Klasse: {(profile as any).user_class}
                </span>
              )}
            </div>
          </SheetHeader>

          <Separator className="my-4" />

          {/* Navigation Items */}
          <nav className="space-y-2">
            {visibleItems.map((item) => (
              <Button
                key={item.path}
                variant={isCurrentPath(item.path) ? "secondary" : "ghost"}
                className="w-full justify-start text-left font-normal"
                onClick={() => handleNavigation(item.path)}
              >
                <item.icon className="mr-3 h-4 w-4" />
                {item.label}
              </Button>
            ))}
          </nav>

          <Separator className="my-4" />

          {/* Sign Out */}
          <Button
            variant="outline"
            className="w-full justify-start text-left font-normal"
            onClick={handleSignOut}
          >
            <LogOut className="mr-3 h-4 w-4" />
            Abmelden
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default MobileNavigation;