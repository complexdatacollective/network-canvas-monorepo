import { randomUUID } from 'node:crypto';

import type pg from 'pg';

// One small registry serializes state changes, including the publication quota
// and takedown decision, across replicas. Public reads never acquire this lock.
async function lockRegistry(client: pg.PoolClient): Promise<void> {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || '/template-registry/commands', 412841284))",
  );
}

export async function registryTransaction<T>(
  pool: pg.Pool,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    await client.query(
      "SET LOCAL statement_timeout = '15s'; SET LOCAL lock_timeout = '10s'",
    );
    await lockRegistry(client);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}

export type RegistryActor = {
  kind: 'publisher' | 'operator' | 'system' | 'database_operator';
  id: string;
};
export type RegistryAuditAction =
  | 'publisher.claimed'
  | 'credential.created'
  | 'credential.revoked'
  | 'entry.published'
  | 'entry.yanked'
  | 'artifact.taken_down'
  | 'artifact.restored'
  | 'artifact.hard_delete_requested'
  | 'artifact.hard_delete_completed'
  | 'publisher.suspended'
  | 'publisher.reinstated'
  | 'entry.curated'
  | 'entry.uncurated'
  | 'operator.granted'
  | 'operator.revoked';

export async function appendRegistryAudit(
  client: pg.PoolClient,
  actor: RegistryActor,
  action: RegistryAuditAction,
  subjectId: string,
  requestId: string,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    'INSERT INTO registry_audit(id, actor_kind, actor_id, action, subject_id, request_id) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, actor.kind, actor.id, action, subjectId, requestId],
  );
  return id;
}
