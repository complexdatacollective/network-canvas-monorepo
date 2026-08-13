import type pg from 'pg';

// Data every instance needs in order to work, as opposed to data a user
// creates. Studio has no domain entities yet, so today this writes nothing —
// it exists because `pnpm seed` and `pnpm db:reset` should call one function
// rather than diverge once there is something to write.

export async function seed(_pool: pg.Pool): Promise<void> {
  // TODO(#1256): the first workspace owner and the default workspace land with
  // workspace invitations.
  await Promise.resolve();
}
