import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
} from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

import { z } from 'zod';

import { canonicalize } from '@codaco/studio-sync/apply';

import {
  parseStudioRecoveryReconciliationInput,
  readPrivateRecoveryFile,
  readStudioRecoveryAuthorizationReconciliationBytes,
  studioRecoveryReconciliationSchema,
  verifyStudioRecoveryAuthorizationEvidence,
} from './authorization-reconciliation.ts';

const FAILURE = 'STUDIO_RECOVERY_EVIDENCE_TOOL_FAILED';
const receiptSchema = z.strictObject({
  format: z.literal('studio-recovery-authorization-signature'),
  version: z.literal(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  authorityKeyId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/),
  authorityPublicKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
});

function assertCurrent(issuedAt: string, expiresAt: string, now: number) {
  if (
    !Number.isFinite(now) ||
    Date.parse(issuedAt) > now ||
    Date.parse(expiresAt) <= now
  )
    throw new Error(FAILURE);
}

async function createPrivateFile(path: string, bytes: Uint8Array | string) {
  const handle = await open(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/** Offline only: no environment, database, restored authority, or network reads. */
export async function runRecoveryEvidenceTool(
  args: string[],
  now = Date.now(),
): Promise<string> {
  try {
    const [command, ...parameters] = args;
    if (command === 'schema' && parameters.length === 0) {
      return JSON.stringify(
        z.toJSONSchema(studioRecoveryReconciliationSchema),
        null,
        2,
      );
    }
    if (command === 'prepare' && parameters.length === 2) {
      const [input, output] = z
        .tuple([z.string(), z.string()])
        .parse(parameters);
      const value = parseStudioRecoveryReconciliationInput(
        await readPrivateRecoveryFile(input),
      );
      assertCurrent(value.issuedAt, value.expiresAt, now);
      const bytes = Buffer.from(canonicalize(value), 'utf8');
      await createPrivateFile(output, bytes);
      return JSON.stringify({
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    if (command === 'sign' && parameters.length === 5) {
      const [artifact, expectedSha256, keyFile, authorityKeyId, output] = z
        .tuple([z.string(), z.string(), z.string(), z.string(), z.string()])
        .parse(parameters);
      const { bytes } =
        await readStudioRecoveryAuthorizationReconciliationBytes(
          artifact,
          expectedSha256,
        );
      const keyBytes = await readPrivateRecoveryFile(keyFile);
      let key;
      try {
        key = createPrivateKey(keyBytes);
      } finally {
        keyBytes.fill(0);
      }
      if (key.asymmetricKeyType !== 'ed25519') throw new Error();
      const publicJwk = createPublicKey(key).export({ format: 'jwk' });
      if (!publicJwk.x) throw new Error();
      const receipt = receiptSchema.parse({
        format: 'studio-recovery-authorization-signature',
        version: 1,
        sha256: expectedSha256,
        authorityKeyId,
        authorityPublicKey: publicJwk.x,
        signature: sign(null, bytes, key).toString('base64url'),
      });
      const verified = verifyStudioRecoveryAuthorizationEvidence({
        bytes,
        expectedSha256,
        ...receipt,
      });
      assertCurrent(
        verified.reconciliation.issuedAt,
        verified.reconciliation.expiresAt,
        now,
      );
      await createPrivateFile(output, JSON.stringify(receipt));
      return JSON.stringify({
        sha256: expectedSha256,
        authorityKeyId,
        publicKeySha256: verified.authority.publicKeySha256,
      });
    }
    if (command === 'verify' && parameters.length === 4) {
      const [artifact, receiptFile, authorityKeyId, authorityPublicKey] = z
        .tuple([z.string(), z.string(), z.string(), z.string()])
        .parse(parameters);
      const receiptBytes = await readPrivateRecoveryFile(receiptFile);
      if (receiptBytes.byteLength > 4096) throw new Error();
      const receipt = receiptSchema.parse(
        JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(receiptBytes),
        ),
      );
      // Both trust-anchor arguments come from independent custody, never from
      // a receipt's self-asserted identity.
      if (
        receipt.authorityKeyId !== authorityKeyId ||
        receipt.authorityPublicKey !== authorityPublicKey
      )
        throw new Error();
      const { bytes } =
        await readStudioRecoveryAuthorizationReconciliationBytes(
          artifact,
          receipt.sha256,
        );
      const verified = verifyStudioRecoveryAuthorizationEvidence({
        bytes,
        expectedSha256: receipt.sha256,
        signature: receipt.signature,
        authorityKeyId,
        authorityPublicKey,
      });
      assertCurrent(
        verified.reconciliation.issuedAt,
        verified.reconciliation.expiresAt,
        now,
      );
      return JSON.stringify({
        verified: true,
        sha256: receipt.sha256,
        authorityKeyId,
        publicKeySha256: verified.authority.publicKeySha256,
      });
    }
    throw new Error();
  } catch {
    throw new Error(FAILURE);
  }
}
