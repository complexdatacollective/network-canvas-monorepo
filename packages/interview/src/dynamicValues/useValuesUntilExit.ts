'use client';

import { useCallback, useState } from 'react';

import type { DynamicValueRole } from '@codaco/protocol-validation';

import type { DynamicValueEntities } from './DynamicValueScope';

const sameRoles = <T>(
  a: Readonly<Partial<Record<DynamicValueRole, T>>> | undefined,
  b: Readonly<Partial<Record<DynamicValueRole, T>>> | undefined,
) => {
  const roles = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  return [...roles].every(
    (role) => a?.[role as DynamicValueRole] === b?.[role as DynamicValueRole],
  );
};

const sameEntities = (a: DynamicValueEntities, b: DynamicValueEntities) =>
  sameRoles(a.attributes, b.attributes) && sameRoles(a.labels, b.labels);

/**
 * Values for text about what a keyed transition shows. When the key changes,
 * the outgoing content stays on screen until its exit animation finishes, so
 * text naming it (a census prompt naming the pair) keeps the outgoing values
 * until then. Pass `onExitComplete` to the transition's `AnimatePresence`.
 * An undefined key means nothing is on screen, so the first content to appear
 * is named at once: no exit precedes it.
 */
export function useValuesUntilExit<T extends DynamicValueEntities>(
  key: string | undefined,
  values: T,
): Readonly<{ values: T; onExitComplete: () => void }> {
  const [settled, setSettled] = useState({ key, values });
  const current = settled.key === key || settled.key === undefined;
  // While the key holds, keep the values it last showed, such as a label that
  // decrypted after it appeared, so outgoing text names what was on screen.
  if (
    current &&
    (settled.key !== key || !sameEntities(settled.values, values))
  ) {
    setSettled({ key, values });
  }
  const onExitComplete = useCallback(
    () => setSettled({ key, values }),
    [key, values],
  );
  return {
    values: current ? values : settled.values,
    onExitComplete,
  };
}
