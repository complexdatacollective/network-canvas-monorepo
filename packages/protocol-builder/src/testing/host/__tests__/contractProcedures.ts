import { Predicate } from 'effect';

import { ProtocolBuilderGroup } from '@codaco/protocol-builder-core/contract';

/** Every procedure in the contract, by tag. */
export function procedureTags(): string[] {
  return [...ProtocolBuilderGroup.requests.keys()];
}

/**
 * The procedures whose payload carries an idempotency key, read off the
 * contract rather than listed: a procedure that gains one and is not
 * enumerated against a retry escapes the check entirely.
 */
export function keyedProcedures(): string[] {
  return Array.from(ProtocolBuilderGroup.requests.values())
    .filter(
      (rpc) =>
        Predicate.hasProperty(rpc.payloadSchema, 'fields') &&
        Predicate.hasProperty(rpc.payloadSchema.fields, 'requestId'),
    )
    .map((rpc) => rpc._tag);
}
