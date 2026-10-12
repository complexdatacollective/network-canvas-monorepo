import { INSTANCE_NAME, POSTHOG_API_KEY, POSTHOG_HOST } from './PROPERTY_KEYS';
import type { AnalyticsClient } from './tracker';

type ResolveArgs = {
  disableAnalytics: boolean;
  posthogClient?: AnalyticsClient;
};

export async function resolveClient({
  disableAnalytics,
  posthogClient,
}: ResolveArgs): Promise<AnalyticsClient | null> {
  if (disableAnalytics) return null;
  if (posthogClient) return posthogClient;

  try {
    // The runtime's own instance must never fetch scripts from the relay: the
    // no-external build has no script loader, so it works under a host's
    // `script-src 'self'` policy and nothing this instance is configured for
    // (no replay, surveys or exception autocapture) needs one.
    const { default: posthog } =
      await import('posthog-js/dist/module.no-external');
    return posthog.init(
      POSTHOG_API_KEY,
      {
        api_host: POSTHOG_HOST,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        persistence: 'memory',
      },
      INSTANCE_NAME,
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      '[@codaco/interview] failed to init analytics client; events suppressed',
      e,
    );
    return null;
  }
}
