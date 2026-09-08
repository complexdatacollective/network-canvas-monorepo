import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { TextDecoder } from 'node:util';

import { z } from 'zod';

import { canonicalize } from '@codaco/studio-sync/apply';
import { templateBytesHash } from '@codaco/studio-sync/template-exchange';

const FAILURE = 'STUDIO_RECOVERY_RECONCILIATION_INVALID';
const MAX_EVIDENCE_BYTES = 64 * 1024 * 1024;
const MAX_IDENTITIES = 250_000;
const MAX_JSON_DEPTH = 64;
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const boundedId = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => value.isWellFormed() && !value.includes('\0'));
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const nullableId = boundedId.nullable();

const reconciliationSchema = z
  .strictObject({
    format: z.literal('studio-recovery-authorization-reconciliation'),
    version: z.literal(1),
    issuedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    instance: z.strictObject({
      name: z.string().min(1).max(120),
      initialOwnerUserId: nullableId,
      initialTeamId: nullableId,
      completedAt: z.iso.datetime({ offset: true }),
    }),
    users: z
      .array(
        z.strictObject({
          id: boundedId,
          email: z.email().max(320),
          emailVerified: z.boolean(),
        }),
      )
      .max(MAX_IDENTITIES),
    eligibleUserIds: z.array(boundedId).min(1).max(MAX_IDENTITIES),
    accounts: z
      .array(
        z.strictObject({
          id: boundedId,
          userId: boundedId,
          issuer: boundedId,
          accountId: boundedId,
          providerId: boundedId,
          credentialSha256: sha256,
        }),
      )
      .max(MAX_IDENTITIES),
    teams: z
      .array(z.strictObject({ id: boundedId, slug: boundedId }))
      .max(MAX_IDENTITIES),
    memberships: z
      .array(
        z.strictObject({
          id: boundedId,
          teamId: boundedId,
          userId: boundedId,
          roles: z
            .array(z.enum(['owner', 'admin', 'member']))
            .min(1)
            .max(3),
        }),
      )
      .max(MAX_IDENTITIES),
    studyGrants: z
      .array(
        z.strictObject({
          id: z.uuid(),
          teamId: boundedId,
          studyId: z.uuid(),
          userId: boundedId,
          role: z.enum([
            'manager',
            'protocol_designer',
            'coordinator',
            'data_viewer',
          ]),
          piiAccess: z.boolean(),
        }),
      )
      .max(MAX_IDENTITIES),
    activeWebhookSubscriptions: z
      .array(
        z.strictObject({
          id: z.uuid(),
          teamId: boundedId,
          configurationSha256: sha256,
        }),
      )
      .max(MAX_IDENTITIES),
    activeScheduleIds: z.array(z.uuid()).max(MAX_IDENTITIES),
    publishedMessageTemplateIds: z.array(z.uuid()).max(MAX_IDENTITIES),
  })
  .superRefine((value, context) => {
    const issuedAt = Date.parse(value.issuedAt);
    const expiresAt = Date.parse(value.expiresAt);
    if (expiresAt <= issuedAt || expiresAt - issuedAt > 24 * 60 * 60_000)
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'Invalid recovery evidence lifetime.',
      });
    const unique = (
      values: readonly string[],
      path: string,
      message: string,
    ) => {
      if (new Set(values).size !== values.length)
        context.addIssue({ code: 'custom', path: [path], message });
    };
    unique(
      value.users.map(({ id }) => id),
      'users',
      'Repeated user identity.',
    );
    unique(
      value.users.map(({ email }) => email.trim().toLowerCase()),
      'users',
      'Repeated user email.',
    );
    unique(
      value.eligibleUserIds,
      'eligibleUserIds',
      'Repeated eligible user identity.',
    );
    unique(
      value.accounts.map(({ id }) => id),
      'accounts',
      'Repeated account identity.',
    );
    unique(
      value.accounts.map(({ issuer, accountId }) => `${issuer}\0${accountId}`),
      'accounts',
      'Repeated external account identity.',
    );
    unique(
      value.teams.map(({ id }) => id),
      'teams',
      'Repeated team identity.',
    );
    unique(
      value.teams.map(({ slug }) => slug),
      'teams',
      'Repeated team slug.',
    );
    unique(
      value.memberships.map(({ id }) => id),
      'memberships',
      'Repeated membership identity.',
    );
    unique(
      value.memberships.map(({ teamId, userId }) => `${teamId}\0${userId}`),
      'memberships',
      'Repeated membership authority.',
    );
    unique(
      value.studyGrants.map(({ id }) => id),
      'studyGrants',
      'Repeated study grant identity.',
    );
    unique(
      value.studyGrants.map(({ studyId, userId }) => `${studyId}\0${userId}`),
      'studyGrants',
      'Repeated study authority.',
    );
    unique(
      value.activeWebhookSubscriptions.map(({ id }) => id),
      'activeWebhookSubscriptions',
      'Repeated webhook integration.',
    );
    unique(value.activeScheduleIds, 'activeScheduleIds', 'Repeated schedule.');
    unique(
      value.publishedMessageTemplateIds,
      'publishedMessageTemplateIds',
      'Repeated message template.',
    );
    for (const membership of value.memberships)
      unique(membership.roles, 'memberships', 'Repeated membership role.');
    const users = new Set(value.users.map(({ id }) => id));
    const teams = new Set(value.teams.map(({ id }) => id));
    const requireReference = (
      present: boolean,
      path: string,
      message: string,
    ) => {
      if (!present) context.addIssue({ code: 'custom', path: [path], message });
    };
    for (const account of value.accounts)
      requireReference(
        users.has(account.userId),
        'accounts',
        'Account refers to an absent user.',
      );
    for (const id of value.eligibleUserIds)
      requireReference(
        users.has(id),
        'eligibleUserIds',
        'Eligible identity is absent from the current user inventory.',
      );
    for (const membership of value.memberships) {
      requireReference(
        users.has(membership.userId),
        'memberships',
        'Membership refers to an absent user.',
      );
      requireReference(
        teams.has(membership.teamId),
        'memberships',
        'Membership refers to an absent team.',
      );
    }
    for (const grant of value.studyGrants) {
      requireReference(
        users.has(grant.userId),
        'studyGrants',
        'Study grant refers to an absent user.',
      );
      requireReference(
        teams.has(grant.teamId),
        'studyGrants',
        'Study grant refers to an absent team.',
      );
    }
    for (const webhook of value.activeWebhookSubscriptions)
      requireReference(
        teams.has(webhook.teamId),
        'activeWebhookSubscriptions',
        'Webhook refers to an absent team.',
      );
  });

