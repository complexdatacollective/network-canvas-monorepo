import type pg from 'pg';

export async function seed(_pool: pg.Pool): Promise<void> {
  // TODO(#1256): the first workspace owner and the default workspace land with
  // workspace invitations.
  await Promise.resolve();
}
