import { Effect, Predicate } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChunkOf } from '@codaco/effect-query/types';
import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { Forbidden, Unauthorized } from '@codaco/studio-contract/schema/errors';
import { TeamId } from '@codaco/studio-contract/schema/ids';

import {
  reportUnauthorizedResponse,
  setUnauthorizedResponseHandler,
} from '../../lib/session.ts';
import { installFetchStub } from '../../test/fetchStub.ts';
import { HARNESS_PRINCIPAL, installRpcHarness } from '../../test/rpcHarness.ts';
import { rpcCall } from '../rpc.ts';
import { getWebRuntime, type StudioRpcsType } from '../runtime.ts';

// §6.2's rule: the client never decides the session state itself, it only
// reports the refusal and lets the router re-ask. What that turns into here is
// four cases — one refusal that must be reported, and three failures that must
// not be, because a `Forbidden` mistaken for a sign-out signs a researcher out
// of a team they are still a member of.
//
// The transform is proved through the adapter's funnel rather than at either of
// the two seams that look right. `RpcMiddleware.layerClient` wraps only the
// send of a request and never sees the response; `transformClient` sits at the
// HTTP layer, where an rpc failure is a 200.

const TEAM = TeamId.make('team-under-test');

const fetchStub = installFetchStub();

let reported: ReturnType<typeof vi.fn<() => Promise<void>>>;

beforeEach(() => {
  reported = vi.fn<() => Promise<void>>(() => Promise.resolve());
  setUnauthorizedResponseHandler(reported);
});

/** The rejection of a call that must fail. */
const rejectionOf = async (call: Promise<unknown>): Promise<unknown> =>
  call.then(
    () => {
      throw new Error('the call was expected to fail');
    },
    (error: unknown) => error,
  );

describe('an Unauthorized refusal', () => {
  it('is reported once, and still reaches the caller', async () => {
    // `principal: null` is the middleware refusing, which is exactly what a
    // server whose cookie has expired does.
    installRpcHarness({}, { principal: null });

    const error = await rejectionOf(rpcCall('me', undefined));

    expect(error).toBeInstanceOf(Unauthorized);
    expect(reported).toHaveBeenCalledTimes(1);
  });

  it('is reported for every call that is refused', async () => {
    installRpcHarness({}, { principal: null });

    await rejectionOf(rpcCall('me', undefined));
    await rejectionOf(rpcCall('studies.list', { teamId: TEAM }));

    expect(reported).toHaveBeenCalledTimes(2);
  });

  // There is no streaming procedure on this plane to cover: every `StudioRpcs`
  // rpc is unary (the streaming plane is `StudioStreams`, served at /ws, and
  // stage 8's work). The adapter funnels a stream's failures too, through
  // `Stream.runForEach`'s fiber in `useRpcStream`, and that is proved in
  // `packages/effect-query/src/__tests__/adapter.test.tsx`. `_streamingProbe`
  // below is what says no case is missing here, and it fails `tsc` the day a
  // streaming procedure joins the rpc plane without one.
});

describe('a failure that is not a lost session', () => {
  it('is not reported when a handler refuses with Forbidden', async () => {
    installRpcHarness({
      'studies.list': () => Effect.fail(new Forbidden({})),
    });

    const error = await rejectionOf(rpcCall('studies.list', { teamId: TEAM }));

    expect(error).toBeInstanceOf(Forbidden);
    expect(reported).not.toHaveBeenCalled();
  });

  it('is not reported when a handler answers', async () => {
    installRpcHarness({ 'studies.list': () => Effect.succeed([]) });

    await expect(rpcCall('studies.list', { teamId: TEAM })).resolves.toEqual(
      [],
    );

    expect(reported).not.toHaveBeenCalled();
  });

  it('is not reported when the request never arrives', async () => {
    // No harness here: this one goes over the real transport, because a
    // transport failure is the one case the in-process client cannot produce.
    fetchStub.mockImplementation(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    );

    const error = await rejectionOf(rpcCall('status', undefined));

    // The rejection has to be the browser's, not the harness's.
    // `installFetchStub`'s default answer rejects too — with "the fetch stub
    // has no answer for this URL" — so on `reported` alone this case stays
    // green with the `mockImplementation` above deleted, and would then be
    // about an unstubbed URL rather than about a socket that never connected.
    // What tells the two apart is only the value `fetch` threw, which the
    // client hands back wrapped twice: `RpcClientError` carries the HTTP
    // layer's `RequestError` as its `reason`'s cause, and that carries the
    // throw.
    const thrown =
      Predicate.hasProperty(error, 'reason') &&
      Predicate.hasProperty(error.reason, 'cause') &&
      Predicate.hasProperty(error.reason.cause, 'cause')
        ? error.reason.cause.cause
        : error;
    expect(thrown).toBeInstanceOf(TypeError);
    expect(thrown).toHaveProperty('message', 'Failed to fetch');

    expect(reported).not.toHaveBeenCalled();
  });
});

