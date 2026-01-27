import { createContext, useContext, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface TimeoutContextType {
  withTimeout: <T>(promise: Promise<T>, timeoutMs?: number) => Promise<T>;
}

const TimeoutContext = createContext<TimeoutContextType | undefined>(undefined);

export const TimeoutProvider = ({ children }: { children: ReactNode }) => {
  const { signOut } = useAuth();

  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs = 30000): Promise<T> => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('TIMEOUT'));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } catch (error: any) {
      if (error.message === 'TIMEOUT') {
        toast({
          variant: "destructive",
          title: "Timeout",
          description: "Die Anfrage dauerte zu lange. Sie wurden automatisch abgemeldet."
        });
        
        // Auto-logout after timeout
        setTimeout(() => {
          signOut();
        }, 2000);
        
        throw new Error('Timeout: Die Anfrage dauerte zu lange');
      }
      throw error;
    }
  };

  return (
    <TimeoutContext.Provider value={{ withTimeout }}>
      {children}
    </TimeoutContext.Provider>
  );
};

export const useTimeout = () => {
  const context = useContext(TimeoutContext);
  if (!context) {
    throw new Error('useTimeout must be used within a TimeoutProvider');
  }
  return context;
};