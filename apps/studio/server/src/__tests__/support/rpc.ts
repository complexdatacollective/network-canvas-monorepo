import {
  Cause,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Option,
  Predicate,
  Scope,
} from 'effect';
import type { RpcClient, RpcGroup } from 'effect/unstable/rpc';
import { RpcClient as Client, RpcTest } from 'effect/unstable/rpc';
import { expect } from 'vitest';

import { StudioRpcs } from '@codaco/studio-contract/rpc/studio';

import type { Studio } from '../../app.ts';
import { AuthenticatedLive } from '../../rpc/authenticated.ts';
import { ClientSessionMiddlewareLive } from '../../rpc/client-session.ts';
import { StudioRpcHandlers } from '../../rpc/handlers.ts';

// The rpc plane in process: `RpcTest.makeClient` wires a generated client
// straight to the handlers for the same group, through the normal client and
// server machinery but without a serializer or a socket. Every middleware runs,
// so a suite driving this client exercises the same authentication, the same
// payload decode and the same declared errors a real call does — what it does
// not exercise is the transport, which is what the suites that compose the
// whole stack are for (`support/serve.ts`).

type StudioRpc = RpcGroup.Rpcs<typeof StudioRpcs>;

export type RpcTestClient = {
  /**
   * Builds a call: `client.rpc('studies.list', { teamId })`. It is the flat
   * client, so the tag is an argument rather than a property path, and the
   * payload, the success value and the declared errors are all typed from the
   * contract's own schemas.
   *
   * It returns an `Effect` rather than a promise because that is what carries
   * the typed failure; `call` and `callExit` below run one.
   */
  readonly rpc: RpcClient.RpcClient.Flat<StudioRpc>;
  /** Runs a call; a declared failure rejects. */
  readonly call: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
  /** Runs a call and hands back the whole exit, for a case about a refusal. */
  readonly callExit: <A, E>(
    effect: Effect.Effect<A, E>,
  ) => Promise<Exit.Exit<A, E>>;
  readonly dispose: () => Promise<void>;
};

/**
 * A client over one Studio's handlers.
 *
 * `headers` are sent with every call, which is how a suite presents a session:
 * `AuthenticatedLive` reads `cookie` out of the request headers and asks the
 * auth service, exactly as it does for a fetch request, so a stubbed
 * `getSession` sees whatever the suite put there. `x-studio-client-session`
 * rides the same way. They are attached with `RpcClient.withHeaders` around the
 * call rather than per call site, so no case can forget them.
 */
export async function createRpcClient(
  studio: Studio,
  headers: Record<string, string> = {},
): Promise<RpcTestClient> {
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      StudioRpcHandlers(studio.rpc),
      AuthenticatedLive(studio.rpc.auth),
      ClientSessionMiddlewareLive,
    ),
  );
  // The client forks a server loop and a client loop that have to outlive any
  // one call, so their scope is the harness's rather than a request's.
  const scope = Scope.makeUnsafe();
  const rpc = await runtime.runPromise(
    Effect.provideService(
      RpcTest.makeClient(StudioRpcs, { flatten: true }),
      Scope.Scope,
      scope,
    ),
  );

  return {
    rpc,
    call: (effect) => runtime.runPromise(Client.withHeaders(effect, headers)),
    callExit: (effect) =>
      runtime.runPromiseExit(Client.withHeaders(effect, headers)),
    dispose: async () => {
      await runtime.runPromise(Scope.close(scope, Exit.void));
      await runtime.dispose();
    },
  };
}

/** Narrows a declared error union by its tag, so the fields are readable. */
const taggedAs = <E, T extends string>(
  error: E,
  tag: T,
): error is Extract<E, { readonly _tag: T }> =>
  Predicate.hasProperty(error, '_tag') && error._tag === tag;

/**
 * The declared error a call was refused with, asserted by tag and handed back
 * for the fields.
 *
 * It takes the exit rather than a rejected promise: a rejection carries the
 * cause rather than the error, and digging a tagged error's fields out of one
 * is exactly what a test should not be doing. A call that died instead of
 * failing fails the assertion with the defect, rather than reading as the
 * wrong tag.
 */
export async function expectRpcFailure<A, E, T extends string>(
  exit: Promise<Exit.Exit<A, E>>,
  tag: T,
): Promise<Extract<E, { readonly _tag: T }>> {
  const settled = await exit;
  if (Exit.isSuccess(settled)) {
    expect.unreachable(`expected a ${tag} refusal, but the call succeeded`);
  }
  const error = Cause.findErrorOption(settled.cause);
  if (Option.isNone(error)) {
    expect.unreachable(
      `expected a ${tag} refusal, but the call died: ${Cause.pretty(settled.cause)}`,
    );
  }
  if (!taggedAs(error.value, tag)) {
    expect.unreachable(
      `expected a ${tag} refusal, but the call failed with ${JSON.stringify(error.value)}`,
    );
  }
  return error.value;
}
