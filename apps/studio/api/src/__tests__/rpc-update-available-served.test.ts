// `status.updateAvailable` served for real (#1901): signed-in sessions over the
// real handler, the real `installation` owner lookup and the real
// `deployment_state` row the worker's check writes. `rpc-update-available.test.ts`
// owns the decision table over a stubbed read; this is the end-to-end claim that
// the owner sees the release the check recorded and that nobody else does.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Studio } from '../app.ts';
import {
  type LatestRelease,
  recordUpdateCheck,
} from '../db/deployment-state.ts';
import { MaintenanceScope } from '../db/tenant.ts';
import { readEnv } from '../env.ts';
import { STUDIO_VERSION } from '../version.ts';
import { signInWithMagicLink } from './support/auth.ts';
import {
  openTestDatabase,
  ownerAffected,
  type TestDatabaseRuntime,
  testDb,
} from './support/database.ts';
import {
  createRpcClient,
  expectRpcFailure,
  type RpcTestClient,
} from './support/rpc.ts';

const env = readEnv();

// A release no build of this package will have reached.
const NEWER: LatestRelease = {
  version: '999.0.0',
  releasedAt: new Date('2026-10-06T14:30:00.000Z'),
  notesUrl: 'https://releases.networkcanvas.com/studio/999.0.0/notes',
  schemaChange: true,
};

describe.skipIf(!testDb)('status.updateAvailable, served', () => {
  let database: TestDatabaseRuntime;
  let studio: Studio;
  let ownerClient: RpcTestClient;
  let otherClient: RpcTestClient;
  let anonymousClient: RpcTestClient;

  beforeAll(async () => {
    database = await openTestDatabase();
    const owner = await signInWithMagicLink(
      env,
      'update-owner',
      database.services,
    );
    studio = owner.studio;
    ownerClient = await createRpcClient(studio, { cookie: owner.cookie });
    const other = await signInWithMagicLink(
      env,
      'update-other',
      database.services,
    );
    otherClient = await createRpcClient(other.studio, { cookie: other.cookie });
    anonymousClient = await createRpcClient(studio);

    const ownerId = (await ownerClient.call(ownerClient.rpc('me', undefined)))
      .userId;
    await database.run(ownerAffected('delete from installation'));
    await database.run(
      ownerAffected(
        'insert into installation (id, owner_user_id) values (1, $1)',
        [ownerId],
      ),
    );
  });
  afterAll(async () => {
    await database.run(ownerAffected('delete from installation'));
    await ownerClient.dispose();
    await otherClient.dispose();
    await anonymousClient.dispose();
    await database.dispose();
  });

  beforeEach(async () => {
    await database.run(
      ownerAffected(
        `update deployment_state
            set latest_version = null, latest_released_at = null,
                latest_notes_url = null, latest_schema_change = null,
                checked_at = null`,
      ),
    );
  });

  const askAs = (client: RpcTestClient) =>
    client.call(client.rpc('status.updateAvailable', undefined));

  const record = (release: LatestRelease) =>
    database.run(MaintenanceScope.open(recordUpdateCheck(release)));

  it('tells the owner about the release the check recorded, and nobody else', async () => {
    await record(NEWER);

    expect(await askAs(ownerClient)).toEqual(NEWER);
    expect(await askAs(otherClient)).toBeNull();
    await expectRpcFailure(
      anonymousClient.callExit(
        anonymousClient.rpc('status.updateAvailable', undefined),
      ),
      'Unauthorized',
    );
  });

  it('tells the owner nothing before a check has recorded a release', async () => {
    expect(await askAs(ownerClient)).toBeNull();
  });

  it('tells the owner nothing about the release they are running', async () => {
    await record({ ...NEWER, version: STUDIO_VERSION });

    expect(await askAs(ownerClient)).toBeNull();
  });
});
