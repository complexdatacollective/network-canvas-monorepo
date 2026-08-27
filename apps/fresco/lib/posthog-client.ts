import type { PostHog } from 'posthog-js';

import {
  POSTHOG_API_KEY,
  POSTHOG_APP_PROPERTIES,
  POSTHOG_PROXY_HOST,
} from '~/fresco.config';

let clientPromise: Promise<PostHog> | undefined;
// posthog-js cannot be brought back after shutdown, so once this is set the
// tab stays quiet until the next page load. See stopPostHog.
let shutDown = false;
// The last decision the server gave this tab: undefined until it arrives.
// Loading posthog-js takes a moment, so a start can still be in flight when
// analytics are turned off, and an error boundary can report while the answer
// is still unknown. Both consult this rather than assuming.
let analyticsEnabled: boolean | undefined;

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
  analyticsEnabled = true;

  if (shutDown) {
    return;
  }

  // Telemetry must never throw. A failed chunk load leaves the memoized
  // promise rejected, and callers only ever fire this off.
  try {
    const posthog = await getClient();

    // Analytics may have been turned off while posthog-js was loading, in
    // which case stopPostHog has already run and this start is stale. Opting
    // in now would undo it.
    if (!analyticsEnabled || shutDown) {
      return;
    }

    // On every enabled start, not just the first, so that a browser carrying a
    // stored opt-out — one this deployment wrote while analytics were off —
    // starts capturing again rather than staying silent for good.
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
 * app is open. Never loads posthog-js just to stop it: if this tab never
 * started analytics there is nothing to stop.
 *
 * Opting out is not enough on its own. Measured against the pinned posthog-js:
 * with consent set to denied, the remote-config loader still refreshed feature
 * flags five minutes after init, so a tab left open kept contacting the relay
 * after the deployment had said no. `shutdown()` ends that; with both, the
 * following five minutes produced no requests at all.
 *
 * The cost is that posthog-js cannot be revived afterwards — `init()` sees
 * `__loaded` and returns, so nothing restarts. Analytics therefore resume on
 * the next page load rather than the moment they are switched back on, which
 * is the right way round: a participant's tab must never be reloaded out from
 * under them to apply a setting.
 */
export async function stopPostHog() {
  analyticsEnabled = false;

  // Anything an error boundary queued while the server's decision was still
  // in flight was collected under a setting that turns out to be "off".
  // Enabling analytics later must not retroactively report it.
  pendingExceptions.length = 0;

  if (!clientPromise) {
    return;
  }

  try {
    const posthog = await clientPromise;
    // Opt out first, so the flush inside shutdown has nothing new to send.
    posthog.opt_out_capturing();
    await posthog.shutdown();
    shutDown = true;
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
  // Nothing raised while this deployment says no is reported, queued, or kept
  // for a later change of mind.
  if (shutDown || analyticsEnabled === false) {
    return;
  }

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
