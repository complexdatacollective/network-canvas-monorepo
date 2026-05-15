import type { PostHog } from 'posthog-js';

import { INSTANCE_NAME, POSTHOG_API_KEY, POSTHOG_HOST } from './PROPERTY_KEYS';

type ResolveArgs = {
  disableAnalytics: boolean;
  posthogClient?: PostHog;
};

export async function resolveClient({
  disableAnalytics,
  posthogClient,
}: ResolveArgs): Promise<PostHog | null> {
  if (disableAnalytics) return null;
  if (posthogClient) return posthogClient;

  try {
    const { default: posthog } = await import('posthog-js');
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
