// `status.updateAvailable` (#1901): who is told about a newer release, and when.
//
// The stored release is a stub here: the worker's update check records it and
// `readLatestRelease` reads it, and neither is what these cases are about. They
// are about the decision the handler makes on top of it, so the read is
// replaced by a value the test chooses and everything else — the contract, the
// handler, the owner lookup — is the real thing.
import { Effect, Layer } from 'effect';
import { RpcTest } from 'effect/rpc';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Authenticated,
  Principal,
} from '@codaco/studio-contract/middleware/authenticated';
import { StatusRpcs } from '@codaco/studio-contract/rpc/status';
import { UserId } from '@codaco/studio-contract/schema/ids';

import { provideCaller } from '../audit/actor.ts';
import { DatabaseAbsent } from '../db/client.ts';
import type { LatestRelease } from '../db/deployment-state.ts';
import { getDeploymentStatus } from '../domain.ts';
import type { RpcDeps } from '../rpc/deps.ts';
import { StatusHandlers } from '../rpc/handlers/status.ts';
import type { Installation } from '../setup/bootstrap.ts';

const stored = vi.hoisted(() => ({
  read: vi.fn<() => LatestRelease | null>(),
}));

vi.mock('../db/deployment-state.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../db/deployment-state.ts')>()),
  readLatestRelease: () => Effect.sync(stored.read),
}));

// The running version is pinned so "newer", "equal" and "older" are written
// as literals instead of being derived from package.json.
vi.mock('../version.ts', () => ({ STUDIO_VERSION: '1.2.3' }));

const OWNER_ID = 'owner-user';

const release = (version: string, schemaChange = false): LatestRelease => ({
  version,
  releasedAt: new Date('2026-10-01T09:30:00Z'),
  notesUrl: `https://releases.networkcanvas.com/studio/${version}`,
  schemaChange,
});

const principalFor = (userId: string): Principal['Service'] =>
  Principal.of({
    kind: 'user',
    userId: UserId.make(userId),
    email: `${userId}@example.org`,
    emailVerified: true,
    name: userId,
    locale: null,
    sessionId: `${userId}-session`,
  });

const installation = (ownerUserId: string | null): Installation => ({
  name: 'Our Studio',
  ownerUserId,
  bootstrapTokenHash: null,
});

async function askAs(
  userId: string,
  readInstallation: RpcDeps['readInstallation'],
) {
  const deps: RpcDeps = {
    capabilities: {
      enabled: false,
      magicLink: false,
      emailAndPassword: false,
      socialProviders: [],
    },
    deployment: getDeploymentStatus('self-hosted'),
    readInstallation,
  };
  const authenticated = Layer.succeed(Authenticated)(
    Authenticated.of(provideCaller(principalFor(userId))),
  );
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(StatusRpcs, { flatten: true });
        return yield* client('status.updateAvailable', undefined);
      }),
    ).pipe(
      Effect.provide(
        Layer.merge(
          StatusHandlers(deps).pipe(Layer.provide(DatabaseAbsent)),
          authenticated,
        ),
      ),
    ),
  );
}

const ownedBy = (ownerUserId: string | null) => () =>
  Promise.resolve(installation(ownerUserId));

describe('status.updateAvailable', () => {
  afterEach(() => {
    stored.read.mockReset();
  });

  it('tells the owner about a newer release, with the four fields and no more', async () => {
    stored.read.mockReturnValue(release('1.3.0', true));

    const answer = await askAs(OWNER_ID, ownedBy(OWNER_ID));

    expect(answer).toEqual({
      version: '1.3.0',
      releasedAt: new Date('2026-10-01T09:30:00Z'),
      notesUrl: 'https://releases.networkcanvas.com/studio/1.3.0',
      schemaChange: true,
    });
  });

  it('tells a signed-in user who is not the owner nothing, even with a newer release stored', async () => {
    stored.read.mockReturnValue(release('1.3.0'));

    expect(await askAs('someone-else', ownedBy(OWNER_ID))).toBeNull();
    // A refusal that still read the row would be a quiet cost on every page
    // load for every researcher.
    expect(stored.read).not.toHaveBeenCalled();
  });

  it('tells nobody while first-run setup is open and the instance has no owner', async () => {
    stored.read.mockReturnValue(release('1.3.0'));

    expect(await askAs('someone-else', ownedBy(null))).toBeNull();
  });

  it('tells nobody when there is no installation to read', async () => {
    stored.read.mockReturnValue(release('1.3.0'));

    expect(await askAs(OWNER_ID, () => Promise.resolve(null))).toBeNull();
  });

  it('tells the owner nothing when no release has been recorded', async () => {
    stored.read.mockReturnValue(null);

    expect(await askAs(OWNER_ID, ownedBy(OWNER_ID))).toBeNull();
  });

  it.each([
    ['equal to', '1.2.3'],
    ['an earlier patch than', '1.2.2'],
    ['an earlier minor than', '1.1.9'],
    ['an earlier major than', '0.9.9'],
  ])(
    'tells the owner nothing when the stored release is %s the running one',
    async (_relation, version) => {
      stored.read.mockReturnValue(release(version));

      expect(await askAs(OWNER_ID, ownedBy(OWNER_ID))).toBeNull();
      // The row was consulted: the null is the version comparison's, not a
      // short-circuit's.
      expect(stored.read).toHaveBeenCalledTimes(1);
    },
  );

  it('compares versions as numbers, not as text', async () => {
    // "1.10.0" sorts before "1.2.3" as a string, and is the newer release.
    stored.read.mockReturnValue(release('1.10.0'));

    expect(await askAs(OWNER_ID, ownedBy(OWNER_ID))).toMatchObject({
      version: '1.10.0',
    });
  });
});
