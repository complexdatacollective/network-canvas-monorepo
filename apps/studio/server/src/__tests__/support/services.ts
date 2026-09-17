import { Layer } from 'effect';

import type { Studio } from '../../app.ts';
import { AuditSignal } from '../../audit/signal.ts';
import { DatabaseAbsent } from '../../db/client.ts';
import { Jobs } from '../../jobs/jobs.ts';
import { JOB_SCHEMA } from '../../jobs/queues.ts';
import type { StudioServices } from '../../rpc/deps.ts';
import { SecretsCipherAbsent } from '../../secrets/services.ts';

/**
 * The data layer the `/rpc` route asks for, whichever shape a suite's Studio
 * is.
 *
 * A suite that built its Studio with `services` (`support/postgres.ts`'s
 * `scratch.services()`) gets exactly those, which is the production wiring.
 * A suite that built one without — every case about a process with no
 * database, and every case that never reaches a procedure which reads — gets
 * the same stand-ins `programs/serve.ts` provides in that topology: they throw
 * on first touch rather than degrading, so "nothing reached the database" is a
 * property the suite proves rather than assumes.
 */
export const studioServices = (studio: Studio): Layer.Layer<StudioServices> =>
  studio.rpc.services === undefined
    ? Layer.mergeAll(
        DatabaseAbsent,
        SecretsCipherAbsent,
        AuditSignal.layer,
        Jobs.layer({ schema: JOB_SCHEMA }),
      )
    : Layer.succeedContext(studio.rpc.services);
