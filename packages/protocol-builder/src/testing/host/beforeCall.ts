import type { PayloadOf } from '@codaco/effect-query/types';
import type {
  ProtocolBuilderRpcs,
  ProtocolBuilderTag,
} from '@codaco/protocol-builder-core/contract';

import type { ProtocolBuilderAdapter } from '../../state/context.ts';

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
