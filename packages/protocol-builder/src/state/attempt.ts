import { Schema } from 'effect';
import type { RpcClientError } from 'effect/unstable/rpc/RpcClientError';

import type { ErrorOf, PayloadOf, SuccessOf } from '@codaco/effect-query/types';
import {
  ProtocolBuilderGroup,
  type ProtocolBuilderRpcs,
  type ProtocolBuilderTag,
} from '@codaco/protocol-builder-core/contract';
import type { HostUnauthorized } from '@codaco/protocol-builder-core/contract/session';

import type { ProtocolBuilderAdapter } from './context.ts';

/**
 * What a host can answer a procedure with instead of its result: the errors the
 * procedure itself declares. A transport failure is not one — the host never
 * answered — and neither is the session middleware's `HostUnauthorized`, which
 * every caller here treats as a call that reached no answer, as it did when a
 * host's `UNAUTHORIZED` was not part of the contract.
 */
export type Refusal<Tag extends ProtocolBuilderTag> =
  Tag extends ProtocolBuilderTag
    ? Exclude<
        ErrorOf<ProtocolBuilderRpcs, Tag>,
        RpcClientError | HostUnauthorized
      >
    : never;

type Attempt<Tag extends ProtocolBuilderTag> =
  | Readonly<{
      isSuccess: true;
      data: SuccessOf<ProtocolBuilderRpcs, Tag>;
      refusal: undefined;
    }>
  | Readonly<{
      isSuccess: false;
      data: undefined;
      /** Absent when the call never reached an answer. */
      refusal: Refusal<Tag> | undefined;
    }>;

const refusalChecks = new Map<string, (error: unknown) => boolean>();

function refusalCheck(tag: ProtocolBuilderTag): (error: unknown) => boolean {
  const cached = refusalChecks.get(tag);
  if (cached !== undefined) return cached;
  const rpc = ProtocolBuilderGroup.requests.get(tag);
  const check = rpc === undefined ? () => false : Schema.is(rpc.errorSchema);
  refusalChecks.set(tag, check);
  return check;
}

/**
 * Whether `error` is one of the refusals the group declares for `tag`, read
 * from the group itself so a refusal added there is recognised here.
 */
export function isRefusalOf<Tag extends ProtocolBuilderTag>(
  tag: Tag,
  error: unknown,
): error is Refusal<Tag> {
  return refusalCheck(tag)(error);
}

/**
 * Calls a procedure and answers with its result or its refusal, never a
 * rejection: every caller here decides for itself what an unanswered call
 * means, and a bare rejection from a best-effort call would go unhandled.
 */
export async function attempt<Tag extends ProtocolBuilderTag>(
  adapter: ProtocolBuilderAdapter,
  tag: Tag,
  payload: PayloadOf<ProtocolBuilderRpcs, Tag>,
): Promise<Attempt<Tag>> {
  try {
    const data = await adapter.rpcCall(tag, payload);
    return { isSuccess: true, data, refusal: undefined };
  } catch (error: unknown) {
    return {
      isSuccess: false,
      data: undefined,
      refusal: isRefusalOf(tag, error) ? error : undefined,
    };
  }
}
