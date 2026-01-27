import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEnhancedPermissions } from '@/hooks/useEnhancedPermissions';
import { useUserDataSync } from '@/hooks/usePermissionSync';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Users, UserPlus, Edit, Trash2, Settings } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import CreateUserModal from '@/components/CreateUserModal';
import EditUserModal from '@/components/EditUserModal';
import PermissionManager from '@/components/PermissionManager';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
interface User {
  id: number;
  username: string;
  name: string;
  permission_lvl: number;
  created_at: string;
  user_class?: string;
  keycard_number?: string;
  keycard_active?: boolean;
}

const UserManagement = () => {
  const navigate = useNavigate();
  const { user, profile, sessionId } = useAuth();
  const { hasPermission, isLoaded } = useEnhancedPermissions();
  
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [confirmDeleteOpen1, setConfirmDeleteOpen1] = useState(false);
  const [confirmDeleteOpen2, setConfirmDeleteOpen2] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Listen to user data changes and refresh the list
  useUserDataSync(() => {
    if (profile) {
      fetchUsers();
    }
  });
  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    // Wait for permissions to load before checking access
    if (!isLoaded) return;

    if (profile && !hasPermission('user_management')) {
      toast({
        variant: "destructive",
        title: "Zugriff verweigert",
        description: "Sie haben keine Berechtigung für die Benutzerverwaltung."
      });
      navigate('/');
      return;
    }
    
    fetchUsers();
  }, [user, profile, navigate, hasPermission, isLoaded]);

  const fetchUsers = async () => {
    try {
      if (!profile) throw new Error('Kein Profil gefunden');

      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'list_users',
          sessionId: sessionId,
        },
      });
      
      if (error || !data?.success) {
        throw new Error(data?.error || error?.message);
      }
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Benutzer konnten nicht geladen werden."
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUserCreated = () => {
    setShowCreateModal(false);
    fetchUsers(); // Refresh the user list
  };

const handleEditUser = (user: User) => {
  setSelectedUser(user);
  setShowEditModal(true);
};

const handleEditModalClose = () => {
  setShowEditModal(false);
  setSelectedUser(null);
  fetchUsers(); // Refresh the user list
};

const requestDeleteUser = (u: User) => {
  setSelectedUser(u);
  setConfirmDeleteOpen1(true);
};

const handleConfirmStep1 = () => {
  setConfirmDeleteOpen1(false);
  setConfirmDeleteOpen2(true);
};

