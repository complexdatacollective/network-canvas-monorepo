import type { PostHog } from 'posthog-js/dist/module.slim.no-external';

import {
  buildAppSuperProperties,
  POSTHOG_API_KEY,
  POSTHOG_HOST,
} from '@codaco/shared-consts';
import {
  buildTelemetryReport,
  createTelemetryBudget,
  exceptionProperties,
  TelemetryReportSchema,
  type TelemetryContext,
  type TelemetryDiagnostic,
} from '@codaco/studio-rpc/telemetry';

export function createClientTelemetry() {
  let client: PostHog | undefined;
  let context: TelemetryContext | undefined;
  let started = false;
  let stopped = false;
  let removeHooks: (() => void) | undefined;
  const admit = createTelemetryBudget();
  const seen = new WeakSet<object>();

  function capture(diagnostic: TelemetryDiagnostic, error: unknown) {
    if (!client || !context || stopped || !admit()) return;
    if (typeof error === 'object' && error !== null) {
      if (seen.has(error)) return;
      seen.add(error);
    }
    const report = buildTelemetryReport(context, diagnostic, error);
    try {
      if (report) client.capture('$exception', report);
    } catch {
      /* Reporting cannot change the error screen or browser failure policy. */
    }
  }

  return {
    capture,
    async start(enabled: boolean, nextContext: TelemetryContext) {
      // A negative/unknown server decision never imports the SDK. There are
      // no buffered raw errors, cookies, consent state or opt_out-after-init.
      if (!enabled || started || stopped) return;
      started = true;
      const { PostHog: Client } =
        await import('posthog-js/dist/module.slim.no-external');
      if (stopped) return;
      context = nextContext;
      client = new Client();
      client.init(POSTHOG_API_KEY, {
        api_host: POSTHOG_HOST,
        defaults: '2026-01-30',
        advanced_disable_flags: true,
        disable_external_dependency_loading: true,
        capture_exceptions: false,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_dead_clicks: false,
        capture_heatmaps: false,
        capture_performance: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_product_tours: true,
        disable_conversations: true,
        person_profiles: 'never',
        persistence: 'memory',
        disable_persistence: true,
        ip: false,
        request_batching: false,
        disable_compression: true,
        before_send(event) {
          if (stopped || event?.event !== '$exception') return null;
          const report = TelemetryReportSchema.safeParse(event.properties);
          if (!report.success) return null;
          return {
            uuid: event.uuid,
            event: '$exception',
            properties: {
              token: POSTHOG_API_KEY,
              distinct_id: 'studio-client',
              ...buildAppSuperProperties({
                appKey: 'Studio',
                appName: 'Studio',
                version: report.data.studio_version,
              }),
              ...exceptionProperties(report.data),
            },
          };
        },
      });
      const onError = (event: ErrorEvent) =>
        capture('client_error', event.error);
      const onRejection = (event: PromiseRejectionEvent) =>
        capture('client_unhandled_rejection', event.reason);
      window.addEventListener('error', onError);
      window.addEventListener('unhandledrejection', onRejection);
      removeHooks = () => {
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
      };
    },
    async close() {
      stopped = true;
      removeHooks?.();
      removeHooks = undefined;
      try {
        await client?.shutdown();
      } catch {
        /* Best-effort SDK teardown. */
      }
      client = undefined;
    },
  };
}

// The one owner for the app root and route-error boundary. Creating this
// controller has no SDK or browser side effects; start requires runtime status.
export const clientTelemetry = createClientTelemetry();
