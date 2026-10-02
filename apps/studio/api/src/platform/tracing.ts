import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { Otlp } from 'effect/observability';

import { Environment } from '../env.ts';
import { STUDIO_VERSION } from '../version.ts';

export type TracedProgram =
  | 'serve'
  | 'worker'
  | 'migrate'
  | 'maintenance'
  | 'rotate-secrets';

export const TracingLive = (
  program: TracedProgram,
): Layer.Layer<never, never, Environment> =>
  Layer.unwrap(
    Effect.map(Environment, (env) => {
      const baseUrl = env.telemetryEndpoint;
      if (!env.telemetry || baseUrl === undefined) return Layer.empty;
      return Otlp.layerJson({
        baseUrl,
        resource: {
          serviceName: 'studio-api',
          serviceVersion: STUDIO_VERSION,
          attributes: { 'studio.program': program },
        },
      }).pipe(Layer.provide(FetchHttpClient.layer));
    }),
  );
