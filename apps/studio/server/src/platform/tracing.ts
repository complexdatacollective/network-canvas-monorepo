import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { Otlp } from 'effect/unstable/observability';

import { Environment } from '../env.ts';
import { STUDIO_VERSION } from '../version.ts';

// Telemetry export for whichever of the image's commands is running (#1897).
//
// Absence is the gate: with no `OTEL_EXPORTER_OTLP_ENDPOINT` this is
// `Layer.empty`, so a deployment that configures no collector builds no
// exporter, opens no connection and batches nothing — the cost of the feature
// is zero rather than small. `STUDIO_TELEMETRY=false` is the second gate, for
// an instance that has a collector on its network and still wants out.
//
// One OTLP layer for all three signals, over `FetchHttpClient` rather than a
// Node-specific client: the exporter posts JSON to three paths and needs
// nothing the platform client adds.

/**
 * Which command produced a record. The three signals carry it as a resource
 * attribute rather than a per-record one, because it is a property of the
 * process, and a collector that mixes a web process's spans with a worker's
 * would otherwise have no way to tell them apart.
 */
export type TracedProgram = 'serve' | 'worker' | 'migrate' | 'rotate-secrets';

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
