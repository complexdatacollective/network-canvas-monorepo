import { createContext, useContext, type ReactNode } from 'react';

import { useOnline as useOnlineSignal } from '@codaco/interview';

const OnlineStatusContext = createContext<boolean | null>(null);

// Subscribes once via @codaco/interview's useOnline (navigator.onLine +
// online/offline events) and republishes it through context, so consumers
// read from one shared subscription instead of each mounting their own.
export function OnlineStatusProvider({ children }: { children: ReactNode }) {
  const isOnline = useOnlineSignal();
  return (
    <OnlineStatusContext.Provider value={isOnline}>
      {children}
    </OnlineStatusContext.Provider>
  );
}

export function useOnline(): boolean {
  const value = useContext(OnlineStatusContext);
  if (value === null) {
    throw new Error('useOnline must be used within an OnlineStatusProvider');
  }
  return value;
}
