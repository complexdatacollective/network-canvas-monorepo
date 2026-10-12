'use client';

import { createContext, type ReactNode, useContext, useMemo } from 'react';

type WritesSettled = () => Promise<boolean> | undefined;
type TrackWrite = (stored: Promise<boolean>) => void;

type WritesInFlight = {
  writesSettled: WritesSettled;
  trackWrite: TrackWrite;
};

// Components rendered outside a provider (Storybook, unit tests) have no
// writes tracked, so the default reports none under way.
const noWrites: WritesInFlight = {
  writesSettled: () => undefined,
  trackWrite: () => undefined,
};

const WritesInFlightContext = createContext<WritesInFlight>(noWrites);

export function WritesInFlightProvider({
  writesSettled,
  trackWrite,
  children,
}: WritesInFlight & { children: ReactNode }) {
  const value = useMemo(
    () => ({ writesSettled, trackWrite }),
    [writesSettled, trackWrite],
  );
  return (
    <WritesInFlightContext.Provider value={value}>
      {children}
    </WritesInFlightContext.Provider>
  );
}

/**
 * Returns a function that resolves once every session write begun so far has
 * been stored or refused, with whether all of them were stored, or returns
 * undefined when none is under way.
 */
export function useWritesSettled(): WritesSettled {
  return useContext(WritesInFlightContext).writesSettled;
}

/**
 * Returns a function that counts a write asked for, but still waiting its turn
 * to be dispatched, as under way until the promise it is given settles, and as
 * stored only if that promise resolves true.
 */
export function useTrackWrite(): TrackWrite {
  return useContext(WritesInFlightContext).trackWrite;
}
