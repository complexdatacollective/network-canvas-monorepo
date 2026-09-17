import {
  Cause,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Option,
  Predicate,
  Result,
  SchemaIssue,
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

/** One formatter for the file; building one per assertion says nothing more. */
const formatIssue = SchemaIssue.makeFormatterStandardSchemaV1();

/**
 * A payload the contract's schema refuses never reaches a handler, so it is not
 * one of the procedure's declared errors: the call dies rather than failing
 * with a tag. What a case using this asserts is that the refusal happened
 * before anything was written.
 *
 * Under `RpcTest.makeClient` the refusal is the *client's*: the generated
 * client encodes the payload before it sends it (`RpcClient.ts`,
 * `rpc.payloadSchema.make(payload)` and `encodePayload(...).pipe(Effect.orDie)`),
 * so it is that encoder that refuses, not the server. The server-boundary
 * decode is a different code path — the one a caller who is not using our
 * client reaches — and it has its own case over the transport:
 * `auth.test.ts`'s 'refuses a payload the contract rejects, at the server
 * boundary', which posts a raw ndjson frame and reads the `Die` out of the
 * response's `Exit`.
 *
 * `field` is the payload field the refusal has to name, and it is not optional.
 * "Failed with a die" alone is the same shape a call produces when it is
 * admitted and then throws — `expectAdmitted` in `rate-limit-routes.test.ts`
 * relies on exactly that equivalence — so without the field this could not tell
 * a boundary refusal from a query that reached Postgres and raised. Drop
 * `DecimalSequence`'s range filter and an over-range cursor does reach the
 * `::bigint` cast; that is the mutation this argument exists to kill.
 */
export function expectPayloadRejected(
  exit: Exit.Exit<unknown, unknown>,
  field: string,
): void {
  expect(Exit.isFailure(exit)).toBe(true);
  if (!Exit.isFailure(exit)) return;
  const defect = Cause.findDefect(exit.cause);
  if (Result.isFailure(defect)) {
    expect.unreachable(
      `expected ${field} to be refused at the payload boundary, but the call did not die: ${Cause.pretty(exit.cause)}`,
    );
  }
  // The encoder throws an `Error` carrying the schema issue as its `cause`; a
  // handler that ran and blew up carries something else entirely.
  const issue =
    defect.success instanceof Error ? defect.success.cause : undefined;
  if (!SchemaIssue.isIssue(issue)) {
    expect.unreachable(
      `expected ${field} to be refused at the payload boundary, but the call died on something else: ${Cause.pretty(exit.cause)}`,
    );
  }
  // The Standard Schema shape rather than the formatted message: it gives the
  // path of every leaf issue, which is the stable thing, where the message is
  // wording that churns with the check.
  const named = formatIssue(issue).issues.map((one) =>
    (one.path ?? [])
      .map((segment) =>
        // A path segment is a key or a wrapper around one; Effect emits the
        // key, but the Standard Schema type allows either.
        Predicate.hasProperty(segment, 'key')
          ? String(segment.key)
          : String(segment),
      )
      .join('.'),
  );
  expect(named).toContain(field);
}
