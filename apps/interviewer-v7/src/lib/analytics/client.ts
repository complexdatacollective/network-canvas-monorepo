import type { PostHog } from 'posthog-js';

import { POSTHOG_API_KEY, POSTHOG_HOST, POSTHOG_INSTANCE_NAME } from './config';

// Single lazily-initialised posthog-js client shared by the app and (via the
// AnalyticsProvider) the `@codaco/interview` Shell. Initialisation is async
// because posthog-js is dynamically imported to keep it out of the initial
// bundle and so a failure to load never breaks app startup.
let clientPromise: Promise<PostHog | null> | null = null;

export function getAnalyticsClient(): Promise<PostHog | null> {
  clientPromise ??= initClient();
  return clientPromise;
}

async function initClient(): Promise<PostHog | null> {
  try {
    const { default: posthog } = await import('posthog-js');
    return posthog.init(
      POSTHOG_API_KEY,
      {
        api_host: POSTHOG_HOST,
        // This is a research-data-collection app, not a website: never capture
        // DOM interactions, page views, or session recordings, any of which
        // could incidentally include participant data on screen.
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        // Autocapture *uncaught* exceptions and unhandled rejections for error
        // tracking. These carry stack traces only, never network/participant
        // data.
        capture_exceptions: true,
        // Persist opt-in/opt-out state across launches.
        persistence: 'localStorage',
        // Respect the stored preference: start opted out and let the
        // AnalyticsProvider opt in once it has read the setting.
        opt_out_capturing_by_default: true,
      },
      POSTHOG_INSTANCE_NAME,
    );
  } catch {
    // Telemetry must never break the app. Swallow and run without analytics.
    return null;
  }
}
