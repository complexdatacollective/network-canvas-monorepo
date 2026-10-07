import { randomUUID } from 'node:crypto';

import {
  Clock,
  Duration,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Option,
  Scope,
  Tracer,
} from 'effect';
import * as RpcClient from 'effect/rpc/RpcClient';
import * as RpcServer from 'effect/rpc/RpcServer';

import {
  ProtocolBuilderGroup,
  type ProtocolBuilderRpcs,
} from '@codaco/protocol-builder-core/contract';
import { CLIENT_SESSION_HEADER } from '@codaco/studio-contract/client-session';

import type { Studio } from '../../app.ts';
import { AuthService, type SessionPrincipal } from '../../auth/service.ts';
import type { Database } from '../../db/client.ts';
import { MaintenanceTriggers } from '../../http/middleware/maintenance.ts';
import { ReplicaId } from '../../protocol-builder/connections.ts';
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

export type Caller = {
  readonly principal?: SessionPrincipal;
  readonly connection?: string;
  readonly tab?: string;
  readonly headers?: Readonly<Record<string, string>>;
};

export type ProtocolBuilderTestClient = {
  readonly rpc: RpcClient.RpcClient.Flat<ProtocolBuilderRpcs>;
  readonly call: <A, E>(
    caller: Caller,
    effect: Effect.Effect<A, E>,
  ) => Promise<A>;
  readonly callExit: <A, E>(
    caller: Caller,
    effect: Effect.Effect<A, E>,
    options?: Effect.RunOptions,
  ) => Promise<Exit.Exit<A, E>>;
  readonly run: <A, E>(
    effect: Effect.Effect<
      A,
      E,
      Leases | Presence | ProtocolEvents | StagedImports
    >,
  ) => Promise<A>;
  readonly dispose: () => Promise<void>;
};

const SESSION_HEADER = 'x-harness-session';

type Sessions = Map<string, SessionPrincipal>;

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
 * A tracer that counts the spans it is asked for by name, so a test can tell
 * how often the lease keeper reached the database, and whether an attempt has
 * finished, without a seam in it.
 */
export const makeSpanCounter = () => {
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  const named = (name: string) => spans.filter((span) => span.name === name);
  return {
    tracer,
    count: (name: string) => named(name).length,
    ended: (name: string) =>
      named(name).filter((span) => span.status._tag === 'Ended').length,
  };
};

export async function createProtocolBuilderClient(
  studio: Studio,
  options: {
    readonly clock?: Clock.Clock;
    readonly objectStore?: ObjectStore['Service'];
    readonly leases?: Layer.Layer<
      Leases,
      never,
      Database | MaintenanceTriggers
    >;
    readonly presence?: Layer.Layer<Presence, never, Database>;
    readonly maintenance?: MaintenanceTriggers['Service'];
    readonly tracer?: Tracer.Tracer;
    readonly events?: Layer.Layer<ProtocolEvents>;
    readonly staged?: Layer.Layer<StagedImports>;
    readonly layer?: Layer.Layer<never>;
    /** Each client is a replica of its own unless two are given one id. */
    readonly replicaId?: string;
  } = {},
): Promise<ProtocolBuilderTestClient> {
  const sessions: Sessions = new Map();
  const state = Layer.mergeAll(
    options.leases ?? Leases.layer,
    options.presence ?? Presence.layer,
    options.events ?? ProtocolEvents.layer,
    options.staged ?? StagedImports.layer,
  );
  const withAuth = Layer.merge(
    studioServices(studio),
    Layer.succeed(AuthService)(harnessAuth(studio.auth, sessions)),
  );
  const triggers = Layer.mergeAll(
    withAuth,
    Layer.succeed(ReplicaId)(options.replicaId ?? randomUUID()),
    options.maintenance === undefined
      ? MaintenanceTriggers.layerOpen
      : Layer.succeed(MaintenanceTriggers)(options.maintenance),
  );
  const services =
    options.objectStore === undefined
      ? triggers
      : Layer.merge(triggers, Layer.succeed(ObjectStore)(options.objectStore));
  const built = Layer.mergeAll(ProtocolBuilderHandlers, HostSessionLive).pipe(
    Layer.provideMerge(state),
    Layer.provide(services),
  );
  const traced =
    options.tracer === undefined
      ? built
      : built.pipe(
          Layer.provideMerge(Layer.succeed(Tracer.Tracer)(options.tracer)),
        );
  const clocked =
    options.clock === undefined
      ? traced
      : traced.pipe(
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
