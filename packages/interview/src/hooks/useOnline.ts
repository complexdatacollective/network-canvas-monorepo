import { useCallback, useSyncExternalStore } from 'react';

// navigator.onLine + online/offline events. Mirrors useMediaQuery's
// useSyncExternalStore pattern; the SSR snapshot assumes online so the map
// UI is never gated on the server render.
const useOnline = (): boolean => {
  const subscribe = useCallback((callback: () => void) => {
    window.addEventListener('online', callback);
    window.addEventListener('offline', callback);
    return () => {
      window.removeEventListener('online', callback);
      window.removeEventListener('offline', callback);
    };
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
};

export default useOnline;