export type StudioRecoveryAuthorizationReconciliation = z.infer<
  typeof reconciliationSchema
>;

export type StudioRecoveryReconciliationEvidence = {
  reconciliation: StudioRecoveryAuthorizationReconciliation;
  sha256: string;
  bytes: Buffer;
};

export type StudioRecoveryReconciliationBytes = {
  sha256: string;
  bytes: Buffer;
};

type SequentialReader = {
  read(
    buffer: Buffer,
    offset: number,
    length: number,
    position: null,
  ): Promise<{ bytesRead: number }>;
};

const verifiedEvidence = new WeakSet<object>();

export type VerifiedStudioRecoveryAuthorizationEvidence = Readonly<{
  reconciliation: StudioRecoveryAuthorizationReconciliation;
  sha256: string;
  authority: Readonly<{ keyId: string; publicKeySha256: string }>;
}>;

function decodeCanonicalBase64Url(value: string, bytes: number): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.byteLength !== bytes || decoded.toString('base64url') !== value)
    throw new Error();
  return decoded;
}

function assertBoundedJsonDepth(bytes: Uint8Array): void {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const byte of bytes) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (byte === 0x5c) escaped = true;
      else if (byte === 0x22) quoted = false;
      continue;
    }
    if (byte === 0x22) quoted = true;
    else if (byte === 0x7b || byte === 0x5b) {
      depth += 1;
      if (depth > MAX_JSON_DEPTH) throw new Error();
    } else if (byte === 0x7d || byte === 0x5d) {
      depth -= 1;
      if (depth < 0) throw new Error();
    }
  }
  if (quoted || escaped || depth !== 0) throw new Error();
}

/** @internal Reads at most the previously observed size plus one growth byte. */
export async function readExactRecoveryArtifactBytes(
  reader: SequentialReader,
  expectedSize: number,
): Promise<Buffer> {
  if (
    !Number.isSafeInteger(expectedSize) ||
    expectedSize <= 0 ||
    expectedSize > MAX_EVIDENCE_BYTES
  )
    throw new Error(FAILURE);
  const bounded = Buffer.allocUnsafe(expectedSize + 1);
  let offset = 0;
  while (offset < bounded.byteLength) {
    const { bytesRead } = await reader.read(
      bounded,
      offset,
      bounded.byteLength - offset,
      null,
    );
    if (!Number.isSafeInteger(bytesRead) || bytesRead < 0) throw new Error();
    if (bytesRead === 0) break;
    if (bytesRead > bounded.byteLength - offset) throw new Error();
    offset += bytesRead;
  }
  if (offset !== expectedSize) throw new Error(FAILURE);
  return bounded.subarray(0, expectedSize);
}

