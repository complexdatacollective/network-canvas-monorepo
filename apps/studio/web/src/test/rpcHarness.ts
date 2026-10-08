import { Effect, Layer, Option, Redacted, Schema } from 'effect';
import type { RpcGroup } from 'effect/rpc';
import { RpcTest } from 'effect/rpc';
import { onTestFinished } from 'vitest';

import { AuditActor } from '@codaco/studio-contract/middleware/audit-actor';
import {
  Authenticated,
  Principal,
} from '@codaco/studio-contract/middleware/authenticated';
import { StudioRpcs } from '@codaco/studio-contract/rpc/studio';
import { Unauthorized } from '@codaco/studio-contract/schema/errors';
import { UserId } from '@codaco/studio-contract/schema/ids';

import {
  getWebRuntime,
  makeWebRuntime,
  setWebRuntime,
  type StudioRpcClient,
  type WebRuntime,
} from '../runtime/runtime.ts';

type StudioRpcsType = RpcGroup.Rpcs<typeof StudioRpcs>;

export type StudioHandlers = RpcGroup.HandlersFrom<StudioRpcsType>;

export type RpcCall = {
  readonly tag: string;
  readonly payload: unknown;
};

export type RpcHarness = {
  readonly calls: ReadonlyArray<RpcCall>;
  readonly dispose: () => Promise<void>;
};

const unimplemented = (tag: string) => () =>
  Effect.die(
    new Error(`the rpc harness has no handler for the procedure "${tag}"`),
  );

/**
 * Written out per tag rather than generated, so a procedure added to the contract
 * fails `tsc` here.
 */
const unimplementedHandlers: StudioHandlers = {
  'account.updateLocale': unimplemented('account.updateLocale'),
  'audit.filterOptions': unimplemented('audit.filterOptions'),
  'audit.get': unimplemented('audit.get'),
  'audit.list': unimplemented('audit.list'),
  'me': unimplemented('me'),
  'participant.analytics': unimplemented('participant.analytics'),
  'participant.finish': unimplemented('participant.finish'),
  'participant.redeem': unimplemented('participant.redeem'),
  'participant.session': unimplemented('participant.session'),
  'participant.sync': unimplemented('participant.sync'),
  'protocols.addInformationStage': unimplemented(
    'protocols.addInformationStage',
  ),
  'protocols.create': unimplemented('protocols.create'),
  'protocols.draft': unimplemented('protocols.draft'),
  'protocols.list': unimplemented('protocols.list'),
  'protocols.moveStage': unimplemented('protocols.moveStage'),
  'setup.complete': unimplemented('setup.complete'),
  'status': unimplemented('status'),
  // Answered, not unimplemented: the notice sits in the shell, so every shell
  // test asks it, and "no update" is the answer that leaves them undisturbed.
  'status.updateAvailable': () => Effect.succeed(null),
  'studies.counts': unimplemented('studies.counts'),
  'studies.create': unimplemented('studies.create'),
  'studies.get': unimplemented('studies.get'),
  'studies.list': unimplemented('studies.list'),
  'team.acceptInvitation': unimplemented('team.acceptInvitation'),
  'team.cancelInvitation': unimplemented('team.cancelInvitation'),
  'team.createInvitation': unimplemented('team.createInvitation'),
  'team.updateMemberRole': unimplemented('team.updateMemberRole'),
  'telemetry.report': unimplemented('telemetry.report'),
};

export const HARNESS_PRINCIPAL: Principal['Service'] = Principal.of({
  kind: 'user',
  userId: UserId.make('harness-user'),
  email: Redacted.make('researcher@example.org'),
  emailVerified: true,
  name: Redacted.make('Harness Researcher'),
  locale: null,
  sessionId: 'harness-session',
});

const authenticatedLayer = (
  principal: Principal['Service'] | null,
): Layer.Layer<Authenticated> =>
  Layer.succeed(Authenticated)(
    Authenticated.of((effect) =>
      principal === null
        ? Effect.fail(new Unauthorized({}))
        : effect.pipe(
            Effect.provideService(Principal, principal),
            Effect.provideService(
              AuditActor,
              AuditActor.of({
                kind: 'user',
                id: principal.userId,
                label: principal.name,
              }),
            ),
          ),
    ),
  );

export const onTheWire = (
  group: {
    readonly requests: ReadonlyMap<
      string,
      { readonly payloadSchema: Schema.Codec<unknown, unknown> }
    >;
  },
  tag: string,
  payload: unknown,
): unknown => {
  const rpc = group.requests.get(tag);
  if (rpc === undefined) return payload;
  return Option.getOrElse(
    Schema.encodeUnknownOption(rpc.payloadSchema)(payload),
    () => payload,
  );
};

const recording =
  (client: StudioRpcClient, calls: RpcCall[]): StudioRpcClient =>
  (tag, payload, options) => {
    calls.push({ tag, payload: onTheWire(StudioRpcs, tag, payload) });
    return client(tag, payload, options);
  };

/**
 * Disposal uses `onTestFinished`, not `afterEach`: a hook registered inside a running
 * test does not run for that test.
 */
export function installRpcHarness(
  handlers: Partial<StudioHandlers>,
  options?: { readonly principal?: Principal['Service'] | null },
): RpcHarness {
  const calls: RpcCall[] = [];
  const principal =
    options?.principal === undefined ? HARNESS_PRINCIPAL : options.principal;

  const client = RpcTest.makeClient(StudioRpcs, { flatten: true }).pipe(
    Effect.provide(
      Layer.merge(
        StudioRpcs.toLayer({ ...unimplementedHandlers, ...handlers }),
        authenticatedLayer(principal),
      ),
    ),
    Effect.map((flat) => recording(flat, calls)),
  );

  const previous: WebRuntime = getWebRuntime();
  const runtime = makeWebRuntime(client);
  setWebRuntime(runtime);

  let disposed = false;
  const dispose = async (): Promise<void> => {
    if (disposed) return;
    disposed = true;
    setWebRuntime(previous);
    await runtime.dispose();
  };

  onTestFinished(dispose);

  return { calls, dispose };
}
