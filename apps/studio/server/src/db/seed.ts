import type pg from 'pg';

export async function seed(_pool: pg.Pool): Promise<void> {
  // TODO(#1256): the first team owner and the default team land with team
  // invitations.
  await Promise.resolve();
}