function freezeEvidence(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freezeEvidence(child);
  Object.freeze(value);
}

/** Verify exact canonical evidence bytes against an independently configured
 * Ed25519 authority before any database connection or restored-state write. */
export function verifyStudioRecoveryAuthorizationEvidence(options: {
  bytes: Uint8Array;
  expectedSha256: string;
  signature: string;
  authorityKeyId: string;
  authorityPublicKey: string;
}): VerifiedStudioRecoveryAuthorizationEvidence {
  try {
    if (
      options.bytes.byteLength <= 0 ||
      options.bytes.byteLength > MAX_EVIDENCE_BYTES ||
      !/^[0-9a-f]{64}$/.test(options.expectedSha256) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(options.authorityKeyId)
    )
      throw new Error();
    const signature = decodeCanonicalBase64Url(options.signature, 64);
    const rawPublicKey = decodeCanonicalBase64Url(
      options.authorityPublicKey,
      32,
    );
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, rawPublicKey]),
      format: 'der',
      type: 'spki',
    });
    if (!verifySignature(null, options.bytes, key, signature))
      throw new Error();
    if (templateBytesHash(options.bytes) !== options.expectedSha256)
      throw new Error();
    assertBoundedJsonDepth(options.bytes);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(
      options.bytes,
    );
    const parsed = copyStudioRecoveryAuthorizationReconciliation(
      JSON.parse(text),
    );
    if (canonicalize(parsed) !== text) throw new Error();
    freezeEvidence(parsed);
    const result: VerifiedStudioRecoveryAuthorizationEvidence = Object.freeze({
      reconciliation: parsed,
      sha256: options.expectedSha256,
      authority: Object.freeze({
        keyId: options.authorityKeyId,
        publicKeySha256: createHash('sha256')
          .update(rawPublicKey)
          .digest('hex'),
      }),
    });
    verifiedEvidence.add(result);
    return result;
  } catch {
    throw new Error(FAILURE);
  }
}

export function assertVerifiedStudioRecoveryAuthorizationEvidence(
  value: VerifiedStudioRecoveryAuthorizationEvidence,
): void {
  if (!verifiedEvidence.has(value)) throw new Error(FAILURE);
}

/** Snapshot untrusted caller-owned evidence before any database I/O. */
export function copyStudioRecoveryAuthorizationReconciliation(
  value: unknown,
): StudioRecoveryAuthorizationReconciliation {
  try {
    return reconciliationSchema.parse(structuredClone(value));
  } catch {
    throw new Error(FAILURE);
  }
}

/** Read bounded private artifact bytes without interpreting unverified content. */
export async function readStudioRecoveryAuthorizationReconciliationBytes(
  path: string,
  expectedSha256: string,
): Promise<StudioRecoveryReconciliationBytes> {
  try {
    if (!/^[0-9a-f]{64}$/.test(expectedSha256)) throw new Error();
    const info = await lstat(path);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      (info.mode & 0o077) !== 0 ||
      info.size <= 0 ||
      info.size > MAX_EVIDENCE_BYTES
    )
      throw new Error();
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytes: Buffer;
    try {
      const opened = await handle.stat();
      if (
        !opened.isFile() ||
        opened.dev !== info.dev ||
        opened.ino !== info.ino ||
        opened.size !== info.size ||
        opened.mode !== info.mode
      )
        throw new Error();
      bytes = await readExactRecoveryArtifactBytes(handle, info.size);
      const afterRead = await handle.stat();
      if (
        afterRead.dev !== info.dev ||
        afterRead.ino !== info.ino ||
        afterRead.size !== info.size ||
        afterRead.mode !== info.mode
      )
        throw new Error();
    } finally {
      await handle.close();
    }
    if (bytes.byteLength !== info.size) throw new Error();
    if (templateBytesHash(bytes) !== expectedSha256) throw new Error();
    return { sha256: expectedSha256, bytes };
  } catch {
    throw new Error(FAILURE);
  }
}

/** Read and parse a bounded, privately held reconciliation artifact. */
export async function readStudioRecoveryAuthorizationReconciliation(
  path: string,
  expectedSha256: string,
): Promise<StudioRecoveryReconciliationEvidence> {
  try {
    const artifact = await readStudioRecoveryAuthorizationReconciliationBytes(
      path,
      expectedSha256,
    );
    return {
      ...artifact,
      reconciliation: copyStudioRecoveryAuthorizationReconciliation(
        JSON.parse(artifact.bytes.toString('utf8')),
      ),
    };
  } catch {
    throw new Error(FAILURE);
  }
}
