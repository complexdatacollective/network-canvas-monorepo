import { Effect, Option } from 'effect';

import type { MaintenanceTriggers } from '../http/middleware/maintenance.ts';

/**
 * Every closure but the migration lock alone. A `migrate` with nothing to
 * apply takes the lock for milliseconds, and a write a socket sends while a
 * real migration holds it runs before or after the migration's transaction,
 * never inside a half-applied one. Once that transaction commits the schema is
 * no longer this build's, and that closes the socket: an old server must not
 * keep writing to a database a newer release has moved.
 *
 * The lease keeper stops on the same reading: a replica the database is closed
 * to must neither renew nor release on its owners' behalf.
 */
export const socketClosure = (triggers: MaintenanceTriggers['Service']) =>
  Effect.map(
    triggers.closure,
    Option.filter((closure) => closure.trigger !== 'migration'),
  );
