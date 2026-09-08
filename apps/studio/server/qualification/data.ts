import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import type pg from 'pg';

import type { contract } from '@codaco/studio-rpc';
import { createTenantDb } from '@codaco/studio-sync/tenant';

import type { AuditedCommandContext } from '../src/audit/command.ts';
import { createBetterAuthInstance } from '../src/auth/better-auth.ts';
import { resolveEncryptionEnv } from '../src/env/encryption.ts';
import { createContactBlindIndex } from '../src/pii/contacts.ts';
import { initializeEncryption } from '../src/pii/initialize.ts';
import { updateParticipantPii } from '../src/pii/participants.ts';
import {
  createDataProtection,
  ProtectedDataError,
} from '../src/pii/protection.ts';
import type { Deployment } from './compose.ts';

export const owner = {
  email: 'owner@example.test',
  password: 'Synthetic qualification password 12345',
  name: 'Qualification owner',
};
export const canaries = {
  contact: 'synthetic_qualification_contact@example.test',
  oauth: 'SYNTHETIC_QUALIFICATION_ACCESS_TOKEN',
  webhook: Buffer.from('SYNTHETIC_QUALIFICATION_WEBHOOK_SECRET'),
  asset: Buffer.from('Synthetic Studio recovery asset\n'),
};

export function rpc(
  origin: string,
  cookie = '',
  requestOrigin = origin,
): ContractRouterClient<typeof contract> {
  return createORPCClient(
    new RPCLink({
      origin,
      url: '/rpc',
      headers: { origin: requestOrigin, cookie },
    }),
  );
}

