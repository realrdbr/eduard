import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

const LAST_ROUTE_COOKIE = 'eduard_last_route';
const COOKIE_EXPIRES_DAYS = 30;

export const useSessionStorage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasRestoredFromReload, setHasRestoredFromReload] = useState(false);

  // Cookie helper functions
  const setCookie = (name: string, value: string, days: number) => {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Strict`;
  };

  const getCookie = (name: string): string | null => {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  };

  // Save route to both cookie and database
  const saveRoute = async (route: string) => {
    try {
      // Always save to cookie and localStorage for immediate persistence
      setCookie(LAST_ROUTE_COOKIE, route, COOKIE_EXPIRES_DAYS);
      try { localStorage.setItem(LAST_ROUTE_COOKIE, route); } catch {}
      
      // Save to database if user is logged in
      if (profile?.id) {
        const { error } = await supabase
          .from('user_sessions')
          .upsert(
            {
              user_id: profile.id,
              last_route: route,
            },
            { onConflict: 'user_id' }
          );
        
        if (error) {
          console.error('Failed to save route to database:', error);
        }
      }
    } catch (error) {
      console.error('Failed to save route:', error);
    }
  };

  // Load last route from cookie or database
  const loadLastRoute = async (): Promise<string> => {
    try {
      // First try to get from database if user is logged in
      if (profile?.id) {
        const { data, error } = await supabase
          .from('user_sessions')
          .select('last_route')
          .eq('user_id', profile.id)
          .single();
        
        if (!error && data?.last_route) {
          return data.last_route;
        }
      }

      // Fallback to localStorage then cookie
      const localRoute = localStorage.getItem(LAST_ROUTE_COOKIE);
      if (localRoute) return localRoute;
      const cookieRoute = getCookie(LAST_ROUTE_COOKIE);
      return cookieRoute || '/';
    } catch (error) {
      console.error('Failed to load last route:', error);
      const localRoute = localStorage.getItem(LAST_ROUTE_COOKIE);
      return localRoute || getCookie(LAST_ROUTE_COOKIE) || '/';
    }
  };

  // Initialize and restore last route on mount
  useEffect(() => {
    const initializeSession = async () => {
      if (!profile) return; // Wait for profile to be loaded

      const currentPath = location.pathname;
      
      // Skip restoration if this is a fresh login
      const isFreshLogin = localStorage.getItem('fresh_login') === 'true';
      if (isFreshLogin) {
        localStorage.removeItem('fresh_login');
        setIsInitialized(true);
        return;
      }
      
      // Don't restore route if we're on auth page
      if (currentPath === '/auth' || currentPath === '/login') {
        setIsInitialized(true);
        return;
      }

      try {
        // Detect real page reload/back-forward using Navigation Timing API
        const navigationEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
        const navType = navigationEntries.length > 0 ? navigationEntries[0].type : 'navigate';
        const legacyNav = (performance as any).navigation?.type;
        console.log('Session Storage: Current path:', currentPath, 'Navigation type:', navType, 'Legacy:', legacyNav);
        
        // Auto-redirect on real reloads to last visited route (not back/forward or SPA navigations)
        if (navType === 'reload' || legacyNav === 1) {
          const lastRoute = await loadLastRoute();
          console.log('Session Storage: Last route:', lastRoute);
          
          if (lastRoute && lastRoute !== currentPath) {
            // Validate that the route is accessible
            const validRoutes = [
              '/stundenplan', '/announcements', '/vertretungsplan', '/ai-chat',
              '/audio-announcements', '/document-analysis', '/user-management',
              '/klassenverwaltung', '/keycard', '/settings', '/permissions'
            ];
            
            if (validRoutes.includes(lastRoute)) {
              console.log('Session Storage: Navigating to last route after reload:', lastRoute);
              navigate(lastRoute, { replace: true });
              setHasRestoredFromReload(true);
            }
          }
        }
      } catch (error) {
        console.error('Failed to initialize session:', error);
      } finally {
        setIsInitialized(true);
      }
    };

    initializeSession();
  }, [profile]);

  // Save current route whenever it changes, but only after initialization and not immediately after restoration
  useEffect(() => {
    if (!isInitialized || !profile) return;

    const currentPath = location.pathname;
    
    // Don't save auth routes
    if (currentPath !== '/auth' && currentPath !== '/login') {
      // Don't persist the root route as last route to avoid starting on Home unintentionally
      if (currentPath === '/') {
        return;
      }
      // Skip one save right after a restoration redirect
      if (hasRestoredFromReload) {
        setHasRestoredFromReload(false);
        return;
      }

      // Add a small delay to avoid saving immediately after restoration
      const timeoutId = setTimeout(() => {
        console.log('Session Storage: Saving route:', currentPath);
        saveRoute(currentPath);
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [location.pathname, profile, isInitialized, hasRestoredFromReload]);

  return {
    isInitialized,
    saveRoute,
    loadLastRoute
  };
};