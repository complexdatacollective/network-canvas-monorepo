import { createContext, useContext } from 'react';

import type { RpcAdapter } from '@codaco/effect-query/types';
import type { ProtocolBuilderRpcs } from '@codaco/protocol-builder-core/contract';
import type { Presence } from '@codaco/protocol-builder-core/contract/schemas';
import type { ProtocolSectionId } from '@codaco/studio-sync/taxonomy';

export type ProtocolBuilderAdapter = RpcAdapter<ProtocolBuilderRpcs>;

export type ProtocolBuilderContextValue = Readonly<{
  adapter: ProtocolBuilderAdapter;
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

/**
 * Whether there is a protocol host above this component at all.
 *
 * The one question about this context with an answer outside a
 * `ProtocolBuilder`, and the reason it needs one: a control that offers to
 * WRITE to the protocol beside the value it displays — the attribute pill's
 * rename — has nothing to write to where there is no protocol, so it is drawn
 * as the statement it otherwise is. Asking that must not be the thing that
 * throws.
 */
export function useHasProtocolBuilderHost(): boolean {
  return useContext(ProtocolBuilderContext) !== undefined;
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
