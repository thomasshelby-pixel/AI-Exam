import { useState, useEffect, useCallback } from 'react';

export interface NetworkStatus {
  isOnline: boolean;
  isOffline: boolean;
  wasOffline: boolean;
  isChecking: boolean;
  checkConnection: () => Promise<boolean>;
  resetWasOffline: () => void;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [wasOffline, setWasOffline] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    setIsChecking(true);
    try {
      // Use lightweight cache-busted ping to verify actual internet reachability
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch('/favicon.svg?ping=' + Date.now(), {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const online = res.ok || res.status === 304 || res.status === 200;
      setIsOnline(online);
      if (!online) {
        setWasOffline(true);
      }
      return online;
    } catch {
      setIsOnline(false);
      setWasOffline(true);
      return false;
    } finally {
      setIsChecking(false);
    }
  }, []);

  const resetWasOffline = useCallback(() => {
    setWasOffline(false);
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Verify with an actual ping to be confident
      checkConnection().then((reallyOnline) => {
        if (reallyOnline) {
          setIsOnline(true);
        }
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkConnection]);

  return {
    isOnline,
    isOffline: !isOnline,
    wasOffline,
    isChecking,
    checkConnection,
    resetWasOffline,
  };
}
