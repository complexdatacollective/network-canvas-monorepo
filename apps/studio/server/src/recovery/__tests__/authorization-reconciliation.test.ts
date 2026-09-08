import { execFile } from 'node:child_process';
import {
  createHash,
  generateKeyPairSync,
  sign as signBytes,
} from 'node:crypto';
import { once } from 'node:events';
import { chmod, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import { canonicalize } from '@codaco/studio-sync/apply';

import {
  copyStudioRecoveryAuthorizationReconciliation,
  readExactRecoveryArtifactBytes,
  readStudioRecoveryAuthorizationReconciliation,
  readStudioRecoveryAuthorizationReconciliationBytes,
  type VerifiedStudioRecoveryAuthorizationEvidence,
  verifyStudioRecoveryAuthorizationEvidence,
} from '../authorization-reconciliation.ts';
import { authorizeCurrentStudioRecovery } from '../authorization.ts';

const sha = '1'.repeat(64);
const runFile = promisify(execFile);

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
    eligibleUserIds: ['owner'],
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
  it('verifies exact canonical bytes with an independently identified Ed25519 key', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const bytes = Buffer.from(canonicalize(evidence()));
    const signature = signBytes(null, bytes, privateKey).toString('base64url');
    const publicKeyBytes = publicKey.export({ format: 'jwk' }).x!;
    const verified = verifyStudioRecoveryAuthorizationEvidence({
      bytes,
      expectedSha256: createHash('sha256').update(bytes).digest('hex'),
      signature,
      authorityKeyId: 'offline-recovery-2026',
      authorityPublicKey: publicKeyBytes,
    });
    expect(verified).toMatchObject({
      reconciliation: { eligibleUserIds: ['owner'] },
      authority: { keyId: 'offline-recovery-2026' },
    });
    expect(Object.isFrozen(verified.reconciliation.eligibleUserIds)).toBe(true);
  });

  it('refuses tampered, noncanonical and over-depth evidence without echoing it', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicKeyBytes = publicKey.export({ format: 'jwk' }).x!;
    const verify =
      (bytes: Buffer, signatureBytes = bytes) =>
      () =>
        verifyStudioRecoveryAuthorizationEvidence({
          bytes,
          expectedSha256: createHash('sha256').update(bytes).digest('hex'),
          signature: signBytes(null, signatureBytes, privateKey).toString(
            'base64url',
          ),
          authorityKeyId: 'offline-recovery-2026',
          authorityPublicKey: publicKeyBytes,
        });
    const canonical = Buffer.from(canonicalize(evidence()));
    const tampered = Buffer.from(canonical);
    tampered[tampered.length - 2] = tampered[tampered.length - 2]! ^ 1;
    expect(verify(tampered, canonical)).toThrow(
      'STUDIO_RECOVERY_RECONCILIATION_INVALID',
    );
    const pretty = Buffer.from(JSON.stringify(evidence(), null, 2));
    expect(verify(pretty)).toThrow('STUDIO_RECOVERY_RECONCILIATION_INVALID');
    const tooDeep = Buffer.from(`${'['.repeat(65)}0${']'.repeat(65)}`);
    expect(verify(tooDeep)).toThrow('STUDIO_RECOVERY_RECONCILIATION_INVALID');
    expect(() =>
      verifyStudioRecoveryAuthorizationEvidence({
        bytes: { byteLength: 64 * 1024 * 1024 + 1 } as Uint8Array,
        expectedSha256: sha,
        signature: 'tainted-signature',
        authorityKeyId: 'offline-recovery-2026',
        authorityPublicKey: publicKeyBytes,
      }),
    ).toThrow('STUDIO_RECOVERY_RECONCILIATION_INVALID');
  });

  it('rejects a fabricated verification result before database I/O', async () => {
    let connections = 0;
    const pool = {
      connect: () => {
        connections += 1;
        throw new Error('must not connect');
      },
    } as unknown as pg.Pool;
    await expect(
      authorizeCurrentStudioRecovery({
        pool,
        backupPool: pool,
        policy: { allowedLogins: [], administrativeLogins: [] },
        evidence: {
          reconciliation: evidence(),
          sha256: sha,
          authority: { keyId: 'forged', publicKeySha256: sha },
        } as VerifiedStudioRecoveryAuthorizationEvidence,
      }),
    ).rejects.toThrow('STUDIO_RECOVERY_RECONCILIATION_INVALID');
    expect(connections).toBe(0);
  });

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
      readStudioRecoveryAuthorizationReconciliationBytes(path, digest),
    ).resolves.toEqual({ sha256: digest, bytes });
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

  it('caps a growing artifact read at the observed size plus one byte', async () => {
    let totalRead = 0;
    let largestRequest = 0;
    const reader = {
      async read(
        buffer: Buffer,
        offset: number,
        length: number,
        _position: null,
      ) {
        largestRequest = Math.max(largestRequest, length);
        buffer.fill(0x61, offset, offset + length);
        totalRead += length;
        return { bytesRead: length };
      },
    };
    await expect(readExactRecoveryArtifactBytes(reader, 4)).rejects.toThrow(
      'STUDIO_RECOVERY_RECONCILIATION_INVALID',
    );
    expect(totalRead).toBe(5);
    expect(largestRequest).toBe(5);
  });

  it('refuses an invalid signature in the real CLI before opening a database socket', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'studio-recovery-authorize-cli-'),
    );
    const path = join(directory, 'reconciliation.json');
    const bytes = Buffer.from(canonicalize(evidence()));
    const digest = createHash('sha256').update(bytes).digest('hex');
    await writeFile(path, bytes, { mode: 0o600 });
    const { publicKey } = generateKeyPairSync('ed25519');
    const authorityPublicKey = publicKey.export({ format: 'jwk' }).x!;
    let connections = 0;
    const server = createServer((socket) => {
      connections += 1;
      socket.destroy();
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error();
    const databaseUrl = `postgres://owner:test@127.0.0.1:${address.port}/recovered`;
    const entrypoint = fileURLToPath(
      new URL('../../recovery-authorize-current.ts', import.meta.url),
    );
    try {
      await expect(
        runFile(process.execPath, [entrypoint], {
          timeout: 10_000,
          env: {
            PATH: process.env.PATH,
            STUDIO_RECOVERY_DATABASE_URL: databaseUrl,
            STUDIO_RECOVERY_BACKUP_DATABASE_URL: databaseUrl,
            STUDIO_DATABASE_ALLOWED_LOGINS: JSON.stringify(['owner']),
            STUDIO_RECOVERY_RECONCILIATION_PATH: path,
            STUDIO_RECOVERY_RECONCILIATION_SHA256: digest,
            STUDIO_RECOVERY_AUTHORITY_KEY_ID: 'offline-recovery-2026',
            STUDIO_RECOVERY_AUTHORITY_PUBLIC_KEY: authorityPublicKey,
            STUDIO_RECOVERY_RECONCILIATION_SIGNATURE: Buffer.alloc(
              64,
              1,
            ).toString('base64url'),
          },
        }),
      ).rejects.toThrow();
      expect(connections).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
