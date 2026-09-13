import { createHash, generateKeyPairSync } from 'node:crypto';
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { canonicalize } from '@codaco/studio-sync/apply';

import { verifyStudioRecoveryAuthorizationEvidence } from '../authorization-reconciliation.ts';
import { runRecoveryEvidenceTool } from '../evidence-tool.ts';

const now = Date.parse('2026-09-13T12:00:00Z');
const directories: string[] = [];
const failure = 'STUDIO_RECOVERY_EVIDENCE_TOOL_FAILED';
const keyId = 'offline-authority-1';
function authorityInput() {
  return {
    format: 'studio-recovery-authorization-reconciliation',
    version: 1,
    issuedAt: '2026-09-13T11:00:00Z',
    expiresAt: '2026-09-13T13:00:00Z',
    instance: {
      name: 'Studio',
      initialOwnerUserId: 'owner',
      initialTeamId: 'team',
      completedAt: '2026-09-01T00:00:00Z',
    },
    users: [{ id: 'owner', email: 'owner@example.com', emailVerified: true }],
    eligibleUserIds: ['owner'],
    accounts: [],
    teams: [{ id: 'team', slug: 'team' }],
    memberships: [
      { id: 'membership', userId: 'owner', teamId: 'team', roles: ['owner'] },
    ],
    studyGrants: [],
    activeWebhookSubscriptions: [],
    activeScheduleIds: [],
    publishedMessageTemplateIds: [],
  };
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'studio-evidence-tool-'));
  directories.push(directory);
  const input = join(directory, 'input.json');
  const artifact = join(directory, 'artifact.json');
  const receipt = join(directory, 'signature.json');
  const keyFile = join(directory, 'authority.pem');
  const key = generateKeyPairSync('ed25519');
  const publicKey = key.publicKey.export({ format: 'jwk' }).x!;
  await writeFile(input, JSON.stringify(authorityInput(), null, 2), {
    mode: 0o600,
  });
  await writeFile(
    keyFile,
    key.privateKey.export({ format: 'pem', type: 'pkcs8' }),
    { mode: 0o600 },
  );
  return { directory, input, artifact, receipt, keyFile, publicKey };
}
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

