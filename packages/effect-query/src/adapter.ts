import {
  hashKey,
  type InfiniteData,
  infiniteQueryOptions,
  mutationOptions,
  type QueryKey,
  queryOptions,
  type UseInfiniteQueryOptions,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import {
  Cause,
  type Context,
  Effect,
  Exit,
  Fiber,
  type ManagedRuntime,
  Option,
  Stream,
} from 'effect';
import type { Rpc, RpcClient, RpcClientError } from 'effect/unstable/rpc';
import { useEffect, useRef, useState } from 'react';

import type {
  ChunkOf,
  ErrorOf,
  PayloadOf,
  RpcAdapter,
  RpcInfiniteQueryOptions,
  RpcQueryOptions,
  StreamState,
  SuccessOf,
} from './types.ts';

/**
 * An infinite query sends the caller's payload with that page's cursor added, and the
 * first page — which has no cursor yet — sends it with no cursor key at all, so a
 * contract that declares its cursor with `Schema.optionalKey` is never handed an explicit
 * `undefined` to decode. TypeScript cannot rebuild `PayloadOf` out of
 * `Omit<PayloadOf, 'cursor'>` plus a cursor while the tag is still generic, so the funnel
 * accepts that shape beside the whole payload.
 */
type PagePayloadOf<Rpcs extends Rpc.Any, Tag extends Rpcs['_tag']> = Omit<
  PayloadOf<Rpcs, Tag>,
  'cursor'
> & { readonly cursor?: unknown };

/**
 * The flat client's return type is a conditional on the rpc's success schema, which
 * TypeScript leaves unresolved while `Tag` is generic. These two function types are the
 * resolved views of it — one for the rpcs that answer with an effect, one for the rpcs
 * that answer with a stream — and the two `as unknown as` they are used with are the
 * only casts in this package. The erasure through `unknown` is deliberate and written
 * where it happens: the conditional type and these views do not overlap for the
 * compiler, so nothing here can check them against each other. What pins them is the
 * compile-time probe in `__tests__/adapter.test.tsx` (`_flatClientShapeProbe`), which
 * assigns a real flat client's results for a concrete group to exactly these shapes.
 */
type CallAt<Rpcs extends Rpc.Any, Tag extends Rpcs['_tag']> = (
  tag: Tag,
  payload: PayloadOf<Rpcs, Tag> | PagePayloadOf<Rpcs, Tag>,
) => Effect.Effect<SuccessOf<Rpcs, Tag>, ErrorOf<Rpcs, Tag>>;

type StreamAt<Rpcs extends Rpc.Any, Tag extends Rpcs['_tag']> = (
  tag: Tag,
  payload: PayloadOf<Rpcs, Tag>,
) => Stream.Stream<ChunkOf<Rpcs, Tag>, ErrorOf<Rpcs, Tag>>;

const IDLE: StreamState<never> = { status: 'idle', error: undefined };
const STREAMING: StreamState<never> = { status: 'streaming', error: undefined };
const DONE: StreamState<never> = { status: 'done', error: undefined };

/**
 * Binds one app's rpc client to TanStack Query. `Id extends R` is what ties the client
 * key to the runtime: the key names a service the runtime can actually build.
 */
export const makeRpcAdapter = <Rpcs extends Rpc.Any, R, Id extends R>(options: {
  readonly runtime: ManagedRuntime.ManagedRuntime<R, never>;
  readonly client: Context.Key<
    Id,
    RpcClient.RpcClient.Flat<Rpcs, RpcClientError.RpcClientError>
  >;
  readonly keyPrefix?: string;
  readonly onFailure?: (error: unknown) => void;
}): RpcAdapter<Rpcs> => {
  const { client, onFailure, runtime } = options;
  const keyPrefix = options.keyPrefix ?? 'rpc';

  /**
   * Every export runs through here. An interrupt — which is how both TanStack's own
   * cancellation and an unmounted component arrive — has to reject as an abort rather
   * than as the rpc's typed error, or a cancelled query would render a failure that
   * never happened.
   */
  const call = async <Tag extends Rpcs['_tag']>(
    tag: Tag,
    payload: PayloadOf<Rpcs, Tag> | PagePayloadOf<Rpcs, Tag>,
    signal?: AbortSignal,
  ): Promise<SuccessOf<Rpcs, Tag>> => {
    const exit = await runtime.runPromiseExit(
      Effect.flatMap(client, (c) =>
        (c as unknown as CallAt<Rpcs, Tag>)(tag, payload),
      ),
      signal === undefined ? undefined : { signal },
    );
    if (Exit.isSuccess(exit)) {
      return exit.value;
    }
    if (Cause.hasInterruptsOnly(exit.cause)) {
      throw signal?.reason ?? new DOMException('Aborted', 'AbortError');
    }
    const failure = Cause.findErrorOption(exit.cause);
    if (Option.isSome(failure)) {
      onFailure?.(failure.value);
      throw failure.value;
    }
    throw new Error(Cause.pretty(exit.cause));
  };

  const rpcKey = <Tag extends Rpcs['_tag']>(
    tag: Tag,
    payload?: PayloadOf<Rpcs, Tag>,
  ): QueryKey =>
    payload === undefined ? [keyPrefix, tag] : [keyPrefix, tag, payload];

  const rpcCall = <Tag extends Rpcs['_tag']>(
    tag: Tag,
    payload: PayloadOf<Rpcs, Tag>,
  ): Promise<SuccessOf<Rpcs, Tag>> => call(tag, payload);

  const rpcQuery = <Tag extends Rpcs['_tag']>(
    tag: Tag,
    payload: PayloadOf<Rpcs, Tag>,
    queryOpts?: RpcQueryOptions,
  ): UseQueryOptions<
    SuccessOf<Rpcs, Tag>,
    ErrorOf<Rpcs, Tag>,
    SuccessOf<Rpcs, Tag>
  > =>
    queryOptions<
      SuccessOf<Rpcs, Tag>,
      ErrorOf<Rpcs, Tag>,
      SuccessOf<Rpcs, Tag>
    >({
      queryKey: rpcKey(tag, payload),
      queryFn: ({ signal }) => call(tag, payload, signal),
      enabled: queryOpts?.enabled,
      staleTime: queryOpts?.staleTime,
    });

  const rpcInfiniteQuery = <Tag extends Rpcs['_tag'], Cursor>(
    tag: Tag,
    payload: Omit<PayloadOf<Rpcs, Tag>, 'cursor'>,
    infiniteOpts: RpcInfiniteQueryOptions<SuccessOf<Rpcs, Tag>, Cursor>,
  ): UseInfiniteQueryOptions<
    SuccessOf<Rpcs, Tag>,
    ErrorOf<Rpcs, Tag>,
    InfiniteData<SuccessOf<Rpcs, Tag>, Cursor | undefined>,
    QueryKey,
    Cursor | undefined
  > => {
    const queryKey: QueryKey = [keyPrefix, tag, payload];
    return infiniteQueryOptions<
      SuccessOf<Rpcs, Tag>,
      ErrorOf<Rpcs, Tag>,
      InfiniteData<SuccessOf<Rpcs, Tag>, Cursor | undefined>,
      QueryKey,
      Cursor | undefined
    >({
      queryKey,
      queryFn: ({ pageParam, signal }) =>
        call(
          tag,
          pageParam === undefined ? payload : { ...payload, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => infiniteOpts.getNextCursor(lastPage),
      enabled: infiniteOpts.enabled,
      staleTime: infiniteOpts.staleTime,
    });
  };

  const rpcMutation = <Tag extends Rpcs['_tag']>(
    tag: Tag,
  ): UseMutationOptions<
    SuccessOf<Rpcs, Tag>,
    ErrorOf<Rpcs, Tag>,
    PayloadOf<Rpcs, Tag>
  > =>
    mutationOptions<
      SuccessOf<Rpcs, Tag>,
      ErrorOf<Rpcs, Tag>,
      PayloadOf<Rpcs, Tag>
    >({
      mutationKey: [keyPrefix, tag],
      mutationFn: (payload) => call(tag, payload),
    });

  /**
   * A hook, so it obeys the rules of hooks: the adapter is built once per app and this
   * member is called from components as `adapter.useRpcStream(...)`.
   */
  const useRpcStream = <Tag extends Rpcs['_tag']>(
    tag: Tag,
    payload: PayloadOf<Rpcs, Tag>,
    onChunk: (chunk: ChunkOf<Rpcs, Tag>) => void,
    streamOptions?: { readonly enabled?: boolean },
  ): StreamState<ErrorOf<Rpcs, Tag>> => {
    const enabled = streamOptions?.enabled ?? true;
    const [state, setState] = useState<StreamState<ErrorOf<Rpcs, Tag>>>(IDLE);

    // The subscription is keyed by the payload's hash, so a caller may pass a fresh
    // object literal every render without resubscribing; these refs carry the current
    // values into a subscription that outlives the render which started it.
    const onChunkRef = useRef(onChunk);
    onChunkRef.current = onChunk;
    const payloadRef = useRef(payload);
    payloadRef.current = payload;
    const payloadHash = hashKey([payload]);

    useEffect(() => {
      if (!enabled) {
        setState(IDLE);
        return;
      }
      setState(STREAMING);
      let live = true;
      const fiber = runtime.runFork(
        Effect.flatMap(client, (c) =>
          Stream.runForEach(
            (c as unknown as StreamAt<Rpcs, Tag>)(tag, payloadRef.current),
            (chunk) => Effect.sync(() => onChunkRef.current(chunk)),
          ),
        ),
      );
      fiber.addObserver((exit) => {
        if (!live) {
          return;
        }
        if (Exit.isSuccess(exit)) {
          setState(DONE);
          return;
        }
        if (Cause.hasInterruptsOnly(exit.cause)) {
          return;
        }
        const failure = Cause.findErrorOption(exit.cause);
        if (Option.isSome(failure)) {
          onFailure?.(failure.value);
          setState({ status: 'failed', error: failure.value });
          return;
        }
        setState({ status: 'failed', error: undefined });
      });
      return () => {
        live = false;
        // Interrupting the client fiber sends the rpc's Interrupt message, so the
        // server's own finalisers run rather than the stream being abandoned.
        Effect.runFork(Fiber.interrupt(fiber));
      };
    }, [enabled, tag, payloadHash]);

    return state;
  };

  return {
    rpcKey,
    rpcCall,
    rpcQuery,
    rpcInfiniteQuery,
    rpcMutation,
    useRpcStream,
  };
};