const handleDeleteUser = async () => {
  if (!selectedUser) return;
  setDeleting(true);
    try {
      if (!profile) throw new Error('Kein Profil gefunden');

      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'delete_user',
          sessionId: sessionId,
          targetUserId: selectedUser.id,
          targetUsername: selectedUser.username
        }
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message);

      toast({ title: 'Benutzer gelöscht', description: `${selectedUser.name} wurde entfernt.` });
      setUsers((prev) => prev.filter((u) => u.id !== selectedUser.id));
    } catch (err) {
      console.error('Error deleting user:', err);
      toast({ title: 'Fehler', description: 'Benutzer konnte nicht gelöscht werden.', variant: 'destructive' });
    } finally {
      setDeleting(false);
      setConfirmDeleteOpen2(false);
      setSelectedUser(null);
    }
};
  const getPermissionBadge = (level: number) => {
    if (level >= 10) return { text: "Schulleitung", variant: "default" as const };
    if (level >= 8) return { text: "Administrator", variant: "secondary" as const };
    if (level === 6) return { text: "Bibliothekar/in", variant: "outline" as const };
    if (level >= 5) return { text: "Lehrkraft", variant: "outline" as const };
    if (level === 1) return { text: "Besucher", variant: "outline" as const };
    return { text: "Schüler", variant: "outline" as const };
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading || !isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-2 sm:px-4 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 min-w-0 flex-1">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="self-start">
                <ArrowLeft className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Zurück zum Dashboard</span>
                <span className="sm:hidden">Zurück</span>
              </Button>
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-foreground">Benutzerverwaltung</h1>
                  <p className="text-sm text-muted-foreground">Benutzer und Berechtigungen verwalten</p>
                </div>
              </div>
            </div>
            <Button 
              onClick={() => setShowCreateModal(true)} 
              size="sm" 
              className="w-full sm:w-auto"
              disabled={!profile || profile.permission_lvl < 10}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Neuer Benutzer</span>
              <span className="sm:hidden">Neu</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        <Tabs defaultValue="users" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Benutzerverwaltung
            </TabsTrigger>
            <TabsTrigger value="permissions" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Berechtigungen
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <div className="space-y-4 sm:space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <Card>
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center gap-2 sm:gap-4">
                  <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg">
                    <Users className="h-4 w-4 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Gesamt</p>
                    <p className="text-lg sm:text-2xl font-bold">{users.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center gap-2 sm:gap-4">
                  <div className="p-1.5 sm:p-2 bg-blue-100 rounded-lg">
                    <Users className="h-4 w-4 sm:h-6 sm:w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Schulleitung</p>
                    <p className="text-lg sm:text-2xl font-bold">{users.filter(u => u.permission_lvl >= 10).length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center gap-2 sm:gap-4">
                  <div className="p-1.5 sm:p-2 bg-green-100 rounded-lg">
                    <Users className="h-4 w-4 sm:h-6 sm:w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Lehrkräfte</p>
                    <p className="text-lg sm:text-2xl font-bold">{users.filter(u => u.permission_lvl >= 5 && u.permission_lvl < 10 && u.permission_lvl !== 6).length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center gap-2 sm:gap-4">
                  <div className="p-1.5 sm:p-2 bg-purple-100 rounded-lg">
                    <Users className="h-4 w-4 sm:h-6 sm:w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Bibliothekar/innen</p>
                    <p className="text-lg sm:text-2xl font-bold">{users.filter(u => u.permission_lvl === 6).length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center gap-2 sm:gap-4">
                  <div className="p-1.5 sm:p-2 bg-orange-100 rounded-lg">
                    <Users className="h-4 w-4 sm:h-6 sm:w-6 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Schüler</p>
                    <p className="text-lg sm:text-2xl font-bold">{users.filter(u => u.permission_lvl < 5).length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Users Table */}
          <Card>
            <CardHeader>
              <CardTitle>Alle Benutzer</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                       <th className="text-left p-4 font-semibold">Benutzername</th>
                       <th className="text-left p-4 font-semibold">Name</th>
                       <th className="text-left p-4 font-semibold">Berechtigung</th>
                       <th className="text-left p-4 font-semibold">Klasse</th>
                       <th className="text-left p-4 font-semibold">Keycard</th>
                       <th className="text-left p-4 font-semibold">Level</th>
                       <th className="text-left p-4 font-semibold">Erstellt</th>
                       <th className="text-left p-4 font-semibold">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((userItem) => {
                      const badge = getPermissionBadge(userItem.permission_lvl);
                      return (
                        <tr key={userItem.id} className="border-b hover:bg-muted/50">
                          <td className="p-4 font-medium">{userItem.username}</td>
                          <td className="p-4">{userItem.name}</td>
                          <td className="p-4">
                            <Badge variant={badge.variant}>{badge.text}</Badge>
                          </td>
                           <td className="p-4">
                             {userItem.user_class ? (
                               <Badge variant="outline">{userItem.user_class}</Badge>
                             ) : (
                               <span className="text-muted-foreground">-</span>
                             )}
                           </td>
                           <td className="p-4">
                             {userItem.keycard_number ? (
                               <div className="flex items-center gap-1">
                                 <Badge variant={userItem.keycard_active ? "default" : "secondary"}>
                                   {userItem.keycard_number}
                                 </Badge>
                                 {!userItem.keycard_active && (
                                   <span className="text-xs text-muted-foreground">(inaktiv)</span>
                                 )}
                               </div>
                             ) : (
                               <span className="text-muted-foreground">-</span>
                             )}
                           </td>
                           <td className="p-4">{userItem.permission_lvl}</td>
                          <td className="p-4 text-muted-foreground">
                            {formatDate(userItem.created_at)}
                          </td>
                          <td className="p-4">
<div className="flex gap-1 sm:gap-2">
  <Button 
    variant="ghost" 
    size="sm"
    onClick={() => handleEditUser(userItem)}
    title="Benutzer bearbeiten"
    className="h-8 w-8 p-0"
                    disabled={!profile || profile.permission_lvl < 10}
  >
    <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
  </Button>
  <Button 
    variant="ghost" 
    size="sm" 
    className="text-destructive h-8 w-8 p-0" 
    title="Benutzer löschen" 
    onClick={() => requestDeleteUser(userItem)}
    disabled={!profile || profile.permission_lvl < 10}
  >
    <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
  </Button>
</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {users.length === 0 && (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Keine Benutzer gefunden.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="permissions">
        <PermissionManager />
      </TabsContent>
    </Tabs>
  </main>

      <CreateUserModal 
        isOpen={showCreateModal}
        onClose={handleUserCreated}
      />

{selectedUser && (
  <EditUserModal
    isOpen={showEditModal}
    onClose={handleEditModalClose}
    user={selectedUser}
  />
)}

{/* Double confirmation dialogs for safe deletion */}
<AlertDialog open={confirmDeleteOpen1} onOpenChange={setConfirmDeleteOpen1}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Benutzer wirklich löschen?</AlertDialogTitle>
      <AlertDialogDescription>
        Diese Aktion kann nicht rückgängig gemacht werden. Möchten Sie fortfahren?
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
      <AlertDialogAction onClick={handleConfirmStep1}>Ja, weiter</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>

<AlertDialog open={confirmDeleteOpen2} onOpenChange={setConfirmDeleteOpen2}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Letzte Bestätigung</AlertDialogTitle>
      <AlertDialogDescription>
        Bitte bestätigen Sie erneut, dass {selectedUser?.name} endgültig gelöscht werden soll.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
      <AlertDialogAction onClick={handleDeleteUser} disabled={deleting}>
        {deleting ? 'Löschen...' : 'Ja, endgültig löschen'}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
    </div>
  );
};

export default UserManagement;