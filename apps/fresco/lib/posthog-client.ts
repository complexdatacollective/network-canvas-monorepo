import type { PostHog } from 'posthog-js';

import {
  POSTHOG_API_KEY,
  POSTHOG_APP_PROPERTIES,
  POSTHOG_PROXY_HOST,
} from '~/fresco.config';

let clientPromise: Promise<PostHog> | undefined;

/**
 * Loads posthog-js and initialises it.
 *
 * Deliberately not called at module scope. `posthog.init()` immediately
 * fetches the project's remote config, every extension script that config
 * names (session replay, surveys, exception autocapture, dead clicks) and the
 * feature flags. None of those are suppressed by opting out — a browser with
 * capturing explicitly denied still makes all of them — so the only way to
 * honour `DISABLE_ANALYTICS` is to never reach this function. That decision is
 * made on the server, in `AnalyticsLoader`, before the browser is asked to
 * load anything.
 */
async function getClient(): Promise<PostHog> {
  clientPromise ??= import('posthog-js').then(({ default: posthog }) => {
    posthog.init(POSTHOG_API_KEY, {
      api_host: POSTHOG_PROXY_HOST,
      defaults: '2026-01-30',
      capture_exceptions: true,
      autocapture: true,
      tracing_headers: [window.location.hostname],
    });

    // Repairs the stored consent of a browser that was opted out while this
    // deployment had analytics disabled. Without it, that browser would stay
    // silent for good once analytics were switched back on.
    posthog.opt_in_capturing();

    return posthog;
  });

  return clientPromise;
}

/**
 * Starts analytics for this browser, identifying it by the deployment's
 * installation ID so events group by deployment rather than by person.
 */
export async function startPostHog(installationId?: string) {
  // Telemetry must never throw. A failed chunk load leaves the memoized
  // promise rejected, and the caller only ever fires this off.
  try {
    const posthog = await getClient();

    posthog.register({
      ...POSTHOG_APP_PROPERTIES,
      ...(installationId ? { installation_id: installationId } : {}),
    });

    if (installationId) {
      posthog.identify(installationId);
    }
  } catch {
    // Analytics stay off for this page. Nothing else depends on them.
  }
}
