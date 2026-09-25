import { Layer } from 'effect';

import type { Studio } from '../../app.ts';
import { DeniedAttempts } from '../../audit/denial-rate-limit.ts';
import { AuditSignal } from '../../audit/signal.ts';
import { AuthService } from '../../auth/service.ts';
import { DatabaseAbsent } from '../../db/client.ts';
import { Jobs } from '../../jobs/jobs.ts';
import { JOB_SCHEMA } from '../../jobs/queues.ts';
import { RateLimiter } from '../../rate-limit/limiter.ts';
import { RateLimitStore } from '../../rate-limit/store.ts';
import type { RpcServices, StudioServices } from '../../rpc/deps.ts';
import { SecretsCipherAbsent } from '../../secrets/services.ts';
import { limiterWithoutStore } from './valkey.ts';

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
const dataServices = (studio: Studio): Layer.Layer<StudioServices> =>
  studio.rpc.services === undefined
    ? Layer.mergeAll(
        DatabaseAbsent,
        SecretsCipherAbsent,
        AuditSignal.layer,
        Jobs.layer({ schema: JOB_SCHEMA }),
        DeniedAttempts.layer.pipe(Layer.provide(RateLimitStore.layerAbsent)),
      )
    : Layer.succeedContext(studio.rpc.services);

/**
 * Everything the `/rpc` route asks for: the data layer above, and the auth
 * provider and limiter the Studio was built over — which is what a program
 * provides from its own graph. A Studio built with no limiter gets one over no
 * store, which admits every call, as a deployment with no `REDIS_URL` does.
 */
export const studioServices = (studio: Studio): Layer.Layer<RpcServices> =>
  Layer.mergeAll(
    dataServices(studio),
    Layer.succeed(AuthService)(studio.auth),
    Layer.succeed(RateLimiter)(studio.limiter ?? limiterWithoutStore),
  );
