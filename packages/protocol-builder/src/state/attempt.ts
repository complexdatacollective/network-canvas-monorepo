import { Schema } from 'effect';
import type { RpcClientError } from 'effect/rpc/RpcClientError';

import type { ErrorOf, PayloadOf, SuccessOf } from '@codaco/effect-query/types';
import {
  ProtocolBuilderGroup,
  type ProtocolBuilderRpcs,
  type ProtocolBuilderTag,
} from '@codaco/protocol-builder-core/contract';
import type { HostUnauthorized } from '@codaco/protocol-builder-core/contract/session';

import type { ProtocolBuilderAdapter } from './context.ts';

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
