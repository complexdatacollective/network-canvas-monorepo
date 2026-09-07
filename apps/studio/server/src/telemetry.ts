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

export type ServerTelemetry = {
  capture(diagnostic: TelemetryDiagnostic, error: unknown): void;
  flush(): Promise<void>;
  close(): Promise<void>;
};

/** No import/construction, listeners, timers or egress when disabled. */
export async function createServerTelemetry(
  enabled: boolean,
  context: TelemetryContext,
): Promise<ServerTelemetry> {
  if (!enabled) return { capture() {}, async flush() {}, async close() {} };
  const { PostHog } = await import('posthog-node');
  const client = new PostHog(POSTHOG_API_KEY, {
    host: POSTHOG_HOST,
    enableExceptionAutocapture: false,
    enableLocalEvaluation: false,
    privacyMode: true,
    disableGeoip: true,
    disableCompression: true,
    flushAt: 1,
    flushInterval: 0,
    maxQueueSize: 20,
    requestTimeout: 750,
    fetchRetryCount: 0,
    before_send(event) {
      if (event?.event !== '$exception') return null;
      const report = TelemetryReportSchema.safeParse(event.properties);
      if (!report.success) return null;
      return {
        event: '$exception',
        distinctId: 'studio-server',
        properties: {
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
  const admit = createTelemetryBudget();
  let closed = false;
  // Telemetry failures are never fed back into the error reporter or logs.
  client.on('error', () => undefined);
  async function bounded(action: () => Promise<void>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        action(),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 1_000);
        }),
      ]);
    } catch {
      /* Best effort; callers retain their original failure policy. */
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return {
    capture(diagnostic, error) {
      if (closed || !admit()) return;
      const report = buildTelemetryReport(context, diagnostic, error);
      if (!report) return;
      // Never give the SDK a raw thrown value: its parser also reads causes,
      // custom properties and source lines. before_send replaces this safe
      // placeholder's SDK-generated stack with our allowlisted chunk frames.
      const safe = new Error(diagnostic);
      safe.stack = '';
      try {
        client.captureException(safe, 'studio-server', report);
      } catch {
        /* Reporting cannot affect the request, worker or fatal policy. */
      }
    },
    flush: () => bounded(() => client.flush()),
    async close() {
      if (closed) return;
      closed = true;
      await bounded(() => client.shutdown(900));
    },
  };
}
