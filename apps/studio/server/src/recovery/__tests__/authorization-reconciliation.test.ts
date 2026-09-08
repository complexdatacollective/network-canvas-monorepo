import { createHash } from 'node:crypto';
import { chmod, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  copyStudioRecoveryAuthorizationReconciliation,
  readStudioRecoveryAuthorizationReconciliation,
} from '../authorization-reconciliation.ts';

const sha = '1'.repeat(64);

function evidence() {
  return {
    format: 'studio-recovery-authorization-reconciliation' as const,
    version: 1 as const,
    issuedAt: '2026-09-08T00:00:00.000Z',
    expiresAt: '2026-09-09T00:00:00.000Z',
    instance: {
      name: 'Recovered Studio',
      initialOwnerUserId: 'owner',
      initialTeamId: 'team',
      completedAt: '2026-09-08T00:00:00.000Z',
    },
    users: [{ id: 'owner', email: 'owner@example.com', emailVerified: true }],
    accounts: [
      {
        id: 'account',
        userId: 'owner',
        issuer: 'local:credential',
        accountId: 'owner',
        providerId: 'credential',
        credentialSha256: sha,
      },
    ],
    teams: [{ id: 'team', slug: 'team' }],
    memberships: [
      { id: 'membership', teamId: 'team', userId: 'owner', roles: ['owner'] },
    ],
    studyGrants: [],
    activeWebhookSubscriptions: [],
    activeScheduleIds: [],
    publishedMessageTemplateIds: [],
  };
}

describe('Studio recovery authorization reconciliation evidence', () => {
  it('takes an immutable strict snapshot', () => {
    const source = evidence();
    const copy = copyStudioRecoveryAuthorizationReconciliation(source);
    source.users[0]!.id = 'mutated-after-validation';
    expect(copy.users[0]?.id).toBe('owner');
    expect(() =>
      copyStudioRecoveryAuthorizationReconciliation({
        ...evidence(),
        ignored: 'not part of the evidence contract',
      }),
    ).toThrow('STUDIO_RECOVERY_RECONCILIATION_INVALID');
  });

  it('refuses duplicate authorities and malformed hashes', () => {
    const duplicate = evidence();
    duplicate.memberships.push({ ...duplicate.memberships[0]! });
    expect(() =>
      copyStudioRecoveryAuthorizationReconciliation(duplicate),
    ).toThrow('STUDIO_RECOVERY_RECONCILIATION_INVALID');
    expect(() =>
      copyStudioRecoveryAuthorizationReconciliation({
        ...evidence(),
        accounts: [{ ...evidence().accounts[0], credentialSha256: 'short' }],
      }),
    ).toThrow('STUDIO_RECOVERY_RECONCILIATION_INVALID');
  });

  it('reads only an exact private regular artifact', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'studio-recovery-evidence-'),
    );
    const path = join(directory, 'reconciliation.json');
    const bytes = Buffer.from(JSON.stringify(evidence()));
    const digest = createHash('sha256').update(bytes).digest('hex');
    await writeFile(path, bytes, { mode: 0o600 });
    await expect(
      readStudioRecoveryAuthorizationReconciliation(path, digest),
    ).resolves.toMatchObject({ sha256: digest });
    await expect(
      readStudioRecoveryAuthorizationReconciliation(path, '0'.repeat(64)),
    ).rejects.toThrow('STUDIO_RECOVERY_RECONCILIATION_INVALID');
    await chmod(path, 0o640);
    await expect(
      readStudioRecoveryAuthorizationReconciliation(path, digest),
    ).rejects.toThrow('STUDIO_RECOVERY_RECONCILIATION_INVALID');
    await chmod(path, 0o600);
    const linked = join(directory, 'linked.json');
    await symlink(path, linked);
    await expect(
      readStudioRecoveryAuthorizationReconciliation(linked, digest),
    ).rejects.toThrow('STUDIO_RECOVERY_RECONCILIATION_INVALID');
  });
});
