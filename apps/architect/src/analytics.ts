import posthog from 'posthog-js';

import { appVersion } from './utils/appVersion';

const POSTHOG_HOST = 'https://ph-relay.networkcanvas.com';
const INSTALLATION_ID_KEY = 'network-canvas-architect-installation-id';
const APP_NAME = 'ArchitectWeb';

function getOrCreateInstallationId(): string {
  const existing = localStorage.getItem(INSTALLATION_ID_KEY);
  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID();
  localStorage.setItem(INSTALLATION_ID_KEY, id);
  return id;
}

type AnalyticsEnvironment = {
  apiKey?: string;
  disabled: boolean;
  isDevelopment: boolean;
};

export function initializeAnalytics({
  apiKey,
  disabled,
  isDevelopment,
}: AnalyticsEnvironment): void {
  if (isDevelopment || disabled || !apiKey) {
    return;
  }

  posthog.init(apiKey, {
    api_host: POSTHOG_HOST,
    capture_pageview: true,
    capture_pageleave: true,
    capture_exceptions: true,
    // Architect edits IRB-sensitive study text (stage/prompt/variable/option
    // labels) and can render a plaintext Mapbox API key on screen. Autocapture
    // would send element text as $el_text, and session recording would capture
    // that text/keystrokes to the relay — both are disabled, and recording is
    // additionally forced to mask all text/inputs as a defence in depth.
    autocapture: false,
    disable_session_recording: true,
    session_recording: {
      recordCrossOriginIframes: false,
      maskAllInputs: true,
      maskTextSelector: '*',
    },
    cross_subdomain_cookie: false,
    persistence: 'localStorage+cookie',
    // Architect has no user accounts. Keep its events anonymous rather than
    // creating PostHog person profiles for random installation UUIDs.
    person_profiles: 'identified_only',
  });

  posthog.register({
    app: APP_NAME,
    $app_name: APP_NAME,
    installation_id: getOrCreateInstallationId(),
    host_version: appVersion,
    $app_version: appVersion,
  });
}

initializeAnalytics({
  apiKey: import.meta.env.VITE_PUBLIC_POSTHOG_KEY,
  disabled: import.meta.env.VITE_DISABLE_ANALYTICS === 'true',
  isDevelopment: import.meta.env.DEV,
});

export { posthog };
