// Postgres answers a lock request that would have had to wait — `FOR UPDATE
// NOWAIT` — with SQLSTATE 55P03 rather than blocking. Two callers read it, and
// they have to read it the same way: the invitation-delivery handler, which
// asks for the invitation row it is about to send for (src/jobs/handlers), and
// the cancel command, which refuses rather than hold a team's audit lock
// behind someone else's SMTP call (src/team/commands.ts).

const LOCK_NOT_AVAILABLE = '55P03';

/** True when the statement asked not to wait for a lock and would have. */
export function isLockUnavailableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === LOCK_NOT_AVAILABLE
  );
}
