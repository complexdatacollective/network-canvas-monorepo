import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

import { hashPassword } from 'better-auth/crypto';
import type pg from 'pg';

import {
  CompleteSetupInputSchema,
  type CompleteSetupInput,
  type SetupStatus,
} from '@codaco/studio-rpc';
import { TEAM_GUC } from '@codaco/studio-sync/rls';

import { AuditStore } from '../audit/store.ts';

const BOOTSTRAP_LOCK_SEED = '4021775688147132';
const auditStore = new AuditStore();

export class SetupError extends Error {
  readonly code: 'FORBIDDEN' | 'CONFLICT' | 'UNAVAILABLE';
  constructor(code: SetupError['code']) {
    super(`First-run setup ${code.toLowerCase()}.`);
    this.name = 'SetupError';
    this.code = code;
  }
}

async function databaseSetupState(
  client: pg.Pool | pg.PoolClient,
): Promise<SetupStatus> {
  const result = await client.query<{
    completed: boolean;
    populated: boolean;
  }>(`
    SELECT EXISTS (SELECT 1 FROM studio_instance) AS completed,
      (EXISTS (SELECT 1 FROM "user") OR EXISTS (SELECT 1 FROM teams)) AS populated
  `);
  const state = result.rows[0];
  if (!state) throw new Error('Setup state query returned no row.');
  return {
    state: state.completed
      ? 'complete'
      : state.populated
        ? 'unavailable'
        : 'ready',
  };
}

export async function getSetupStatus(
  pool?: pg.Pool,
  configuredToken?: string,
): Promise<SetupStatus> {
  if (!pool) return { state: 'unavailable' };
  const status = await databaseSetupState(pool);
  return status.state === 'ready' && !configuredToken
    ? { state: 'unavailable' }
    : status;
}

function tokenDigest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function tokenMatches(provided: string, configured: string): boolean {
  // Fixed-length digests keep comparison timing independent of the secret.
  return timingSafeEqual(tokenDigest(provided), tokenDigest(configured));
}

/** Token-authorized initial owner creation; every durable write commits together. */
export async function completeSetup(
  pool: pg.Pool,
  configuredToken: string | undefined,
  unvalidatedInput: CompleteSetupInput,
  requestId: string,
): Promise<{ state: 'complete' }> {
  const input = CompleteSetupInputSchema.parse(unvalidatedInput);
  if (!configuredToken) throw new SetupError('UNAVAILABLE');
  if (!tokenMatches(input.token, configuredToken))
    throw new SetupError('FORBIDDEN');
  // The expensive password operation is only available to a token holder.
  const password = await hashPassword(input.ownerPassword);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended(current_schema(), $1::bigint))',
      [BOOTSTRAP_LOCK_SEED],
    );
    // An in-flight identity/team insert must settle before the empty-instance
    // decision. This also refuses taking over an existing uninitialized DB.
    await client.query('LOCK TABLE "user", teams IN SHARE ROW EXCLUSIVE MODE');
    const status = await databaseSetupState(client);
    if (status.state !== 'ready')
      throw new SetupError(
        status.state === 'complete' ? 'CONFLICT' : 'UNAVAILABLE',
      );
    const ownerId = randomUUID();
    const teamId = randomUUID();
    const instanceName = input.instanceName.trim();
    const ownerName = input.ownerName.trim();
    await client.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)`,
      [ownerId, ownerName, input.ownerEmail.trim().toLowerCase()],
    );
    // Same credential format and hasher as Better Auth and the dev fixture.
    // The deployment operator's bootstrap token authorizes this first identity.
    await client.query(
      `INSERT INTO account (id, "accountId", "providerId", issuer, "userId", password, "updatedAt") VALUES ($1, $2, 'credential', 'local:credential', $2, $3, CURRENT_TIMESTAMP)`,
      [randomUUID(), ownerId, password],
    );
    await client.query(
      'INSERT INTO teams (id, name, slug) VALUES ($1, $2, $3)',
      [teamId, instanceName, `instance-${teamId}`],
    );
    await client.query(
      `INSERT INTO team_members (id, team_id, user_id, role) VALUES ($1, $2, $3, 'owner')`,
      [randomUUID(), teamId, ownerId],
    );
    await client.query(
      'INSERT INTO studio_instance (name, initial_owner_user_id, initial_team_id) VALUES ($1, $2, $3)',
      [instanceName, ownerId, teamId],
    );
    await client.query(`SELECT set_config('${TEAM_GUC}', $1, true)`, [teamId]);
    await auditStore.append(client, {
      eventType: 'team.created',
      eventVersion: 1,
      category: 'team_access',
      outcome: 'succeeded',
      teamId,
      teamLabel: instanceName,
      actorKind: 'user',
      actorId: ownerId,
      actorLabel: ownerName,
      subjectType: 'team',
      subjectId: teamId,
      subjectLabel: instanceName,
      resourceType: null,
      resourceId: null,
      resourceLabel: null,
      requestId,
      details: { source: 'instance_setup' },
    });
    await client.query('COMMIT');
    return { state: 'complete' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
