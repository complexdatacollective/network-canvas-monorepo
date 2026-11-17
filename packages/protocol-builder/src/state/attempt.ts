import { Schema } from 'effect';
import type { Rpc } from 'effect/rpc';

import type { ErrorOf, PayloadOf, SuccessOf } from '@codaco/effect-query/types';
import {
  ProtocolBuilderGroup,
  type ProtocolBuilderRpcs,
  type ProtocolBuilderTag,
} from '@codaco/protocol-builder-core/contract';

import type { ProtocolBuilderAdapter } from './context.ts';

/** A refusal a call's contract declares: the host's own answer. */
export type Refusal<Tag extends ProtocolBuilderTag> =
  Tag extends ProtocolBuilderTag
    ? Rpc.ExtractTag<ProtocolBuilderRpcs, Tag>['errorSchema']['Type']
    : never;

/** What a call can fail with besides the refusals its contract declares. */
type UndeclaredFailure = Exclude<
  ErrorOf<ProtocolBuilderRpcs, ProtocolBuilderTag>,
  Refusal<ProtocolBuilderTag>
>;

/**
 * Whether each failure outside the contract's refusals is an answer, keyed by
 * every one of them, so that one added to the contract's middleware or its
 * transport does not type-check until it is placed here. A declared refusal
 * needs no entry: the host decided it, and every one is an answer.
 */
const UNDECLARED_FAILURE_ANSWERS = {
  // The host's session check turned the caller away before any handler ran.
  HostUnauthorized: true,
  // The transport failed, and took any word of what the host did with it.
  RpcClientError: false,
} as const satisfies Record<UndeclaredFailure['_tag'], boolean>;

/**
 * How a call came back: with what it did, with the host's refusal, or with no
 * word of either.
 *
 * `answered` is the one rule for whatever a caller remembers so that it can
 * ask again — the request id that has the host replay a write it already made
 * (see `useKeptRequestId`), and anything the request was worked out from: it
 * is kept only while `answered` is false. Any answer ends the request, success
 * and refusal alike, so the next one is worked out afresh from the protocol as
 * it is by then.
 */
type Attempt<Tag extends ProtocolBuilderTag> =
  | Readonly<{
      isSuccess: true;
      answered: true;
      data: SuccessOf<ProtocolBuilderRpcs, Tag>;
      refusal: undefined;
    }>
  | Readonly<{
      isSuccess: false;
      answered: boolean;
      data: undefined;
      /** Absent for a failure the call's contract does not declare. */
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

export function isRefusalOf<Tag extends ProtocolBuilderTag>(
  tag: Tag,
  error: unknown,
): error is Refusal<Tag> {
  return refusalCheck(tag)(error);
}

/**
 * Whether a call that failed with `error` was answered: by a refusal its
 * contract declares, or by a failure `UNDECLARED_FAILURE_ANSWERS` counts as
 * one. Anything else — a transport failure, or a defect on the way — leaves
 * what the host did unknown, as a lost answer does.
 */
function answeredWith(tag: ProtocolBuilderTag, error: unknown): boolean {
  if (isRefusalOf(tag, error)) return true;
  if (typeof error !== 'object' || error === null || !('_tag' in error)) {
    return false;
  }
  const { _tag } = error;
  return isUndeclaredFailure(_tag) && UNDECLARED_FAILURE_ANSWERS[_tag];
}

function isUndeclaredFailure(tag: unknown): tag is UndeclaredFailure['_tag'] {
  return (
    typeof tag === 'string' && Object.hasOwn(UNDECLARED_FAILURE_ANSWERS, tag)
  );
}

export async function attempt<Tag extends ProtocolBuilderTag>(
  adapter: ProtocolBuilderAdapter,
  tag: Tag,
  payload: PayloadOf<ProtocolBuilderRpcs, Tag>,
): Promise<Attempt<Tag>> {
  try {
    const data = await adapter.rpcCall(tag, payload);
    return { isSuccess: true, answered: true, data, refusal: undefined };
  } catch (error: unknown) {
    return {
      isSuccess: false,
      answered: answeredWith(tag, error),
      data: undefined,
      refusal: isRefusalOf(tag, error) ? error : undefined,
    };
  }
}