describe('offline Studio recovery evidence tool', () => {
  it('prepares canonical private bytes and signs evidence accepted by the actual recovery verifier', async () => {
    const f = await fixture();
    const prepared = JSON.parse(
      await runRecoveryEvidenceTool(['prepare', f.input, f.artifact], now),
    ) as { sha256: string };
    const bytes = await readFile(f.artifact);
    expect(bytes.toString()).toBe(canonicalize(authorityInput()));
    expect(prepared.sha256).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
    expect((await stat(f.artifact)).mode & 0o777).toBe(0o600);
    await runRecoveryEvidenceTool(
      ['sign', f.artifact, prepared.sha256, f.keyFile, keyId, f.receipt],
      now,
    );
    const receipt = JSON.parse(await readFile(f.receipt, 'utf8')) as {
      signature: string;
    };
    expect((await stat(f.receipt)).mode & 0o777).toBe(0o600);
    const verified = verifyStudioRecoveryAuthorizationEvidence({
      bytes,
      expectedSha256: prepared.sha256,
      signature: receipt.signature,
      authorityKeyId: keyId,
      authorityPublicKey: f.publicKey,
    });
    expect(verified.reconciliation.eligibleUserIds).toEqual(['owner']);
    expect(
      JSON.parse(
        await runRecoveryEvidenceTool(
          ['verify', f.artifact, f.receipt, keyId, f.publicKey],
          now,
        ),
      ),
    ).toMatchObject({ verified: true, sha256: prepared.sha256 });
  });

  it('refuses altered artifacts, wrong independent keys, and mismatched authority identifiers', async () => {
    const f = await fixture();
    const { sha256 } = JSON.parse(
      await runRecoveryEvidenceTool(['prepare', f.input, f.artifact], now),
    ) as { sha256: string };
    await runRecoveryEvidenceTool(
      ['sign', f.artifact, sha256, f.keyFile, keyId, f.receipt],
      now,
    );
    const other = generateKeyPairSync('ed25519').publicKey.export({
      format: 'jwk',
    }).x!;
    await expect(
      runRecoveryEvidenceTool(
        ['verify', f.artifact, f.receipt, keyId, other],
        now,
      ),
    ).rejects.toThrow(failure);
    await expect(
      runRecoveryEvidenceTool(
        ['verify', f.artifact, f.receipt, 'other-authority', f.publicKey],
        now,
      ),
    ).rejects.toThrow(failure);
    await writeFile(
      f.artifact,
      (await readFile(f.artifact, 'utf8')).replace('"Studio"', '"Tampered"'),
    );
    await expect(
      runRecoveryEvidenceTool(
        ['verify', f.artifact, f.receipt, keyId, f.publicKey],
        now,
      ),
    ).rejects.toThrow(failure);
  });

  it('checks the validity window during preparation, signing, and independent verification', async () => {
    const f = await fixture();
    const expired = now + 3_600_000;
    await expect(
      runRecoveryEvidenceTool(['prepare', f.input, f.artifact], expired),
    ).rejects.toThrow(failure);
    await expect(stat(f.artifact)).rejects.toMatchObject({ code: 'ENOENT' });
    const { sha256 } = JSON.parse(
      await runRecoveryEvidenceTool(['prepare', f.input, f.artifact], now),
    ) as { sha256: string };
    await expect(
      runRecoveryEvidenceTool(
        ['sign', f.artifact, sha256, f.keyFile, keyId, f.receipt],
        expired,
      ),
    ).rejects.toThrow(failure);
    await runRecoveryEvidenceTool(
      ['sign', f.artifact, sha256, f.keyFile, keyId, f.receipt],
      now,
    );
    await expect(
      runRecoveryEvidenceTool(
        ['verify', f.artifact, f.receipt, keyId, f.publicKey],
        expired,
      ),
    ).rejects.toThrow(failure);
  });

  it('refuses non-private inputs, symlinks, and overwriting existing output', async () => {
    const f = await fixture();
    await chmod(f.input, 0o644);
    await expect(
      runRecoveryEvidenceTool(['prepare', f.input, f.artifact], now),
    ).rejects.toThrow(failure);
    await chmod(f.input, 0o600);
    const link = join(f.directory, 'link');
    await symlink(f.input, link);
    await expect(
      runRecoveryEvidenceTool(['prepare', link, f.artifact], now),
    ).rejects.toThrow(failure);
    await symlink(f.input, f.artifact);
    await expect(
      runRecoveryEvidenceTool(['prepare', f.input, f.artifact], now),
    ).rejects.toThrow(failure);
    await rm(f.artifact);
    await writeFile(f.artifact, 'preserved', { mode: 0o600 });
    await expect(
      runRecoveryEvidenceTool(['prepare', f.input, f.artifact], now),
    ).rejects.toThrow(failure);
    expect(await readFile(f.artifact, 'utf8')).toBe('preserved');
  });

  it('rejects malformed, excessively deep, and inconsistent authority input', async () => {
    const f = await fixture();
    for (const input of [
      '['.repeat(65) + '0' + ']'.repeat(65),
      '{',
      JSON.stringify(authorityInput()).replace(
        '"version":1',
        '"version":0,"version":1',
      ),
      JSON.stringify({ ...authorityInput(), eligibleUserIds: ['absent'] }),
    ]) {
      await writeFile(f.input, input);
      await expect(
        runRecoveryEvidenceTool(['prepare', f.input, f.artifact], now),
      ).rejects.toThrow(failure);
      await expect(stat(f.artifact)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it('rejects an incorrect pinned digest and unsigned noncanonical bytes', async () => {
    const f = await fixture();
    const inputBytes = await readFile(f.input);
    await expect(
      runRecoveryEvidenceTool(
        ['sign', f.input, '0'.repeat(64), f.keyFile, keyId, f.receipt],
        now,
      ),
    ).rejects.toThrow(failure);
    await expect(
      runRecoveryEvidenceTool(
        [
          'sign',
          f.input,
          createHash('sha256').update(inputBytes).digest('hex'),
          f.keyFile,
          keyId,
          f.receipt,
        ],
        now,
      ),
    ).rejects.toThrow(failure);
    await expect(stat(f.receipt)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('exports the complete strict versioned artifact shape from the runtime schema', async () => {
    const schema = JSON.parse(
      await runRecoveryEvidenceTool(['schema'], now),
    ) as {
      additionalProperties: boolean;
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties).toSorted()).toEqual(
      Object.keys(authorityInput()).toSorted(),
    );
    expect(schema.required.toSorted()).toEqual(
      Object.keys(authorityInput()).toSorted(),
    );
  });
});
