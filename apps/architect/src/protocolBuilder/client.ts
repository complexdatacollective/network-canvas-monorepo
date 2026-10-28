import type { ManagedRuntime } from 'effect';

import { makeRpcAdapter } from '@codaco/effect-query/adapter';
import type { RpcAdapter } from '@codaco/effect-query/types';
import type { ProtocolBuilderRpcs } from '@codaco/protocol-builder-core/contract';

import type { ArchitectStore } from './architectStore.ts';
import { ArchitectHostClient, makeArchitectHostRuntime } from './runtime.ts';

export type ArchitectClient = Readonly<{
  adapter: RpcAdapter<ProtocolBuilderRpcs>;
  runtime: ManagedRuntime.ManagedRuntime<ArchitectHostClient, never>;
  /**
   * Changes the label a lock holder in another tab is reported under. The
   * handlers read it when they report one, so a change of language needs no
   * new client.
   */
  setOtherTabName: (name: string) => void;
}>;

export function createArchitectClient(
  store: ArchitectStore,
  otherTabName: string,
): ArchitectClient {
  let currentOtherTabName = otherTabName;
  const runtime = makeArchitectHostRuntime(store, () => currentOtherTabName);
  return {
    adapter: makeRpcAdapter({ runtime, client: ArchitectHostClient }),
    runtime,
    setOtherTabName: (name) => {
      currentOtherTabName = name;
    },
  };
}
