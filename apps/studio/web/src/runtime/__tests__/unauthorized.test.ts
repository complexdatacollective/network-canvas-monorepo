import { Effect, Predicate, Redacted } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChunkOf } from '@codaco/effect-query/types';
import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { Forbidden, Unauthorized } from '@codaco/studio-contract/schema/errors';
import { TeamId } from '@codaco/studio-contract/schema/ids';

import {
  reportUnauthorizedResponse,
  setUnauthorizedResponseHandler,
} from '../../lib/session.ts';
import { installFetchStub, problemResponse } from '../../test/fetchStub.ts';
import { HARNESS_PRINCIPAL, installRpcHarness } from '../../test/rpcHarness.ts';
import { rpcCall } from '../rpc.ts';
import { getWebRuntime, type StudioRpcsType } from '../runtime.ts';

const TEAM = TeamId.make('team-under-test');

const fetchStub = installFetchStub();

let reported: ReturnType<typeof vi.fn<() => Promise<void>>>;

beforeEach(() => {
  reported = vi.fn<() => Promise<void>>(() => Promise.resolve());
  setUnauthorizedResponseHandler(reported);
});

const rejectionOf = async (call: Promise<unknown>): Promise<unknown> =>
  call.then(
    () => {
      throw new Error('the call was expected to fail');
    },
    (error: unknown) => error,
  );

describe('an Unauthorized refusal', () => {
  it('is reported once, and still reaches the caller', async () => {
    installRpcHarness({}, { principal: null });

    const error = await rejectionOf(rpcCall('me', undefined));

    expect(error).toBeInstanceOf(Unauthorized);
    expect(reported).toHaveBeenCalledTimes(1);
  });

  it('is reported when the HTTP plane answers 401', async () => {
    fetchStub.mockImplementation(() =>
      Promise.resolve(
        problemResponse(401, { title: 'Unauthorized', status: 401 }),
      ),
    );

    await rejectionOf(rpcCall('me', undefined));

    expect(reported).toHaveBeenCalledTimes(1);
  });

  it('is reported for every call that is refused', async () => {
    installRpcHarness({}, { principal: null });

    await rejectionOf(rpcCall('me', undefined));
    await rejectionOf(rpcCall('studies.list', { teamId: TEAM }));

    expect(reported).toHaveBeenCalledTimes(2);
  });
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
    fetchStub.mockImplementation(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    );

    const error = await rejectionOf(rpcCall('status', undefined));

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
    const harness = installRpcHarness({
      'account.updateLocale': () =>
        Effect.map(Principal, (principal) => ({
          locale: Redacted.value(principal.email),
        })),
    });

    await expect(
      rpcCall('account.updateLocale', { locale: null }),
    ).resolves.toEqual({ locale: Redacted.value(HARNESS_PRINCIPAL.email) });

    expect(harness.calls).toEqual([
      { tag: 'account.updateLocale', payload: { locale: null } },
    ]);
  });

  // The next two cases must stay in this order: the second reads the runtime
  // the first installed.
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
    installRpcHarness({});

    const error = await rejectionOf(rpcCall('studies.list', { teamId: TEAM }));

    expect(String(error)).toContain('studies.list');
  });
});

describe('the report itself', () => {
  it('is whatever the router last registered', async () => {
    await reportUnauthorizedResponse();
    expect(reported).toHaveBeenCalledTimes(1);
  });
});

/**
 * Never called: `tsc` checks each `@ts-expect-error` below.
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

type Assert<Condition extends true> = Condition;

/** Deliberately not distributive: the question is about the whole union. */
type Extends<Subject, Bound> = [Subject] extends [Bound] ? true : false;

type Tags = StudioRpcsType['_tag'];

type StreamingTags = {
  [Tag in Tags]: [ChunkOf<StudioRpcsType, Tag>] extends [never] ? never : Tag;
}[Tags];

type UnaryTags = {
  [Tag in Tags]: [ChunkOf<StudioRpcsType, Tag>] extends [never] ? Tag : never;
}[Tags];

/**
 * The second assertion is the positive control for the first.
 */
const _streamingProbe = (): void => {
  const noStreamingRpc: Assert<Extends<StreamingTags, never>> = true;
  const everyTagIsUnary: Assert<Extends<Tags, UnaryTags>> = true;
  void noStreamingRpc;
  void everyTagIsUnary;
};
