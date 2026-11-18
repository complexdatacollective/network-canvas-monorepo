import { Context, Effect, Layer, ManagedRuntime, Scheduler } from 'effect';
import type * as Rpc from 'effect/rpc/Rpc';
import * as RpcClient from 'effect/rpc/RpcClient';
import type * as RpcGroup from 'effect/rpc/RpcGroup';
import * as RpcServer from 'effect/rpc/RpcServer';

import { makeRpcAdapter } from '@codaco/effect-query/adapter';
import {
  ProtocolBuilderGroup,
  type ProtocolBuilderClient,
  type ProtocolBuilderRpcs,
} from '@codaco/protocol-builder-core/contract';
import {
  HostCaller,
  HostSession,
} from '@codaco/protocol-builder-core/contract/session';

import type { ProtocolBuilderAdapter } from '../state/context.ts';

// The wiring a host needs to serve the contract from handlers in its own
// process: no socket and no serialization between the editor and the host.
// The handlers, and who the caller is, stay each host's own.

/** The contract's client, answered by handlers in the same process. */
export class InProcessHostClient extends Context.Service<
  InProcessHostClient,
  ProtocolBuilderClient
>()('@codaco/protocol-builder/host/InProcessHostClient') {}

/**
 * A client and a server for `group`, joined directly to each other.
 *
 * `disableFatalDefects` keeps a handler's defect on its own call. Without it
 * the client fails every call in flight with it.
 */
export const makeInProcessClient = Effect.fnUntraced(function* <
  Rpcs extends Rpc.Any,
>(group: RpcGroup.RpcGroup<Rpcs>) {
  // oxlint-disable-next-line prefer-const
  let client!: Effect.Success<
    ReturnType<typeof RpcClient.makeNoSerialization<Rpcs, never, true>>
  >;
  const server = yield* RpcServer.makeNoSerialization(group, {
    onFromServer: (response) => client.write(response),
    disableFatalDefects: true,
  });
  client = yield* RpcClient.makeNoSerialization(group, {
    supportsAck: true,
    flatten: true,
    onFromClient: ({ message }) => server.write(0, message),
  });
  return client.client;
});

/** A session that answers every call as the one caller it is given. */
export function fixedHostSession(
  caller: HostCaller['Service'],
): Layer.Layer<HostSession> {
  return Layer.succeed(HostSession)(
    HostSession.of((effect) =>
      Effect.provideService(effect, HostCaller, caller),
    ),
  );
}

export type InProcessHandlers = Layer.Layer<Rpc.ToHandler<ProtocolBuilderRpcs>>;

export type InProcessHostOptions = Readonly<{
  /**
   * The scheduler the host's fibers run on. Left out, they run on Effect's
   * default one; a test passes a synchronous scheduler so a change it makes
   * inside `act` is delivered there.
   */
  scheduler?: Scheduler.Scheduler;
}>;

export type InProcessHost = Readonly<{
  adapter: ProtocolBuilderAdapter;
  /** Owns the client and its handlers; disposing it releases both. */
  runtime: ManagedRuntime.ManagedRuntime<InProcessHostClient, never>;
}>;

/** An adapter onto `handlers`, calling as whoever `session` names. */
export function makeInProcessHost(
  handlers: InProcessHandlers,
  session: Layer.Layer<HostSession>,
  options: InProcessHostOptions = {},
): InProcessHost {
  const client = Layer.effect(InProcessHostClient)(
    makeInProcessClient(ProtocolBuilderGroup),
  ).pipe(Layer.provide([handlers, session]));
  const runtime = ManagedRuntime.make(
    options.scheduler === undefined
      ? client
      : client.pipe(
          Layer.provideMerge(
            Layer.succeed(Scheduler.Scheduler)(options.scheduler),
          ),
        ),
  );
  return {
    adapter: makeRpcAdapter<
      ProtocolBuilderRpcs,
      InProcessHostClient,
      InProcessHostClient
    >({ runtime, client: InProcessHostClient }),
    runtime,
  };
}
