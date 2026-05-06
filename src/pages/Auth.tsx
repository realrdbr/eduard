import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { Loader2, School, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import ChangePasswordModal from '@/components/ChangePasswordModal';

// === Brute-Force Client-Side Lockout ===
// Auch wenn die serverseitige RPC `verify_user_login_secure` Sperren erkennt,
// erzwingen wir hier zusätzlich eine harte clientseitige Sperre, damit nach
// X Fehlversuchen NICHTS mehr eingegeben oder abgeschickt werden kann.
const LOCKOUT_KEY = 'eduard_auth_lockout';      // Timestamp (ms) bis wann gesperrt
const ATTEMPTS_KEY = 'eduard_auth_attempts';    // Anzahl Fehlversuche im aktuellen Fenster
const ATTEMPTS_WINDOW_KEY = 'eduard_auth_attempts_window'; // Start des Versuchsfensters
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 Minuten
const ATTEMPTS_WINDOW_MS = 15 * 60 * 1000;  // Fehlversuche zählen 15 min lang

const readLockoutUntil = (): number => {
  const v = localStorage.getItem(LOCKOUT_KEY);
  if (!v) return 0;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
};

const setLockout = (untilMs: number) => {
  localStorage.setItem(LOCKOUT_KEY, String(untilMs));
};

const clearLockoutAndAttempts = () => {
  localStorage.removeItem(LOCKOUT_KEY);
  localStorage.removeItem(ATTEMPTS_KEY);
  localStorage.removeItem(ATTEMPTS_WINDOW_KEY);
};

const recordFailedAttempt = (): { attempts: number; lockedUntil: number } => {
  const now = Date.now();
  const windowStart = parseInt(localStorage.getItem(ATTEMPTS_WINDOW_KEY) || '0', 10);
  let attempts = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0', 10);

  if (!windowStart || now - windowStart > ATTEMPTS_WINDOW_MS) {
    // Neues Versuchsfenster
    localStorage.setItem(ATTEMPTS_WINDOW_KEY, String(now));
    attempts = 0;
  }

  attempts += 1;
  localStorage.setItem(ATTEMPTS_KEY, String(attempts));

  let lockedUntil = 0;
  if (attempts >= MAX_ATTEMPTS) {
    lockedUntil = now + LOCKOUT_DURATION_MS;
    setLockout(lockedUntil);
  }
  return { attempts, lockedUntil };
};

const formatRemaining = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
};

const Auth = () => {
  const navigate = useNavigate();
  const { signInWithUsername, user, loading, profile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });

  // Lockout-State
  const [lockedUntil, setLockedUntil] = useState<number>(() => readLockoutUntil());
  const [now, setNow] = useState<number>(Date.now());

  const isLocked = lockedUntil > now;
  const remainingMs = isLocked ? lockedUntil - now : 0;

  // Tick jede Sekunde solange gesperrt
  useEffect(() => {
    if (!isLocked) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLocked]);

  // Re-sync wenn anderer Tab Lockout setzt
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOCKOUT_KEY) {
        setLockedUntil(readLockoutUntil());
        setNow(Date.now());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Wenn Lockout abgelaufen → Felder wieder freigeben & Daten löschen
  useEffect(() => {
    if (lockedUntil && lockedUntil <= now) {
      clearLockoutAndAttempts();
      setLockedUntil(0);
    }
  }, [lockedUntil, now]);

  useEffect(() => {
    if (user && !loading) {
      if (profile?.must_change_password) {
        setShowChangePassword(true);
      } else {
        localStorage.removeItem('eduard_last_route');
        navigate('/', { replace: true });
      }
    }
  }, [user, loading, profile, navigate]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) return; // Eingabe während Sperre verhindern
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    // Harte Client-Sperre: Login wird gar nicht erst versucht
    if (isLocked) {
      toast({
        variant: "destructive",
        title: "Anmeldung gesperrt",
        description: `Zu viele Fehlversuche. Bitte warte noch ${formatRemaining(remainingMs)} Minuten.`
      });
      return;
    }

    if (!formData.username || !formData.password) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Bitte füllen Sie alle Felder aus."
      });
      return;
    }

    setIsLoading(true);
    const { error, mustChangePassword } = await signInWithUsername(formData.username, formData.password);

    if (error) {
      // Fehlversuch zählen + ggf. sperren
      const { attempts, lockedUntil: newLock } = recordFailedAttempt();

      if (newLock) {
        setLockedUntil(newLock);
        setNow(Date.now());
        // Eingaben löschen, Felder werden disabled
        setFormData({ username: '', password: '' });
        toast({
          variant: "destructive",
          title: "Anmeldung gesperrt",
          description: `Zu viele Fehlversuche. Anmeldung für 15 Minuten gesperrt.`
        });
      } else {
        const left = MAX_ATTEMPTS - attempts;
        toast({
          variant: "destructive",
          title: "Anmeldung fehlgeschlagen",
          description: `${error.message}${left > 0 ? ` — Noch ${left} Versuch${left === 1 ? '' : 'e'} übrig.` : ''}`
        });
      }
    } else {
      // Erfolgreicher Login → Zähler zurücksetzen
      clearLockoutAndAttempts();

      if (mustChangePassword) {
        setShowChangePassword(true);
        toast({
          title: "Passwort ändern erforderlich",
          description: "Sie müssen Ihr Passwort bei der ersten Anmeldung ändern."
        });
      } else {
        toast({
          title: "Erfolgreich angemeldet",
          description: "Willkommen zurück!"
        });
        localStorage.removeItem('eduard_last_route');
        navigate('/', { replace: true });
      }
    }
    setIsLoading(false);
  };

  const handlePasswordChanged = () => {
    setShowChangePassword(false);
    localStorage.removeItem('eduard_last_route');
    navigate('/', { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const inputsDisabled = isLocked || isLoading;

  return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-secondary/5 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-primary rounded-full flex items-center justify-center">
              <School className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold">E.D.U.A.R.D.</CardTitle>
            <CardDescription>
              Education, Data, Utility & Automation for Resource Distribution
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLocked && (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-4 flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <ShieldAlert className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">Anmeldung gesperrt</p>
                  <p>
                    Zu viele Fehlversuche. Bitte versuche es in{' '}
                    <span className="font-mono font-bold">{formatRemaining(remainingMs)}</span> Minuten erneut.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSignIn} className="space-y-4">
              <fieldset disabled={inputsDisabled} className="space-y-4 disabled:opacity-60">
                <div className="space-y-2">
                  <Label htmlFor="username">Benutzername</Label>
                  <Input
                    id="username"
                    name="username"
                    type="text"
                    placeholder="max.mustermann"
                    value={formData.username}
                    onChange={handleInputChange}
                    required
                    readOnly={isLocked}
                    aria-disabled={isLocked}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Passwort</Label>
                  <div className="flex items-center">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={handleInputChange}
                      required
                      autoComplete="current-password"
                      readOnly={isLocked}
                      aria-disabled={isLocked}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
                      onClick={() => setShowPassword((v) => !v)}
                      className="ml-2"
                      disabled={isLocked}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={inputsDisabled}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLocked ? `Gesperrt (${formatRemaining(remainingMs)})` : 'Anmelden'}
                </Button>
              </fieldset>
            </form>
          </CardContent>
        </Card>
      </div>

      <ChangePasswordModal
        isOpen={showChangePassword}
        onClose={handlePasswordChanged}
        isFirstLogin={true}
      />
    </>
  );
};

export default Auth;
