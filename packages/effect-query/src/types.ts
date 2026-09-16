import type {
  InfiniteData,
  QueryKey,
  UseInfiniteQueryOptions,
  UseMutationOptions,
  UseQueryOptions,
} from '@tanstack/react-query';
import type { Rpc, RpcClientError } from 'effect/unstable/rpc';

type RpcFor<Rpcs extends Rpc.Any, Tag extends Rpcs['_tag']> = Rpc.ExtractTag<
  Rpcs,
  Tag
>;

/** What a caller passes as the payload of `Tag` — the payload schema's constructor input. */
export type PayloadOf<
  Rpcs extends Rpc.Any,
  Tag extends Rpcs['_tag'],
> = Rpc.PayloadConstructor<RpcFor<Rpcs, Tag>>;

/** The decoded success of `Tag`. For a streaming rpc this is the `Stream` itself, not its elements. */
export type SuccessOf<
  Rpcs extends Rpc.Any,
  Tag extends Rpcs['_tag'],
> = Rpc.Success<RpcFor<Rpcs, Tag>>;

/** One element of a streaming rpc's response. `never` for a non-streaming rpc. */
export type ChunkOf<
  Rpcs extends Rpc.Any,
  Tag extends Rpcs['_tag'],
> = Rpc.SuccessChunk<RpcFor<Rpcs, Tag>>;

/**
 * Everything a call to `Tag` can fail with: the rpc's own errors, its middleware's
 * errors (`Rpc.Error` already unions those in), and the transport's own failures.
 */
export type ErrorOf<Rpcs extends Rpc.Any, Tag extends Rpcs['_tag']> =
  | Rpc.Error<RpcFor<Rpcs, Tag>>
  | RpcClientError.RpcClientError;

export type StreamState<E> = {
  readonly status: 'idle' | 'streaming' | 'done' | 'failed';
  readonly error: E | undefined;
};

export type RpcQueryOptions = {
  readonly enabled?: boolean;
  readonly staleTime?: number;
};

export type RpcInfiniteQueryOptions<Page, Cursor> = RpcQueryOptions & {
  readonly getNextCursor: (page: Page) => Cursor | undefined;
};

/**
 * The per-app binding of TanStack Query to one `RpcGroup`. Every member is typed
 * from the group alone, so `useQuery(rpcQuery('GetUser', { id }))` hands back the
 * rpc's own decoded success and its own error instances.
 */
export type RpcAdapter<Rpcs extends Rpc.Any> = {
  readonly rpcKey: <Tag extends Rpcs['_tag']>(
    tag: Tag,
    payload?: PayloadOf<Rpcs, Tag>,
  ) => QueryKey;

  readonly rpcCall: <Tag extends Rpcs['_tag']>(
    tag: Tag,
    payload: PayloadOf<Rpcs, Tag>,
  ) => Promise<SuccessOf<Rpcs, Tag>>;

  readonly rpcQuery: <Tag extends Rpcs['_tag']>(
    tag: Tag,
    payload: PayloadOf<Rpcs, Tag>,
    options?: RpcQueryOptions,
  ) => UseQueryOptions<
    SuccessOf<Rpcs, Tag>,
    ErrorOf<Rpcs, Tag>,
    SuccessOf<Rpcs, Tag>
  >;

  readonly rpcInfiniteQuery: <Tag extends Rpcs['_tag'], Cursor>(
    tag: Tag,
    payload: Omit<PayloadOf<Rpcs, Tag>, 'cursor'>,
    options: RpcInfiniteQueryOptions<SuccessOf<Rpcs, Tag>, Cursor>,
  ) => UseInfiniteQueryOptions<
    SuccessOf<Rpcs, Tag>,
    ErrorOf<Rpcs, Tag>,
    InfiniteData<SuccessOf<Rpcs, Tag>, Cursor | undefined>,
    QueryKey,
    Cursor | undefined
  >;

  readonly rpcMutation: <Tag extends Rpcs['_tag']>(
    tag: Tag,
  ) => UseMutationOptions<
    SuccessOf<Rpcs, Tag>,
    ErrorOf<Rpcs, Tag>,
    PayloadOf<Rpcs, Tag>
  >;

  readonly useRpcStream: <Tag extends Rpcs['_tag']>(
    tag: Tag,
    payload: PayloadOf<Rpcs, Tag>,
    onChunk: (chunk: ChunkOf<Rpcs, Tag>) => void,
    options?: { readonly enabled?: boolean },
  ) => StreamState<ErrorOf<Rpcs, Tag>>;
};
