import { z } from 'zod';

import { DEPLOYMENT_MODES, type DeploymentMode } from './surfaces.ts';

// Studio's unpublished diagnostic boundary. Other products deliberately have
// different analytics policies; they share the relay/product constants, not
// this strict, identifier-free error payload. No caller can supply properties.
export const TELEMETRY_DIAGNOSTICS = [
  'server_request',
  'server_rpc',
  'server_worker',
  'server_uncaught_exception',
  'server_unhandled_rejection',
  'client_error',
  'client_unhandled_rejection',
  'client_render',
] as const;
export type TelemetryDiagnostic = (typeof TELEMETRY_DIAGNOSTICS)[number];
export type TelemetryRuntime =
  | 'web'
  | 'worker'
  | 'both'
  | 'function'
  | 'client';
export type TelemetryContext = {
  mode: DeploymentMode;
  runtime: TelemetryRuntime;
  version: string;
};

const chunkIdSchema = z.uuid();
const frameSchema = z.object({
  platform: z.enum(['node:javascript', 'web:javascript']),
  filename: z.literal('studio.js'),
  function: z.literal('compiled'),
  chunk_id: chunkIdSchema,
  lineno: z.number().int().min(1).max(10_000_000),
  colno: z.number().int().min(1).max(10_000_000),
});

// Reapplied at the SDK's last before_send boundary. Every object schema strips
// unknown fields, including SDK browser URLs, referrers, sessions and identity.
export const TelemetryReportSchema = z.object({
  studio_diagnostic: z.enum(TELEMETRY_DIAGNOSTICS),
  studio_deployment_mode: z.enum(DEPLOYMENT_MODES),
  studio_runtime: z.enum(['web', 'worker', 'both', 'function', 'client']),
  studio_version: z
    .string()
    .regex(/^\d{1,6}\.\d{1,6}\.\d{1,6}(?:-[a-zA-Z0-9.-]{1,32})?$/),
  studio_frames: z.array(frameSchema).max(12),
});
export type TelemetryReport = z.infer<typeof TelemetryReportSchema>;

type Location = { filename: string; lineno: number; colno: number };

function locations(stack: string): Location[] {
  return stack
    .slice(0, 16_384)
    .split('\n')
    .slice(1, 33)
    .flatMap((line) => {
      // V8 and Firefox/WebKit locations, without invoking an error's name,
      // message, cause, toString, JSON conversion or source-context machinery.
      const match =
        /(?:^\s*at (?:.*? \()?|@)([^()\s]+):(\d{1,8}):(\d{1,8})\)?$/.exec(
          line.slice(0, 2048),
        );
      if (!match?.[1]) return [];
      return [
        {
          filename: match[1],
          lineno: Number(match[2]),
          colno: Number(match[3]),
        },
      ];
    });
}

function frames(error: unknown, runtime: TelemetryRuntime) {
  try {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('stack' in error) ||
      typeof error.stack !== 'string'
    )
      return [];
    // The upload CLI records each executing compiled chunk's own stack and
    // UUID. Only locations in those exact files qualify. Filenames, origins,
    // query strings and function names never leave this process; chunk_id
    // identifies the uploaded source map. Builds without maps report codes.
    const global = globalThis as typeof globalThis & {
      _posthogChunkIds?: unknown;
    };
    const chunks = global._posthogChunkIds;
    if (typeof chunks !== 'object' || chunks === null) return [];
    const known = new Map<string, string>();
    for (const [stack, id] of Object.entries(chunks).slice(0, 512)) {
      const parsed = chunkIdSchema.safeParse(id);
      const location = locations(stack)[0];
      if (parsed.success && location) known.set(location.filename, parsed.data);
    }
    return locations(error.stack)
      .flatMap((location) => {
        const id = known.get(location.filename);
        if (!id) return [];
        const parsed = frameSchema.safeParse({
          platform: runtime === 'client' ? 'web:javascript' : 'node:javascript',
          filename: 'studio.js',
          function: 'compiled',
          chunk_id: id,
          lineno: location.lineno,
          colno: location.colno,
        });
        return parsed.success ? [parsed.data] : [];
      })
      .slice(0, 12)
      .reverse();
  } catch {
    // Thrown proxies and getters are valid thrown values, never a new failure.
    return [];
  }
}

export function buildTelemetryReport(
  context: TelemetryContext,
  diagnostic: TelemetryDiagnostic,
  error: unknown,
): TelemetryReport | undefined {
  const parsed = TelemetryReportSchema.safeParse({
    studio_diagnostic: diagnostic,
    studio_deployment_mode: context.mode,
    studio_runtime: context.runtime,
    studio_version: context.version,
    studio_frames: frames(error, context.runtime),
  });
  return parsed.success ? parsed.data : undefined;
}

export function exceptionProperties(report: TelemetryReport) {
  const handled = ![
    'server_uncaught_exception',
    'server_unhandled_rejection',
    'client_error',
    'client_unhandled_rejection',
  ].includes(report.studio_diagnostic);
  return {
    studio_diagnostic: report.studio_diagnostic,
    studio_deployment_mode: report.studio_deployment_mode,
    studio_runtime: report.studio_runtime,
    $exception_list: [
      {
        type: 'StudioError',
        value: report.studio_diagnostic,
        mechanism: {
          handled,
          synthetic: false,
          type: handled
            ? 'generic'
            : report.studio_diagnostic.endsWith('unhandled_rejection')
              ? 'onunhandledrejection'
              : 'onuncaughtexception',
        },
        stacktrace: { type: 'raw', frames: report.studio_frames },
      },
    ],
    $exception_level: handled ? 'error' : 'fatal',
    $process_person_profile: false,
    $geoip_disable: true,
    $ip: null,
  };
}

/** Bounded error storms, with no timer, identity map or retained exceptions. */
export function createTelemetryBudget() {
  let credits = 10;
  let last = Date.now();
  return () => {
    const now = Date.now();
    credits = Math.min(10, credits + Math.max(0, now - last) / 10_000);
    last = now;
    if (credits < 1) return false;
    credits -= 1;
    return true;
  };
}
