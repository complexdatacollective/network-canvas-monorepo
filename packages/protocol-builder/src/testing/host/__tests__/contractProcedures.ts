import { Predicate } from 'effect';

import { ProtocolBuilderGroup } from '@codaco/protocol-builder-core/contract';

export function procedureTags(): string[] {
  return [...ProtocolBuilderGroup.requests.keys()];
}

export function keyedProcedures(): string[] {
  return Array.from(ProtocolBuilderGroup.requests.values())
    .filter(
      (rpc) =>
        Predicate.hasProperty(rpc.payloadSchema, 'fields') &&
        Predicate.hasProperty(rpc.payloadSchema.fields, 'requestId'),
    )
    .map((rpc) => rpc._tag);
}
