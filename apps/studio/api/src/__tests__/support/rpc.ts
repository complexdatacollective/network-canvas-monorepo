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
import type { RpcClient, RpcGroup } from 'effect/rpc';
import { RpcClient as Client, RpcTest } from 'effect/rpc';
import { expect } from 'vitest';

import { StudioRpcs } from '@codaco/studio-contract/rpc/studio';

import type { Studio } from '../../app.ts';
import { AuthenticatedLive } from '../../rpc/authenticated.ts';
import { ClientSessionMiddlewareLive } from '../../rpc/client-session.ts';
import { StudioRpcHandlers } from '../../rpc/handlers.ts';
import { TeamAdministrationLive } from '../../rpc/team-administration.ts';
import { studioServices } from './services.ts';

type StudioRpc = RpcGroup.Rpcs<typeof StudioRpcs>;

export type RpcTestClient = {
  readonly rpc: RpcClient.RpcClient.Flat<StudioRpc>;
  readonly call: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
  readonly callExit: <A, E>(
    effect: Effect.Effect<A, E>,
  ) => Promise<Exit.Exit<A, E>>;
  readonly dispose: () => Promise<void>;
};

export async function createRpcClient(
  studio: Studio,
  headers: Record<string, string> = {},
): Promise<RpcTestClient> {
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      StudioRpcHandlers(studio.rpc),
      AuthenticatedLive,
      TeamAdministrationLive(studio.rpc),
      ClientSessionMiddlewareLive,
    ).pipe(Layer.provide(studioServices(studio))),
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

const taggedAs = <E, T extends string>(
  error: E,
  tag: T,
): error is Extract<E, { readonly _tag: T }> =>
  Predicate.hasProperty(error, '_tag') && error._tag === tag;

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

const formatIssue = SchemaIssue.makeFormatterStandardSchemaV1();

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
  const issue =
    defect.success instanceof Error ? defect.success.cause : undefined;
  if (!SchemaIssue.isIssue(issue)) {
    expect.unreachable(
      `expected ${field} to be refused at the payload boundary, but the call died on something else: ${Cause.pretty(exit.cause)}`,
    );
  }
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
