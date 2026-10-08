import type { ManagedRuntime } from 'effect';

import { makeRpcAdapter } from '@codaco/effect-query/adapter';
import type { RpcAdapter } from '@codaco/effect-query/types';
import type { ProtocolBuilderRpcs } from '@codaco/protocol-builder-core/contract';

import type { ArchitectStore } from './architectStore.ts';
import { ArchitectHostClient, makeArchitectHostRuntime } from './runtime.ts';

export type ArchitectClient = Readonly<{
  adapter: RpcAdapter<ProtocolBuilderRpcs>;
  runtime: ManagedRuntime.ManagedRuntime<ArchitectHostClient, never>;
}>;

export function createArchitectClient(
  store: ArchitectStore,
  otherTabName: () => string,
): ArchitectClient {
  const runtime = makeArchitectHostRuntime(store, otherTabName);
  return {
    adapter: makeRpcAdapter({ runtime, client: ArchitectHostClient }),
    runtime,
  };
}
