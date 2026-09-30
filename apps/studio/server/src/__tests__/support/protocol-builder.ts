import {
  Clock,
  Duration,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Option,
  Scope,
} from 'effect';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';
import * as RpcServer from 'effect/unstable/rpc/RpcServer';

import {
  ProtocolBuilderGroup,
  type ProtocolBuilderRpcs,
} from '@codaco/protocol-builder-core/contract';
import { CLIENT_SESSION_HEADER } from '@codaco/studio-contract/client-session';

import type { Studio } from '../../app.ts';
import { AuthService, type SessionPrincipal } from '../../auth/service.ts';
import { ProtocolBuilderHandlers } from '../../protocol-builder/handlers.ts';
import { Leases } from '../../protocol-builder/leases.ts';
import { Presence } from '../../protocol-builder/presence.ts';
import { ProtocolEvents } from '../../protocol-builder/publisher.ts';
import { StagedImports } from '../../protocol-builder/resources.ts';
import {
  HostSessionLive,
  WsConnection,
} from '../../protocol-builder/session.ts';
import { ObjectStore } from '../../storage/object-store.ts';
import { studioServices } from './services.ts';

// The protocol-builder host in process: the handlers `/ws` and
// `/rpc/protocol-builder` serve, behind the same `HostSessionLive`, over a
// client and a server wired to each other with no serializer and no socket.
// What a suite driving this does not exercise is a transport, which is what
// `ws-protocol-builder.test.ts` is for.

/**
 * Who a call is made as.
 *
 * `principal` is a signed-in session: the call carries a header the harness's
 * auth service resolves to it, as a cookie is resolved on every call. A caller
 * without one is resolved from `headers` by the Studio's own auth service.
 * `connection` makes the call one made over a socket, which is what presence
 * is drawn from; `tab` is the client session its locks belong to.
 */
export type Caller = {
  readonly principal?: SessionPrincipal;
  readonly connection?: string;
  readonly tab?: string;
  readonly headers?: Readonly<Record<string, string>>;
};

export type ProtocolBuilderTestClient = {
  /** The flat client: `client.rpc('AcquireLock', { protocolId, sectionId })`. */
  readonly rpc: RpcClient.RpcClient.Flat<ProtocolBuilderRpcs>;
  /** Runs a call as `caller`; a declared failure rejects. */
  readonly call: <A, E>(
    caller: Caller,
    effect: Effect.Effect<A, E>,
  ) => Promise<A>;
  /** Runs a call as `caller` and hands back the whole exit. */
  readonly callExit: <A, E>(
    caller: Caller,
    effect: Effect.Effect<A, E>,
    options?: Effect.RunOptions,
  ) => Promise<Exit.Exit<A, E>>;
  /** Runs anything over the harness's services, e.g. a read of `Leases`. */
  readonly run: <A, E>(
    effect: Effect.Effect<
      A,
      E,
      Leases | Presence | ProtocolEvents | StagedImports
    >,
  ) => Promise<A>;
  readonly dispose: () => Promise<void>;
};

/** The header a harness caller's session travels in. */
const SESSION_HEADER = 'x-harness-session';

type Sessions = Map<string, SessionPrincipal>;

/**
 * The Studio's auth service, which also resolves the sessions the harness's
 * callers carry.
 */
const harnessAuth = (
  auth: AuthService['Service'],
  sessions: Sessions,
): AuthService['Service'] =>
  AuthService.of({
    ...auth,
    getSession: (headers) => {
      const session = headers[SESSION_HEADER];
      return session === undefined
        ? auth.getSession(headers)
        : Effect.succeed(Option.fromNullishOr(sessions.get(session)));
    },
  });

