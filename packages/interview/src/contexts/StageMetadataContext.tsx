'use client';

import { createContext, type ReactNode } from 'react';

import type { RegisterBeforeNext } from '../types';

const noopRegisterBeforeNext: RegisterBeforeNext = (() => {
  // noop — safe default for non-interview pages
}) as RegisterBeforeNext;

export const StageMetadataContext = createContext<RegisterBeforeNext>(
  noopRegisterBeforeNext,
);

export function StageMetadataProvider({
  value,
  children,
}: {
  value: RegisterBeforeNext;
  children: ReactNode;
}) {
  return (
    <StageMetadataContext.Provider value={value}>
      {children}
    </StageMetadataContext.Provider>
  );
}
