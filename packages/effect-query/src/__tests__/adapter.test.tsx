import {
  QueryClient,
  QueryClientProvider,
  type QueryFunctionContext,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  Context,
  Effect,
  Layer,
  ManagedRuntime,
  Predicate,
  Schema,
  Stream,
} from 'effect';
import {
  Rpc,
  type RpcClient,
  type RpcClientError,
  RpcGroup,
  RpcMiddleware,
  RpcTest,
} from 'effect/unstable/rpc';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeRpcAdapter } from '../adapter.ts';
import type { RpcAdapter } from '../types.ts';

class UserNotFound extends Schema.TaggedError<UserNotFound>()('UserNotFound', {
  id: Schema.String,
}) {}

class Denied extends Schema.TaggedError<Denied>()('Denied', {
  reason: Schema.String,
}) {}

class Guard extends RpcMiddleware.Service<Guard>()('effect-query/test/Guard', {
  error: Denied,
}) {}

const GetUser = Rpc.make('GetUser', {
  payload: { id: Schema.String },
  success: Schema.Struct({ id: Schema.String, name: Schema.String }),
  error: UserNotFound,
});

const ListItems = Rpc.make('ListItems', {
  payload: { cursor: Schema.optionalKey(Schema.Number) },
  success: Schema.Struct({
    items: Schema.Array(Schema.Number),
    next: Schema.NullOr(Schema.Number),
  }),
});

const Slow = Rpc.make('Slow', { success: Schema.String });

const Countdown = Rpc.make('Countdown', {
  payload: { from: Schema.Number },
  success: Schema.Number,
  stream: true,
});

const Secret = Rpc.make('Secret', { success: Schema.String });

const group = RpcGroup.make(GetUser, ListItems, Slow, Countdown).merge(
  RpcGroup.make(Secret).middleware(Guard),
);

type Rpcs = RpcGroup.Rpcs<typeof group>;

class Client extends Context.Service<
  Client,
  RpcClient.RpcClient.Flat<Rpcs, RpcClientError.RpcClientError>
>()('effect-query/test/Client') {}

/**
 * A countdown long enough that it cannot finish inside a `waitFor` window: the
 * finaliser can only be observed to have run because the fiber was interrupted.
 */
const COUNTDOWN_FROM = 100;
const COUNTDOWN_GAP = '20 millis';

let getUserCalls = 0;
let released = false;
let denied = false;

const handlers = group.toLayer({
  GetUser: ({ id }) => {
    getUserCalls += 1;
    return id === '404'
      ? Effect.fail(new UserNotFound({ id }))
      : Effect.succeed({ id, name: `User ${id}` });
  },
  ListItems: ({ cursor }) => {
    const start = cursor ?? 0;
    return Effect.succeed({
      items: [start, start + 1],
      next: start >= 2 ? null : start + 2,
    });
  },
  Slow: () => Effect.never,
  Countdown: ({ from }) =>
    Stream.fromIterable(
      Array.from({ length: from }, (_, index) => from - index),
    ).pipe(
      Stream.mapEffect((value) =>
        Effect.as(Effect.sleep(COUNTDOWN_GAP), value),
      ),
      Stream.ensuring(
        Effect.sync(() => {
          released = true;
        }),
      ),
    ),
  Secret: () => Effect.succeed('classified'),
});

const guardLayer = Layer.succeed(Guard)(
  Guard.of((effect) =>
    denied ? Effect.fail(new Denied({ reason: 'flagged' })) : effect,
  ),
);

const clientLayer = Layer.provide(
  Layer.effect(Client)(RpcTest.makeClient(group, { flatten: true })),
  [handlers, guardLayer],
);

const makeOnFailure = () => vi.fn<(error: unknown) => void>();