/** Runs `effect` as `caller`: in their fiber, with their headers. */
const asCaller = <A, E, R>(
  sessions: Sessions,
  caller: Caller,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => {
  if (caller.principal !== undefined) {
    sessions.set(caller.principal.sessionId, caller.principal);
  }
  const headers = {
    ...caller.headers,
    ...(caller.principal === undefined
      ? {}
      : { [SESSION_HEADER]: caller.principal.sessionId }),
    ...(caller.tab === undefined
      ? {}
      : { [CLIENT_SESSION_HEADER]: caller.tab }),
  };
  const withConnection =
    caller.connection === undefined
      ? effect
      : Effect.provideService(effect, WsConnection, {
          connectionId: caller.connection,
        });
  return RpcClient.withHeaders(withConnection, headers);
};

/**
 * The two public no-serialization constructors wired to each other, with fatal
 * defects off as both mounts run them (`protocol-builder/rpc.ts`): a call that
 * dies fails alone rather than every call in flight.
 */
const inProcessClient = Effect.gen(function* () {
  let client:
    | Effect.Success<
        ReturnType<
          typeof RpcClient.makeNoSerialization<ProtocolBuilderRpcs, never, true>
        >
      >
    | undefined;
  const server = yield* RpcServer.makeNoSerialization(ProtocolBuilderGroup, {
    disableFatalDefects: true,
    onFromServer: (response) =>
      client === undefined ? Effect.void : client.write(response),
  });
  client = yield* RpcClient.makeNoSerialization(ProtocolBuilderGroup, {
    supportsAck: true,
    flatten: true,
    onFromClient: ({ message }) => server.write(0, message),
  });
  return client.client;
});

/**
 * A clock whose wall time a suite can move forward without waiting for it:
 * `advance` shifts every reading, and wakes every sleep whose deadline the
 * shift has passed. Sleeps otherwise run on real timers, so everything the
 * handlers do that is not about time — Postgres, the socket — runs as it does
 * in production.
 */
export const makeShiftableClock = () => {
  let offset = 0;
  const sleepers = new Set<{
    readonly millis: number;
    readonly due: number;
    readonly wake: () => void;
  }>();
  const now = () => Date.now() + offset;
  const nanos = () => BigInt(now()) * 1_000_000n;
  const clock: Clock.Clock = {
    currentTimeMillisUnsafe: now,
    currentTimeMillis: Effect.sync(now),
    currentTimeNanosUnsafe: nanos,
    currentTimeNanos: Effect.sync(nanos),
    monotonicTimeNanosUnsafe: nanos,
    monotonicTimeNanos: Effect.sync(nanos),
    sleep: (duration) =>
      Effect.callback<void>((resume) => {
        const millis = Duration.toMillis(duration);
        let handle: ReturnType<typeof setTimeout> | undefined;
        const sleeper = {
          millis,
          due: now() + millis,
          wake: () => {
            sleepers.delete(sleeper);
            clearTimeout(handle);
            resume(Effect.void);
          },
        };
        handle = setTimeout(sleeper.wake, millis);
        sleepers.add(sleeper);
        return Effect.sync(() => {
          sleepers.delete(sleeper);
          clearTimeout(handle);
        });
      }),
  };
  return {
    clock,
    now,
    /**
     * How many sleeps asked for exactly `millis` are waiting, so a suite can
     * tell when the lease keeper is between ticks, or a reconnect grace has
     * started.
     */
    pending: (millis: number) =>
      [...sleepers].filter((sleeper) => sleeper.millis === millis).length,
    advance: (millis: number) => {
      offset += millis;
      const due = [...sleepers].filter((sleeper) => sleeper.due <= now());
      for (const sleeper of due) sleeper.wake();
    },
  };
};

/**
 * The handlers over one Studio's services, and a client to them.
 *
 * `clock` is the clock the handlers, the lease keeper and `run` read; `objectStore`
 * replaces the Studio's; `leases` and `events` replace the keeper and the
 * fan-out, for a suite that needs one it can see into or hold; `layer` is
 * provided to the runtime, e.g. a logger.
 */
export async function createProtocolBuilderClient(
  studio: Studio,
  options: {
    readonly clock?: Clock.Clock;
    readonly objectStore?: ObjectStore['Service'];
    readonly leases?: Layer.Layer<Leases>;
    readonly events?: Layer.Layer<ProtocolEvents>;
    readonly layer?: Layer.Layer<never>;
  } = {},
): Promise<ProtocolBuilderTestClient> {
  const sessions: Sessions = new Map();
  const state = Layer.mergeAll(
    options.leases ?? Leases.layer,
    Presence.layer,
    options.events ?? ProtocolEvents.layer,
    StagedImports.layer,
  );
  const withAuth = Layer.merge(
    studioServices(studio),
    Layer.succeed(AuthService)(harnessAuth(studio.auth, sessions)),
  );
  const services =
    options.objectStore === undefined
      ? withAuth
      : Layer.merge(withAuth, Layer.succeed(ObjectStore)(options.objectStore));
  const built = Layer.mergeAll(ProtocolBuilderHandlers, HostSessionLive).pipe(
    Layer.provideMerge(state),
    Layer.provide(services),
  );
  const clocked =
    options.clock === undefined
      ? built
      : built.pipe(
          Layer.provideMerge(Layer.succeed(Clock.Clock)(options.clock)),
        );
  const runtime = ManagedRuntime.make(
    options.layer === undefined ? clocked : Layer.merge(clocked, options.layer),
  );
  const scope = Scope.makeUnsafe();
  const rpc = await runtime.runPromise(
    Effect.provideService(inProcessClient, Scope.Scope, scope),
  );
  return {
    rpc,
    call: (caller, effect) =>
      runtime.runPromise(asCaller(sessions, caller, effect)),
    callExit: (caller, effect, runOptions) =>
      runtime.runPromiseExit(asCaller(sessions, caller, effect), runOptions),
    run: (effect) => runtime.runPromise(effect),
    dispose: async () => {
      await runtime.runPromise(Scope.close(scope, Exit.void));
      await runtime.dispose();
    },
  };
}
