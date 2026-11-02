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
import type { Rpc, RpcClient, RpcClientError } from 'effect/rpc';
import { useEffect, useEffectEvent, useState } from 'react';

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

type PagePayloadOf<Rpcs extends Rpc.Any, Tag extends Rpcs['_tag']> = Omit<
  PayloadOf<Rpcs, Tag>,
  'cursor'
> & { readonly cursor?: unknown };

/**
 * Resolved views of the flat client's conditional return type, the target of the
 * only casts in this package; pinned by `_flatClientShapeProbe` in the tests.
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

  const run = async <A, E>(
    effect: Effect.Effect<A, E, R>,
    signal?: AbortSignal,
  ): Promise<A> => {
    const exit = await runtime.runPromiseExit(
      effect,
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

  const call = <Tag extends Rpcs['_tag']>(
    tag: Tag,
    payload: PayloadOf<Rpcs, Tag> | PagePayloadOf<Rpcs, Tag>,
    signal?: AbortSignal,
  ): Promise<SuccessOf<Rpcs, Tag>> =>
    run(
      Effect.flatMap(client, (c) =>
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- RpcClient.Flat's conditional return type does not resolve for a generic Rpcs; CallAt is that call's resolved shape, pinned by _flatClientShapeProbe
        (c as unknown as CallAt<Rpcs, Tag>)(tag, payload),
      ),
      signal,
    );

  const rpcKey = <Tag extends Rpcs['_tag']>(
    tag: Tag,
    payload?: PayloadOf<Rpcs, Tag>,
  ): QueryKey =>
    payload === undefined ? [keyPrefix, tag] : [keyPrefix, tag, payload];

  const rpcCall = <Tag extends Rpcs['_tag']>(
    tag: Tag,
    payload: PayloadOf<Rpcs, Tag>,
    signal?: AbortSignal,
  ): Promise<SuccessOf<Rpcs, Tag>> => call(tag, payload, signal);

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

  const rpcStream = <Tag extends Rpcs['_tag']>(
    tag: Tag,
    payload: PayloadOf<Rpcs, Tag>,
    onChunk: (chunk: ChunkOf<Rpcs, Tag>) => void,
    signal?: AbortSignal,
  ): Promise<void> =>
    run(
      Effect.flatMap(client, (c) =>
        Stream.runForEach(
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- RpcClient.Flat's conditional return type does not resolve for a generic Rpcs; StreamAt is that call's resolved shape, pinned by _flatClientShapeProbe
          (c as unknown as StreamAt<Rpcs, Tag>)(tag, payload),
          (chunk) => Effect.sync(() => onChunk(chunk)),
        ),
      ),
      signal,
    );

  const useRpcStream = <Tag extends Rpcs['_tag']>(
    tag: Tag,
    payload: PayloadOf<Rpcs, Tag>,
    onChunk: (chunk: ChunkOf<Rpcs, Tag>) => void,
    streamOptions?: { readonly enabled?: boolean },
  ): StreamState<ErrorOf<Rpcs, Tag>> => {
    const enabled = streamOptions?.enabled ?? true;
    // A run is one stream for one tag and payload. Its settled state is kept
    // with the key it belongs to, so a new run reads as streaming until its
    // own stream settles, with no reset inside the effect.
    const runKey = `${tag}:${hashKey([payload])}`;
    const [settled, setSettled] = useState<{
      readonly runKey: string;
      readonly state: StreamState<ErrorOf<Rpcs, Tag>>;
    } | null>(null);
    const state: StreamState<ErrorOf<Rpcs, Tag>> = !enabled
      ? IDLE
      : settled?.runKey === runKey
        ? settled.state
        : STREAMING;

    // The latest callback and payload, read when a run starts and as chunks
    // arrive, without restarting the stream when only their identity changes.
    const emitChunk = useEffectEvent((chunk: ChunkOf<Rpcs, Tag>) =>
      onChunk(chunk),
    );
    const currentPayload = useEffectEvent(() => payload);

    useEffect(() => {
      if (!enabled) {
        return undefined;
      }
      const settle = (next: StreamState<ErrorOf<Rpcs, Tag>>) =>
        setSettled({ runKey, state: next });
      let live = true;
      const fiber = runtime.runFork(
        Effect.flatMap(client, (c) =>
          Stream.runForEach(
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- RpcClient.Flat's conditional return type does not resolve for a generic Rpcs; StreamAt is that call's resolved shape, pinned by _flatClientShapeProbe
            (c as unknown as StreamAt<Rpcs, Tag>)(tag, currentPayload()),
            (chunk) => Effect.sync(() => emitChunk(chunk)),
          ),
        ),
      );
      fiber.addObserver((exit) => {
        if (!live) {
          return;
        }
        if (Exit.isSuccess(exit)) {
          settle(DONE);
          return;
        }
        if (Cause.hasInterruptsOnly(exit.cause)) {
          return;
        }
        const failure = Cause.findErrorOption(exit.cause);
        if (Option.isSome(failure)) {
          onFailure?.(failure.value);
          settle({ status: 'failed', error: failure.value });
          return;
        }
        settle({ status: 'failed', error: undefined });
      });
      return () => {
        live = false;
        Effect.runFork(Fiber.interrupt(fiber));
        // A run that ends without a successor (disabled, then enabled again
        // with the same payload) must not show this run's outcome.
        setSettled(null);
      };
    }, [enabled, tag, runKey]);

    return state;
  };

  return {
    rpcKey,
    rpcCall,
    rpcQuery,
    rpcInfiniteQuery,
    rpcMutation,
    rpcStream,
    useRpcStream,
  };
};
