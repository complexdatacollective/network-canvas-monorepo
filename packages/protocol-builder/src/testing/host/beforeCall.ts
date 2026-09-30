import type { PayloadOf } from '@codaco/effect-query/types';
import type {
  ProtocolBuilderRpcs,
  ProtocolBuilderTag,
} from '@codaco/protocol-builder-core/contract';

import type { ProtocolBuilderAdapter } from '../../state/context.ts';

/**
 * The adapter with `wait` run ahead of every direct call, so a test can hold
 * one on its way to the host. The call is the host's own once it goes.
 *
 * Between the editor and the host rather than inside it: an in-memory host
 * answers in a microtask, so a request that is still in flight is something
 * only the transport can be.
 */
export function beforeCall(
  adapter: ProtocolBuilderAdapter,
  wait: (tag: ProtocolBuilderTag) => Promise<void> | undefined,
): ProtocolBuilderAdapter {
  return {
    ...adapter,
    rpcCall: async <Tag extends ProtocolBuilderTag>(
      tag: Tag,
      payload: PayloadOf<ProtocolBuilderRpcs, Tag>,
    ) => {
      await wait(tag);
      return adapter.rpcCall(tag, payload);
    },
  };
}