describe('the harness', () => {
  it('signs the suite in as a researcher its handlers can read', async () => {
    // The positive control for `principal: null` above: without it, "the call
    // was refused" would also be satisfied by a harness that never provided a
    // principal at all.
    const harness = installRpcHarness({
      'account.updateLocale': () =>
        Effect.map(Principal, (principal) => ({ locale: principal.email })),
    });

    await expect(
      rpcCall('account.updateLocale', { locale: null }),
    ).resolves.toEqual({ locale: HARNESS_PRINCIPAL.email });

    // And what a suite asserts a screen asked for, in the order it asked.
    expect(harness.calls).toEqual([
      { tag: 'account.updateLocale', payload: { locale: null } },
    ]);
  });

  // These two are one case in two parts, and they have to be read in order:
  // the harness disposes itself when the test that installed it finishes, and
  // the only way to see that from a test is from the next one. Without it, a
  // harness registered through `afterEach` — which does not run for a test that
  // registered it from its own body — would leak its runtime into every later
  // test in the file, and the case below that needs the real transport would
  // quietly be talking to this one's handlers instead.
  //
  // The second case depends on the first having run: it reads the runtime the
  // first installed, so the pair must stay in this order and in this file, and
  // neither is meaningful on its own (`it.only` on the second asserts nothing,
  // because `installed` is then undefined and the expectation that it is
  // defined fails rather than passing vacuously).
  let installed: ReturnType<typeof getWebRuntime> | undefined;

  it('installs a runtime of its own', () => {
    const before = getWebRuntime();
    installRpcHarness({});
    installed = getWebRuntime();
    expect(installed).not.toBe(before);
  });

  it('has put the previous runtime back by the next test', () => {
    expect(installed).toBeDefined();
    expect(getWebRuntime()).not.toBe(installed);
  });

  it('restores the runtime it replaced when disposed by hand', async () => {
    const before = getWebRuntime();
    const harness = installRpcHarness({});
    expect(getWebRuntime()).not.toBe(before);

    await harness.dispose();

    expect(getWebRuntime()).toBe(before);
  });

  it('names the procedure a suite forgot to implement', async () => {
    // A handler that answered `undefined` would let a screen render something
    // the server could never have sent, and the suite would pass on a fixture
    // that is not there.
    installRpcHarness({});

    const error = await rejectionOf(rpcCall('studies.list', { teamId: TEAM }));

    expect(String(error)).toContain('studies.list');
  });
});

describe('the report itself', () => {
  it('is whatever the router last registered', async () => {
    // `router.tsx`'s `setUnauthorizedResponseHandler` registration is unchanged
    // by this stage, and this is the seam it registers through.
    await reportUnauthorizedResponse();
    expect(reported).toHaveBeenCalledTimes(1);
  });
});

/**
 * Never called and never exported — `tsc` still checks the body. Each
 * `@ts-expect-error` fails the typecheck if the mistake below it ever becomes
 * legal, which is the whole reason the harness takes real handlers rather than
 * a `queryOptions` shim: a fixture that has drifted from the contract is a
 * compile error rather than a green suite.
 */
const _typeProbes = () => {
  // @ts-expect-error — 'nope' is not a procedure of StudioRpcs.
  installRpcHarness({ nope: () => Effect.succeed('x') });
  // @ts-expect-error — `studies.list` answers study summaries, not a string.
  installRpcHarness({ 'studies.list': () => Effect.succeed('x') });
  installRpcHarness({
    // @ts-expect-error — `studies.list` may only fail with what it declares.
    'studies.list': () => Effect.fail(new Unauthorized({})),
  });
  // @ts-expect-error — 'nope' is not a tag.
  void rpcCall('nope', {});
  // @ts-expect-error — `studies.list` needs a teamId.
  void rpcCall('studies.list', {});
  // @ts-expect-error — a teamId is branded; a bare string will not do.
  void rpcCall('studies.list', { teamId: 'team-under-test' });
};

/** Fails to compile unless `Condition` is exactly `true`. */
type Assert<Condition extends true> = Condition;

/** Deliberately not distributive: the question is about the whole union. */
type Extends<Subject, Bound> = [Subject] extends [Bound] ? true : false;

type Tags = StudioRpcsType['_tag'];

/** `ChunkOf` is the stream's element type, and `never` for a unary rpc. */
type StreamingTags = {
  [Tag in Tags]: [ChunkOf<StudioRpcsType, Tag>] extends [never] ? never : Tag;
}[Tags];

type UnaryTags = {
  [Tag in Tags]: [ChunkOf<StudioRpcsType, Tag>] extends [never] ? Tag : never;
}[Tags];

/**
 * The rpc plane is unary end to end, which is why the cases above cover it
 * completely. The second assertion is the positive control: without it, a
 * `ChunkOf` that answered `never` for everything — including a real stream —
 * would satisfy the first.
 */
const _streamingProbe = (): void => {
  const noStreamingRpc: Assert<Extends<StreamingTags, never>> = true;
  const everyTagIsUnary: Assert<Extends<Tags, UnaryTags>> = true;
  void noStreamingRpc;
  void everyTagIsUnary;
};
