import type { PostHog } from 'posthog-js';

import {
  POSTHOG_API_KEY,
  POSTHOG_APP_PROPERTIES,
  POSTHOG_PROXY_HOST,
} from '~/fresco.config';

let clientPromise: Promise<PostHog> | undefined;

// Exceptions raised before analytics finished starting, replayed by
// startPostHog. Capped because a deployment with analytics off never starts,
// and this would otherwise grow for the life of the tab.
const MAX_PENDING_EXCEPTIONS = 10;
const pendingExceptions: unknown[] = [];

/**
 * Loads posthog-js and initialises it.
 *
 * Deliberately not called at module scope. `posthog.init()` immediately
 * fetches the project's remote config, every extension script that config
 * names (session replay, surveys, exception autocapture, dead clicks) and the
 * feature flags. None of those are suppressed by opting out — a browser with
 * capturing explicitly denied still makes all of them — so the only way to
 * honour `DISABLE_ANALYTICS` is to never reach this function. That decision is
 * made on the server, in `AnalyticsLoader`.
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

    // Registered here, before startPostHog opts in, because opting in captures
    // an event of its own — it would otherwise be the one event missing the
    // properties that attribute it to Fresco.
    posthog.register(POSTHOG_APP_PROPERTIES);

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
  // promise rejected, and callers only ever fire this off.
  try {
    const posthog = await getClient();

    // On every enabled start, not just the first. It repairs the stored
    // consent of a browser opted out while this deployment had analytics
    // disabled — including one stopPostHog opted out moments ago, when a
    // researcher turns analytics off and straight back on without reloading.
    posthog.opt_in_capturing();

    if (installationId) {
      posthog.register({
        ...POSTHOG_APP_PROPERTIES,
        installation_id: installationId,
      });
      posthog.identify(installationId);
    }

    while (pendingExceptions.length > 0) {
      posthog.captureException(pendingExceptions.shift());
    }
  } catch {
    // Analytics stay off for this page. Nothing else depends on them.
  }
}

/**
 * Stops analytics in this tab, for when a researcher turns them off while the
 * app is open. Never loads posthog-js just to opt out: if this tab never
 * started analytics there is nothing to stop.
 */
export async function stopPostHog() {
  // Anything an error boundary queued while the server's decision was still
  // in flight was collected under a setting that turns out to be "off".
  // Enabling analytics later must not retroactively report it.
  pendingExceptions.length = 0;

  if (!clientPromise) {
    return;
  }

  try {
    const posthog = await clientPromise;
    posthog.opt_out_capturing();
  } catch {
    // Nothing was ever capturing.
  }
}

/**
 * Reports a client-side exception, waiting for analytics to start if they
 * haven't yet.
 *
 * The error boundaries render before analytics do, so calling posthog-js
 * directly would silently drop the exception — capture before `init()` is a
 * no-op. If analytics never start, the exception is dropped, which is the
 * point: a deployment with analytics off reports nothing.
 */
export function captureClientException(error: unknown) {
  if (!clientPromise) {
    if (pendingExceptions.length < MAX_PENDING_EXCEPTIONS) {
      pendingExceptions.push(error);
    }
    return;
  }

  void clientPromise
    .then((posthog) => posthog.captureException(error))
    .catch(() => {
      // Telemetry must never throw, least of all while reporting an error.
    });
}
