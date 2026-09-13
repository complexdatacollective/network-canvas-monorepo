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

const RECIPIENT_LOCK_KEY = `hashtext(current_schema() || '/message-recipient/' || $1 || '/' || $2), hashtext(encode($3::bytea, 'hex'))`;

/** Serializes deployment-wide opt-out changes with the final provider handoff. */
export async function lockMessageRecipientAuthority(
  client: Pick<pg.PoolClient, 'query'>,
  channel: 'email' | 'sms',
  blindIndexKeyId: string,
  recipientBlindIndex: Buffer,
): Promise<void> {
  await client.query(`SELECT pg_advisory_xact_lock(${RECIPIENT_LOCK_KEY})`, [
    channel,
    blindIndexKeyId,
    recipientBlindIndex,
  ]);
}

export async function tryLockMessageRecipientAuthority(
  client: Pick<pg.PoolClient, 'query'>,
  channel: 'email' | 'sms',
  blindIndexKeyId: string,
  recipientBlindIndex: Buffer,
): Promise<boolean> {
  const locked = await client.query<{ locked: boolean }>(
    `SELECT pg_try_advisory_xact_lock(${RECIPIENT_LOCK_KEY}) AS locked`,
    [channel, blindIndexKeyId, recipientBlindIndex],
  );
  return locked.rows[0]?.locked === true;
}
