import type { ManagedRuntime } from 'effect';

import { makeRpcAdapter } from '@codaco/effect-query/adapter';
import type { RpcAdapter } from '@codaco/effect-query/types';
import type { ProtocolBuilderRpcs } from '@codaco/protocol-builder-core/contract';
import type { ResourcePromotion } from '@codaco/protocol-builder/state/hooks';

import type { ArchitectStore } from './architectStore.ts';
import { ResourceBridge } from './resourceBridge.ts';
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
  /**
   * Hands an edit's imports over to the protocol, for an editor that saves
   * through Redux rather than through a `Submit` carrying the promotion.
   * Architect's `stage` has already written the asset, so this only stops the
   * edit's discard from taking it back. Answers whether every resource named
   * was the edit's to hand over.
   */
  adoptStagedResources: (promotion: ResourcePromotion) => boolean;
}>;

export function createArchitectClient(
  store: ArchitectStore,
  otherTabName: string,
): ArchitectClient {
  let currentOtherTabName = otherTabName;
  const resources = new ResourceBridge(store);
  const runtime = makeArchitectHostRuntime(
    store,
    () => currentOtherTabName,
    resources,
  );
  return {
    adapter: makeRpcAdapter({ runtime, client: ArchitectHostClient }),
    runtime,
    setOtherTabName: (name) => {
      currentOtherTabName = name;
    },
    adoptStagedResources: ({ editId, resourceIds }) => {
      const planned = resources.planPromotion(editId, resourceIds);
      if (planned.status === 'failed') return false;
      resources.completePromotion(planned.data.ids);
      return true;
    },
  };
}