export async function signIn(origin: string) {
  const response = await fetch(`${origin}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email: owner.email, password: owner.password }),
  });
  assert.equal(
    response.status,
    200,
    'the built image must authenticate the first owner',
  );
  const cookie = response.headers
    .getSetCookie()
    .map((item) => item.split(';')[0])
    .join('; ');
  assert.ok(cookie.length > 0);
  return cookie;
}

export async function recordAsset(
  admin: pg.Pool,
  teamId: string,
  ownerId: string,
  bytes: Buffer,
) {
  const hash = createHash('sha256').update(bytes).digest('hex');
  const section = { assets: { recovery: hash } };
  const sectionHash = createHash('sha256')
    .update(JSON.stringify(section))
    .digest('hex');
  await admin.query(
    'INSERT INTO assets (team_id, hash, media_type, media_class, byte_size, original_filename, origin, uploaded_by_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [
      teamId,
      hash,
      'application/octet-stream',
      'document',
      bytes.length,
      'recovery.txt',
      'upload',
      ownerId,
    ],
  );
  await admin.query(
    'INSERT INTO sections (team_id, hash, doc) VALUES ($1, $2, $3)',
    [teamId, sectionHash, section],
  );
  await admin.query(
    "INSERT INTO asset_references (team_id, asset_hash, referrer_kind, referrer_id) VALUES ($1, $2, 'section', $3)",
    [teamId, hash, sectionHash],
  );
  return hash;
}

export async function populate(
  deployment: Pick<Deployment, 'origin' | 'pools' | 'configuration'>,
  cookie: string,
  fixture: {
    protocolId?: string;
    studyId?: string;
    participantId?: string;
    participantCode?: string;
    asset?: Buffer;
  } = {},
) {
  const pools = await deployment.pools();
  const env = await deployment.configuration();
  try {
    const singleton = (
      await pools.admin.query<{ owner: string; team: string }>(
        'SELECT initial_owner_user_id AS owner, initial_team_id AS team FROM studio_instance',
      )
    ).rows[0]!;
    assert.ok(singleton.owner);
    assert.ok(singleton.team);
    const protocolId = fixture.protocolId ?? randomUUID();
    const studyId = fixture.studyId ?? randomUUID();
    const participantId = fixture.participantId ?? randomUUID();
    await pools.admin.query(
      'INSERT INTO protocols (id, team_id, name) VALUES ($1, $2, $3)',
      [protocolId, singleton.team, 'Recovery protocol'],
    );
    await pools.admin.query(
      'INSERT INTO studies (id, team_id, protocol_id, name) VALUES ($1, $2, $3, $4)',
      [studyId, singleton.team, protocolId, 'Recovery study'],
    );
    await pools.admin.query(
      'INSERT INTO participants (id, team_id, study_id, participant_code) VALUES ($1, $2, $3, $4)',
      [
        participantId,
        singleton.team,
        studyId,
        fixture.participantCode ?? 'RECOVERY-001',
      ],
    );
    await pools.admin.query(
      "INSERT INTO study_role_grants (id, team_id, study_id, user_id, role, pii_access, granted_by_user_id) VALUES ($1, $2, $3, $4, 'manager', true, $4)",
      [randomUUID(), singleton.team, studyId, singleton.owner],
    );
    const keys = await initializeEncryption({
      maintenancePool: pools.maintenance,
      ...resolveEncryptionEnv(env),
    });
    const context = commandContext(pools.app, singleton.team, singleton.owner);
    await updateParticipantPii(
      keys,
      context,
      { studyId, participantId },
      {
        name: 'Synthetic recovery contact',
        email: canaries.contact,
        phone: null,
        attributes: { sensitive: 'SYNTHETIC_RECOVERY_ATTRIBUTES' },
      },
    );
    const index = createContactBlindIndex(keys, {
      kind: 'email',
      value: canaries.contact,
    });
    await pools.maintenance.query(
      "INSERT INTO participant_contact_optouts (channel, recipient_blind_index, blind_index_key_id, source) VALUES ('email', $1, $2, 'provider')",
      [index.value, index.keyId],
    );
    const auth = createBetterAuthInstance(
      {
        secret: env.BETTER_AUTH_SECRET!,
        baseUrl: deployment.origin,
        mailer: { kind: 'refuse' },
        trustedProxies: undefined,
        socialProviders: {
          google: {
            clientId: 'synthetic-qualification-client',
            clientSecret: 'synthetic-qualification-secret',
          },
        },
      },
      pools.app,
      {
        sendMagicLink: async () => {
          throw new Error('Quarantine forbids mail');
        },
      },
      { encryptionKeys: keys, deploymentMode: 'self-hosted' },
    );
    const account = await (
      await auth.$context
    ).internalAdapter.createAccount({
      userId: singleton.owner,
      accountId: 'synthetic-recovery-provider-subject',
      providerId: 'google',
      issuer: 'https://accounts.google.com',
      accessToken: canaries.oauth,
      refreshToken: `${canaries.oauth}-refresh`,
      idToken: `${canaries.oauth}-id`,
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
    });
    const subscriptionId = randomUUID();
    const sealed = createDataProtection(keys, {
      participant: async () => {
        throw new ProtectedDataError();
      },
      integration: async () => {
        throw new ProtectedDataError();
      },
    }).encryptIntegration(
      {
        kind: 'webhook',
        teamId: singleton.team,
        subscriptionId,
        column: 'secret_ciphertext',
      },
      canaries.webhook,
    );
    await pools.admin.query(
      "INSERT INTO webhook_subscriptions (id, team_id, url, event_types, secret_ciphertext, secret_key_id, secret_algorithm, created_by_user_id) VALUES ($1, $2, 'https://synthetic-sink.invalid/recovery', ARRAY['interview.completed'], $3, $4, $5, $6)",
      [
        subscriptionId,
        singleton.team,
        sealed.envelope,
        sealed.keyId,
        sealed.algorithm,
        singleton.owner,
      ],
    );
    const upload = await fetch(`${deployment.origin}/storage`, {
      method: 'POST',
      headers: {
        'origin': deployment.origin,
        cookie,
        'content-type': 'application/octet-stream',
      },
      body: fixture.asset ?? canaries.asset,
    });
    assert.equal(upload.status, 201);
    const assetHash = await recordAsset(
      pools.admin,
      singleton.team,
      singleton.owner,
      fixture.asset ?? canaries.asset,
    );
    return {
      ...singleton,
      studyId,
      participantId,
      accountId: account.id,
      subscriptionId,
      assetHash,
    };
  } finally {
    await pools.close();
  }
}

export function commandContext(
  pool: pg.Pool,
  teamId: string,
  userId: string,
): AuditedCommandContext {
  return {
    tenantDb: createTenantDb(pool, teamId),
    principal: {
      kind: 'user',
      userId,
      email: owner.email,
      emailVerified: true,
      name: owner.name,
      sessionId: randomUUID(),
      locale: null,
    },
    requestId: randomUUID(),
  };
}
