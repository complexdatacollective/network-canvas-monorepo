'use client';

import { createContext, type ReactNode, useContext } from 'react';

import type { FieldSlotController } from './types';

const FieldControllerContext = createContext<FieldSlotController | null>(null);

/**
 * Access the controller for the enclosing Field from a control rendered in one
 * of its slots. Returns `null` when used outside a Field (e.g. a field
 * component rendered standalone), so function slots can no-op gracefully.
 */
export function useFieldController(): FieldSlotController | null {
  return useContext(FieldControllerContext);
}

export function FieldControllerProvider({
  controller,
  children,
}: {
  controller: FieldSlotController;
  children: ReactNode;
}) {
  return (
    <FieldControllerContext.Provider value={controller}>
      {children}
    </FieldControllerContext.Provider>
  );
}
