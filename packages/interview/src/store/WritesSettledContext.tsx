'use client';

import { createContext, type ReactNode, useContext } from 'react';

type WritesSettled = () => Promise<boolean> | undefined;

// Components rendered outside a provider (Storybook, unit tests) have no
// writes tracked, so the default reports none under way.
const noWrites: WritesSettled = () => undefined;

const WritesSettledContext = createContext<WritesSettled>(noWrites);

export function WritesSettledProvider({
  writesSettled,
  children,
}: {
  writesSettled: WritesSettled;
  children: ReactNode;
}) {
  return (
    <WritesSettledContext.Provider value={writesSettled}>
      {children}
    </WritesSettledContext.Provider>
  );
}

/**
 * Returns a function that resolves once every session write begun so far has
 * been stored or refused, with whether all of them were stored, or returns
 * undefined when none is under way.
 */
export function useWritesSettled(): WritesSettled {
  return useContext(WritesSettledContext);
}
