'use client';

import { createContext, type ReactNode, useContext } from 'react';

const FieldsDisabledContext = createContext(false);

type FieldsDisabledProps = {
  disabled: boolean;
  children?: ReactNode;
};

/**
 * Marks every field inside it unavailable.
 *
 * Being unable to edit is a property of the whole form — the record is
 * somebody else's to change, the account is read-only — rather than of one
 * control, so it is said once here instead of by every field remembering to
 * ask. A field that disables itself still does; this only ever adds.
 */
export function FieldsDisabled({ disabled, children }: FieldsDisabledProps) {
  const enclosing = useContext(FieldsDisabledContext);
  return (
    <FieldsDisabledContext value={disabled || enclosing}>
      {children}
    </FieldsDisabledContext>
  );
}

export const useFieldsDisabled = (): boolean =>
  useContext(FieldsDisabledContext);
