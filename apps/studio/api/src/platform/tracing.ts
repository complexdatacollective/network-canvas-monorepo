import { Effect, Layer, Logger, Redacted } from 'effect';
import { FetchHttpClient } from 'effect/http';
import {
  OtlpExporter,
  OtlpLogger,
  OtlpMetrics,
  OtlpTracer,
} from 'effect/observability';

import { POSTHOG_API_KEY } from '@codaco/shared-consts';

import { Environment, type StudioEnv } from '../env.ts';
import { STUDIO_VERSION } from '../version.ts';
import { InstallationIdentity } from './installation-identity.ts';
import { exportedLogger, StudioSerialization } from './telemetry-export.ts';

export const POSTHOG_OTLP_ENDPOINT = 'https://us.i.posthog.com/i';

export type TracedProgram =
  | 'serve'
  | 'worker'
  | 'migrate'
  | 'maintenance'
  | 'rotate-secrets';

type TelemetryDestination = {
  readonly baseUrl: string;
  readonly headers: Readonly<Record<string, string>>;
};

const telemetryDestination = (
  env: Pick<StudioEnv, 'telemetry' | 'telemetryEndpoint' | 'telemetryHeaders'>,
): TelemetryDestination | null => {
  if (!env.telemetry) return null;
  if (env.telemetryEndpoint === undefined) {
    return {
      baseUrl: POSTHOG_OTLP_ENDPOINT,
      headers: { Authorization: `Bearer ${POSTHOG_API_KEY}` },
    };
  }
  return {
    baseUrl: env.telemetryEndpoint,
    headers:
      env.telemetryHeaders === undefined
        ? {}
        : Redacted.value(env.telemetryHeaders),
  };
};

const exporters = (
  program: TracedProgram,
  destination: TelemetryDestination,
): Layer.Layer<never, never, InstallationIdentity> => {
  const base = destination.baseUrl.replace(/\/+$/, '');
  const options = {
    resource: {
      serviceName: 'studio-api',
      serviceVersion: STUDIO_VERSION,
      attributes: { 'studio.program': program },
    },
    headers: destination.headers,
  };
  return Layer.mergeAll(
    OtlpTracer.layer({ ...options, url: `${base}/v1/traces` }),
    OtlpMetrics.layer({ ...options, url: `${base}/v1/metrics` }),
    Logger.layer(
      [
        Effect.map(
          OtlpLogger.make({ ...options, url: `${base}/v1/logs` }),
          exportedLogger,
        ),
      ],
      { mergeWithExisting: true },
    ).pipe(Layer.provideMerge(OtlpExporter.layerFlusher)),
  ).pipe(
    Layer.provide(StudioSerialization),
    Layer.provide(FetchHttpClient.layer),
  );
};

export const TracingLive = (
  program: TracedProgram,
): Layer.Layer<InstallationIdentity, never, Environment> =>
  Layer.unwrap(
    Effect.map(Environment, (env) => {
      const destination = telemetryDestination(env);
      return destination === null
        ? Layer.empty
        : exporters(program, destination);
    }),
  ).pipe(Layer.provideMerge(InstallationIdentity.layer));