const wrapperFor = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe('makeRpcAdapter', () => {
  let runtime: ManagedRuntime.ManagedRuntime<Client, never>;
  let queryClient: QueryClient;
  let adapter: RpcAdapter<Rpcs>;
  let onFailure: ReturnType<typeof makeOnFailure>;
  let wrapper: ReturnType<typeof wrapperFor>;

  beforeEach(() => {
    getUserCalls = 0;
    released = false;
    denied = false;
    runtime = ManagedRuntime.make(clientLayer);
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    onFailure = makeOnFailure();
    adapter = makeRpcAdapter({ runtime, client: Client, onFailure });
    wrapper = wrapperFor(queryClient);
  });

  afterEach(async () => {
    queryClient.clear();
    await runtime.dispose();
  });

  it('hands the rpc error instance to useQuery and reports it to onFailure', async () => {
    const { result } = renderHook(
      () => useQuery(adapter.rpcQuery('GetUser', { id: '404' })),
      {
        wrapper,
      },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(UserNotFound);
    expect(result.current.error?._tag).toBe('UserNotFound');
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith(result.current.error);
  });

  it('invalidates every payload of a tag from the tag-only key prefix', async () => {
    const { result } = renderHook(
      () => ({
        a: useQuery(adapter.rpcQuery('GetUser', { id: 'a' })),
        b: useQuery(adapter.rpcQuery('GetUser', { id: 'b' })),
      }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.a.isSuccess).toBe(true);
      expect(result.current.b.isSuccess).toBe(true);
    });
    expect(getUserCalls).toBe(2);

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['rpc', 'GetUser'] });
    });

    await waitFor(() => expect(getUserCalls).toBe(4));
    expect(result.current.a.data).toEqual({ id: 'a', name: 'User a' });
    expect(result.current.b.data).toEqual({ id: 'b', name: 'User b' });
  });

  it('rejects an aborted call with an abort error rather than a failure', async () => {
    const options = adapter.rpcQuery('Slow', undefined);
    const { queryFn } = options;
    if (typeof queryFn !== 'function') {
      throw new Error('rpcQuery must build a query function');
    }

    const controller = new AbortController();
    controller.abort();
    const context: QueryFunctionContext = {
      client: queryClient,
      queryKey: options.queryKey,
      signal: controller.signal,
      meta: undefined,
    };

    const rejection = await Promise.resolve(queryFn(context)).then(
      () => null,
      (error: unknown) => error,
    );

    // jsdom's `DOMException` constructor is not the one this module's realm sees, so
    // the abort is identified by its name rather than by `instanceof`.
    const name =
      Predicate.hasProperty(rejection, 'name') &&
      Predicate.isString(rejection.name)
        ? rejection.name
        : undefined;
    expect(name).toBe('AbortError');
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('streams chunks in order and interrupts the server stream on unmount', async () => {
    const chunks: number[] = [];
    const { result, unmount } = renderHook(() =>
      adapter.useRpcStream('Countdown', { from: COUNTDOWN_FROM }, (chunk) => {
        chunks.push(chunk);
      }),
    );

    await waitFor(() => expect(chunks.length).toBeGreaterThanOrEqual(3));
    expect(chunks.slice(0, 3)).toEqual([
      COUNTDOWN_FROM,
      COUNTDOWN_FROM - 1,
      COUNTDOWN_FROM - 2,
    ]);
    expect(result.current.status).toBe('streaming');
    expect(released).toBe(false);

    unmount();

    await waitFor(() => expect(released).toBe(true));
  });

  it('runs nothing while a stream is disabled', async () => {
    const chunks: number[] = [];
    const { result } = renderHook(() =>
      adapter.useRpcStream(
        'Countdown',
        { from: COUNTDOWN_FROM },
        (chunk) => {
          chunks.push(chunk);
        },
        { enabled: false },
      ),
    );

    await waitFor(() => expect(result.current.status).toBe('idle'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    expect(chunks).toEqual([]);
  });

  it("hands the middleware's error to useQuery", async () => {
    denied = true;
    const { result } = renderHook(
      () => useQuery(adapter.rpcQuery('Secret', undefined)),
      {
        wrapper,
      },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(Denied);
    expect(result.current.error?._tag).toBe('Denied');
  });

  it('resolves and rejects a mutation with the rpc types', async () => {
    const { result } = renderHook(
      () => useMutation(adapter.rpcMutation('GetUser')),
      { wrapper },
    );

    const user = await act(() => result.current.mutateAsync({ id: 'ok' }));
    expect(user).toEqual({ id: 'ok', name: 'User ok' });

    const rejection = await act(() =>
      result.current.mutateAsync({ id: '404' }).then(
        () => null,
        (error: unknown) => error,
      ),
    );
    expect(rejection).toBeInstanceOf(UserNotFound);
  });

  it('follows getNextCursor through an infinite query', async () => {
    const { result } = renderHook(
      () =>
        useInfiniteQuery(
          adapter.rpcInfiniteQuery(
            'ListItems',
            {},
            { getNextCursor: (page) => page.next ?? undefined },
          ),
        ),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages.map((page) => page.items)).toEqual([
      [0, 1],
    ]);
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.data?.pages.map((page) => page.items)).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(result.current.hasNextPage).toBe(false);
  });
});

/**
 * Never called and never exported — `tsc` still checks the body, and that is the
 * point: each `@ts-expect-error` fails the typecheck if the mistake below it ever
 * becomes legal.
 */
const _typeProbes = (probe: RpcAdapter<Rpcs>) => {
  // @ts-expect-error — 'Nope' is not a tag in the group.
  probe.rpcQuery('Nope', { id: 'x' });
  // @ts-expect-error — GetUser's payload requires `id`.
  probe.rpcQuery('GetUser', {});
  // @ts-expect-error — `id` is a string.
  probe.rpcQuery('GetUser', { id: 1 });
  // @ts-expect-error — 'Nope' is not a tag in the group.
  probe.rpcMutation('Nope');
};

/**
 * Pins the error type a screen reads off `useQuery`, in the same never-called way.
 * Both assignments together make it an equality rather than a one-way bound: the
 * first fails if the slot widens, the second if it narrows.
 */
const _errorNarrowingProbe = (probe: RpcAdapter<Rpcs>) => {
  const result = useQuery(probe.rpcQuery('GetUser', { id: 'x' }));
  const narrowed: UserNotFound | RpcClientError.RpcClientError | null =
    result.error;
  const widened: typeof result.error = narrowed;
  return narrowed?._tag === 'UserNotFound' ? narrowed.id : widened;
};
