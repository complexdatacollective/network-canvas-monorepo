import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';

import { z } from 'zod';

import { templateBytesHash } from '@codaco/studio-sync/template-exchange';

const FAILURE = 'STUDIO_RECOVERY_RECONCILIATION_INVALID';
const MAX_EVIDENCE_BYTES = 64 * 1024 * 1024;
const MAX_IDENTITIES = 250_000;
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
};

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

/** Read a bounded, privately held reconciliation artifact by exact digest. */
export async function readStudioRecoveryAuthorizationReconciliation(
  path: string,
  expectedSha256: string,
): Promise<StudioRecoveryReconciliationEvidence> {
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
      bytes = await handle.readFile();
    } finally {
      await handle.close();
    }
    if (bytes.byteLength !== info.size) throw new Error();
    if (templateBytesHash(bytes) !== expectedSha256) throw new Error();
    return {
      reconciliation: copyStudioRecoveryAuthorizationReconciliation(
        JSON.parse(bytes.toString('utf8')),
      ),
      sha256: expectedSha256,
    };
  } catch {
    throw new Error(FAILURE);
  }
}
