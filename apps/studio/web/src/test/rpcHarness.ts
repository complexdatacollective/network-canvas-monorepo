import { Effect, Layer } from 'effect';
import type { RpcGroup } from 'effect/unstable/rpc';
import { RpcTest } from 'effect/unstable/rpc';
import { onTestFinished } from 'vitest';

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

// The replacement for `vi.mock('../../lib/api.ts')`.
//
// One generic `rpcQuery` has no per-procedure namespace to stub, and stubbing
// it would throw away the key derivation and the typed errors the migration
// exists to gain. So a suite gets a real client instead: `RpcTest.makeClient`
// runs the ordinary client and server machinery with no transport and no
// serialization at all — which works in jsdom — and the fixtures below are
// typechecked against the contract, so a handler whose payload or success shape
// has drifted fails `tsc` rather than passing against a stale stub.

type StudioRpcsType = RpcGroup.Rpcs<typeof StudioRpcs>;

/** Every handler of the group, keyed by tag. A suite supplies the ones it needs. */
export type StudioHandlers = RpcGroup.HandlersFrom<StudioRpcsType>;

/** One call a suite's screen made, in the order the client made them. */
export type RpcCall = {
  readonly tag: string;
  readonly payload: unknown;
};

export type RpcHarness = {
  /** Live: read it after the assertion that waited for the call. */
  readonly calls: ReadonlyArray<RpcCall>;
  readonly dispose: () => Promise<void>;
};

/**
 * What a procedure the suite did not implement does.
 *
 * A defect rather than a failure, and one that names the tag: a handler that
 * answered `undefined` would let a screen render something the server could
 * never have sent, and a suite would pass on a fixture that is not there. The
 * tag is in the message because the caller of a generic `rpcQuery` is a
 * screen, and the stack alone does not say which procedure it asked for.
 */
const unimplemented = (tag: string) => () =>
  Effect.die(
    new Error(`the rpc harness has no handler for the procedure "${tag}"`),
  );

/**
 * Written out per tag rather than generated from `StudioRpcs.requests`, so that
 * a procedure added to the contract fails `tsc` here — `toLayer` demands every
 * handler — instead of reaching a suite as a silent `undefined`.
 */
const unimplementedHandlers: StudioHandlers = {
  'account.updateLocale': unimplemented('account.updateLocale'),
  'audit.filterOptions': unimplemented('audit.filterOptions'),
  'audit.get': unimplemented('audit.get'),
  'audit.list': unimplemented('audit.list'),
  'me': unimplemented('me'),
  'protocols.addInformationStage': unimplemented(
    'protocols.addInformationStage',
  ),
  'protocols.create': unimplemented('protocols.create'),
  'protocols.draft': unimplemented('protocols.draft'),
  'protocols.list': unimplemented('protocols.list'),
  'protocols.moveStage': unimplemented('protocols.moveStage'),
  'setup.complete': unimplemented('setup.complete'),
  'status': unimplemented('status'),
  'studies.counts': unimplemented('studies.counts'),
  'studies.create': unimplemented('studies.create'),
  'studies.get': unimplemented('studies.get'),
  'studies.list': unimplemented('studies.list'),
  'team.acceptInvitation': unimplemented('team.acceptInvitation'),
  'team.cancelInvitation': unimplemented('team.cancelInvitation'),
  'team.createInvitation': unimplemented('team.createInvitation'),
  'team.updateMemberRole': unimplemented('team.updateMemberRole'),
};

/** The researcher a suite is signed in as unless it says otherwise. */
export const HARNESS_PRINCIPAL: Principal['Service'] = Principal.of({
  kind: 'user',
  userId: UserId.make('harness-user'),
  email: 'researcher@example.org',
  emailVerified: true,
  name: 'Harness Researcher',
  locale: null,
  sessionId: 'harness-session',
});

/**
 * The server half of `Authenticated`. `null` is the whole point of the option:
 * it is how a suite drives the refusal that makes the client report a lost
 * session, without a transport to answer 401 from.
 */
const authenticatedLayer = (
  principal: Principal['Service'] | null,
): Layer.Layer<Authenticated> =>
  Layer.succeed(Authenticated)(
    Authenticated.of((effect) =>
      principal === null
        ? Effect.fail(new Unauthorized({}))
        : Effect.provideService(effect, Principal, principal),
    ),
  );

/**
 * Records every call before it reaches a handler, so a suite can assert what a
 * screen asked for as well as what it rendered. The client is one callable
 * (`flatten: true`), so one wrapper covers all twenty procedures.
 */
const recording =
  (client: StudioRpcClient, calls: RpcCall[]): StudioRpcClient =>
  (tag, payload, options) => {
    calls.push({ tag, payload });
    return client(tag, payload, options);
  };

/**
 * Installs an in-process Studio rpc client as the web runtime for one test.
 *
 * Call it from a test body or from `beforeEach`; a call from a `describe` body
 * throws, which is the right refusal — a harness built once for a whole file
 * would share one client and one call log between tests that each expect their
 * own.
 *
 * Disposal is registered here rather than left to the caller: the runtime owns
 * a scope and has replaced the web's, so a suite that forgot to close it would
 * leak a client per test and leave the next one talking to this one's handlers.
 * `onTestFinished` rather than `afterEach`, deliberately — a hook registered
 * from inside a running test does not run for that test, so `afterEach` here
 * would dispose nothing at all in a suite that installs the harness in its test
 * bodies.
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
