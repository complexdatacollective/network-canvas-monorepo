import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import recoveryFixture from '../../../studio/server/qualification/combined-recovery.fixture.json' with { type: 'json' };
import {
  createRegistryRecoveryArtifact,
  emptyRegistryRecoveryReconciliation,
  registryRecoveryReconciliation,
  seedRegistryRecoveryFixture,
} from '../../../studio/server/qualification/registry-recovery-fixture.ts';
import { copyRegistryRecoveryReconciliation } from '../recovery-reconciliation.ts';
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
    await seedRegistryRecoveryFixture(
      fixture.owner,
      await createRegistryRecoveryArtifact(),
    );
    const users = await fixture.owner
      .query(`SELECT u.id,u.email,u.email_verified AS "emailVerified",
      p.id AS "publisherId", 'active' AS publisher, false AS operator
      FROM registry_auth_user u JOIN registry_publishers p ON p.user_id=u.id`);
    const entries = await fixture.owner.query(
      `SELECT id,publisher_id AS "publisherId" FROM registry_entries`,
    );
    expect(users.rows).toEqual(registryRecoveryReconciliation.users);
    expect(entries.rows).toEqual(registryRecoveryReconciliation.entries);
    expect(
      copyRegistryRecoveryReconciliation(registryRecoveryReconciliation),
    ).toEqual(registryRecoveryReconciliation);
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
