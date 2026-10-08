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
import { ErrorReporter } from './error-reporter.ts';
import { InstallationIdentity } from './installation-identity.ts';
import { LoggerLive, LogLevelLive, studioJson } from './logger.ts';
import { exportedLogger, StudioSerialization } from './telemetry-export.ts';

export const POSTHOG_OTLP_ENDPOINT = 'https://us.i.posthog.com/i';

export type TracedProgram =
  | 'serve'
  | 'worker'
  | 'migrate'
  | 'maintenance'
  | 'rotate-secrets';

type TelemetryDestination = {
  readonly errors: 'posthog' | 'otlp';
  readonly baseUrl: string;
  readonly headers: Readonly<Record<string, string>>;
};

const telemetryDestination = (
  env: Pick<StudioEnv, 'telemetry' | 'telemetryEndpoint' | 'telemetryHeaders'>,
): TelemetryDestination | null => {
  if (!env.telemetry) return null;
  if (env.telemetryEndpoint === undefined) {
    return {
      errors: 'posthog',
      baseUrl: POSTHOG_OTLP_ENDPOINT,
      headers: { Authorization: `Bearer ${POSTHOG_API_KEY}` },
    };
  }
  return {
    errors: 'otlp',
    baseUrl: env.telemetryEndpoint,
    headers:
      env.telemetryHeaders === undefined
        ? {}
        : Redacted.value(env.telemetryHeaders),
  };
};

const signalUrl = (baseUrl: string, path: string): string => {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, '')}${path}`;
  return url.toString();
};

const exporters = (
  program: TracedProgram,
  destination: TelemetryDestination,
): Layer.Layer<never, never, InstallationIdentity> => {
  const options = {
    resource: {
      serviceName: 'studio-api',
      serviceVersion: STUDIO_VERSION,
      attributes: { 'studio.program': program },
    },
    headers: destination.headers,
  };
  return Layer.mergeAll(
    OtlpTracer.layer({
      ...options,
      url: signalUrl(destination.baseUrl, '/v1/traces'),
    }),
    OtlpMetrics.layer({
      ...options,
      url: signalUrl(destination.baseUrl, '/v1/metrics'),
    }),
    Logger.layer(
      [
        studioJson,
        Effect.map(
          OtlpLogger.make({
            ...options,
            url: signalUrl(destination.baseUrl, '/v1/logs'),
          }),
          exportedLogger,
        ),
      ],
      { mergeWithExisting: false },
    ).pipe(Layer.provideMerge(OtlpExporter.layerFlusher)),
  ).pipe(
    Layer.provide(StudioSerialization),
    Layer.provide(FetchHttpClient.layer),
  );
};

export const ObservabilityLive = (
  program: TracedProgram,
): Layer.Layer<InstallationIdentity, never, Environment> =>
  Layer.unwrap(
    Effect.map(Environment, (env) => {
      const destination = telemetryDestination(env);
      if (destination === null) return LoggerLive;
      return Layer.merge(
        exporters(program, destination),
        destination.errors === 'posthog'
          ? ErrorReporter.layerPostHog(program)
          : ErrorReporter.layerOtlp(program),
      );
    }),
  ).pipe(
    Layer.provideMerge(LogLevelLive),
    Layer.provideMerge(InstallationIdentity.layer),
  );
