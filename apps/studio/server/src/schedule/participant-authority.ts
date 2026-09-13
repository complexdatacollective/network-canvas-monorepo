import type pg from 'pg';

const LOCK_KEY = `hashtext(current_schema() || '/' || $1), hashtext($2)`;

/** Serializes participant messaging authority changes with the provider-handoff boundary. */
export async function lockParticipantMessageAuthority(
  client: Pick<pg.PoolClient, 'query'>,
  teamId: string,
  participantId: string,
): Promise<void> {
  await client.query(`SELECT pg_advisory_xact_lock(${LOCK_KEY})`, [
    teamId,
    participantId,
  ]);
}

export async function tryLockParticipantMessageAuthority(
  client: Pick<pg.PoolClient, 'query'>,
  teamId: string,
  participantId: string,
): Promise<boolean> {
  const locked = await client.query<{ locked: boolean }>(
    `SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked`,
    [teamId, participantId],
  );
  return locked.rows[0]?.locked === true;
}
