import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import recoveryFixture from '../../../studio/server/qualification/combined-recovery.fixture.json' with { type: 'json' };
import {
  createRegistryRecoveryArtifact,
  emptyRegistryRecoveryReconciliation,
  createRegistryRecoveryReconciliation,
  seedRegistryRecoveryFixture,
} from '../../../studio/server/qualification/registry-recovery-fixture.ts';
import {
  copyRegistryRecoveryReconciliation,
  createRegistryRecoveryInventory,
} from '../recovery-reconciliation.ts';
import { createRegistryFixture, type RegistryFixture } from './fixtures.ts';

it('builds the actual populated recovery artifact through the exchange admission checks', async () => {
  const built = await createRegistryRecoveryArtifact();
  expect(built.artifact.assets).toHaveLength(1);
  expect(built.artifact.assets[0]).toMatchObject({
    hash: recoveryFixture.registry.object.sha256,
    media_type: 'text/csv',
    media_class: 'dataset',
    bytes: Uint8Array.from(
      Buffer.from(recoveryFixture.registry.object.bytesBase64, 'base64'),
    ),
  });
});

describe('Registry distribution recovery fixture', () => {
  let fixture: RegistryFixture;
  beforeEach(async () => {
    fixture = await createRegistryFixture();
  });
  afterEach(async () => {
    await fixture?.dispose();
  });

  it('seeds the real migrated database with independently approved user and entry ownership', async () => {
    const artifact = await createRegistryRecoveryArtifact();
    const approved = createRegistryRecoveryReconciliation(
      artifact.artifact.manifest.merkle_root,
    );
    await seedRegistryRecoveryFixture(fixture.owner, artifact);
    const users = await fixture.owner.query(
      `SELECT id,email,email_verified AS "emailVerified" FROM registry_auth_user ORDER BY id COLLATE "C"`,
    );
    const publishers = await fixture.owner.query(
      `SELECT id,user_id AS "userId",suspended_at IS NOT NULL AS suspended FROM registry_publishers ORDER BY id`,
    );
    const entries = await fixture.owner.query(
      `SELECT id,publisher_id AS "publisherId",artifact_root AS "artifactRoot" FROM registry_entries ORDER BY id`,
    );
    expect(users.rows).toEqual([
      {
        id: recoveryFixture.registry.userId,
        email: recoveryFixture.registry.email,
        emailVerified: true,
      },
    ]);
    expect(publishers.rows).toEqual([
      {
        id: recoveryFixture.registry.publisherId,
        userId: recoveryFixture.registry.userId,
        suspended: false,
      },
    ]);
    expect(entries.rows).toEqual([
      {
        id: recoveryFixture.registry.entryId,
        publisherId: recoveryFixture.registry.publisherId,
        artifactRoot: artifact.artifact.manifest.merkle_root,
      },
    ]);
    const operators = await fixture.owner.query(
      `SELECT user_id AS "userId" FROM registry_operators WHERE enabled ORDER BY user_id COLLATE "C"`,
    );
    expect(operators.rows).toEqual([]);
    expect(approved.inventories).toEqual({
      users: createRegistryRecoveryInventory('users', users.rows),
      publishers: createRegistryRecoveryInventory(
        'publishers',
        publishers.rows,
      ),
      operators: createRegistryRecoveryInventory('operators', operators.rows),
      entries: createRegistryRecoveryInventory('entries', entries.rows),
    });
    expect(copyRegistryRecoveryReconciliation(approved)).toEqual(approved);
    expect(
      createRegistryRecoveryReconciliation('f'.repeat(64)).inventories.entries
        .sha256,
    ).not.toEqual(approved.inventories.entries.sha256);
    expect(
      copyRegistryRecoveryReconciliation(emptyRegistryRecoveryReconciliation),
    ).toEqual(emptyRegistryRecoveryReconciliation);
    expect(
      (
        await fixture.owner.query(`SELECT
      (SELECT count(*)::int FROM registry_auth_session) sessions,
      (SELECT count(*)::int FROM registry_auth_verification) verifications,
      (SELECT count(*)::int FROM registry_credentials) credentials,
      (SELECT count(*)::int FROM registry_artifacts) artifacts,
      (SELECT count(*)::int FROM registry_artifact_content) contents`)
      ).rows,
    ).toEqual([
      {
        sessions: 1,
        verifications: 1,
        credentials: 1,
        artifacts: 1,
        contents: 1,
      },
    ]);
  });

  it('leaves no partial authority or artifact when the final fixture insert fails', async () => {
    await fixture.owner.query(
      'ALTER TABLE registry_entries ADD CONSTRAINT qualification_reject CHECK (false)',
    );
    await expect(
      seedRegistryRecoveryFixture(
        fixture.owner,
        await createRegistryRecoveryArtifact(),
      ),
    ).rejects.toThrow();
    expect(
      (
        await fixture.owner.query(`SELECT
      (SELECT count(*)::int FROM registry_auth_user) users,
      (SELECT count(*)::int FROM registry_publishers) publishers,
      (SELECT count(*)::int FROM registry_credentials) credentials,
      (SELECT count(*)::int FROM registry_artifacts) artifacts,
      (SELECT count(*)::int FROM registry_artifact_content) contents`)
      ).rows,
    ).toEqual([
      { users: 0, publishers: 0, credentials: 0, artifacts: 0, contents: 0 },
    ]);
  });
});
