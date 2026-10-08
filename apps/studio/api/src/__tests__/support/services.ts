import { Layer } from 'effect';

import type { Studio } from '../../app.ts';
import { DeniedAttempts } from '../../audit/denial-rate-limit.ts';
import { AuditSignal } from '../../audit/signal.ts';
import { AuthService } from '../../auth/service.ts';
import { DatabaseAbsent } from '../../db/client.ts';
import { Jobs } from '../../jobs/jobs.ts';
import { JOB_SCHEMA } from '../../jobs/queues.ts';
import { Analytics } from '../../platform/analytics.ts';
import { RateLimiter } from '../../rate-limit/limiter.ts';
import { RateLimitStore } from '../../rate-limit/store.ts';
import type { RpcServices, StudioServices } from '../../rpc/deps.ts';
import { SecretsCipher } from '../../secrets/services.ts';
import { ObjectStore } from '../../storage/object-store.ts';
import { limiterWithoutStore } from './valkey.ts';

export const absentDataServices: Layer.Layer<StudioServices> = Layer.mergeAll(
  DatabaseAbsent,
  SecretsCipher.layerAbsent,
  AuditSignal.layer,
  Analytics.layerDisabled,
  Jobs.layer({ schema: JOB_SCHEMA }),
  DeniedAttempts.layer.pipe(Layer.provide(RateLimitStore.layerAbsent)),
);

const dataServices = (studio: Studio): Layer.Layer<StudioServices> =>
  studio.rpc.services === undefined
    ? absentDataServices
    : Layer.succeedContext(studio.rpc.services);

export const studioServices = (
  studio: Studio,
): Layer.Layer<RpcServices | ObjectStore> =>
  Layer.mergeAll(
    dataServices(studio),
    Layer.succeed(AuthService)(studio.auth),
    Layer.succeed(RateLimiter)(studio.limiter ?? limiterWithoutStore),
    Layer.succeed(ObjectStore)(studio.objectStore ?? ObjectStore.absent),
  );
