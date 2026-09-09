import { type createTanstackQueryUtils } from '@orpc/tanstack-query';
import { createContext, useContext } from 'react';

import type { ProtocolSectionId } from '@codaco/studio-sync/taxonomy';

import type { ProtocolBuilderClient } from '../contract/contract.ts';
import type { Presence } from '../contract/schemas.ts';

export type ProtocolQueryUtils = ReturnType<
  typeof createTanstackQueryUtils<ProtocolBuilderClient>
>;

export type ProtocolBuilderContextValue = Readonly<{
  client: ProtocolBuilderClient;
  utils: ProtocolQueryUtils;
  protocolId: string;
}>;

const ProtocolBuilderContext = createContext<
  ProtocolBuilderContextValue | undefined
>(undefined);

export const ProtocolBuilderProvider = ProtocolBuilderContext.Provider;

export function useProtocolBuilderContext(): ProtocolBuilderContextValue {
  const value = useContext(ProtocolBuilderContext);
  if (value === undefined) {
    throw new Error('a protocol-builder hook was used outside ProtocolBuilder');
  }
  return value;
}

/** Cache entry for who holds one section's lock; empty when nobody is known to. */
export type LockState = Readonly<{ holder?: Presence }>;

export function lockQueryKey(
  protocolId: string,
  sectionId: ProtocolSectionId,
): readonly unknown[] {
  return ['protocol-builder', protocolId, 'lock', sectionId];
}

export function presenceQueryKey(protocolId: string): readonly unknown[] {
  return ['protocol-builder', protocolId, 'presence'];
}
