import posthog from 'posthog-js';

import {
  buildAppSuperProperties,
  POSTHOG_API_KEY,
  POSTHOG_HOST,
} from '@codaco/shared-consts';

import { appVersion } from './utils/appVersion';

const INSTALLATION_ID_KEY = 'network-canvas-architect-installation-id';
const APP_KEY = 'ArchitectWeb';
const APP_NAME = 'Architect';

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
  disabled: boolean;
  isDevelopment: boolean;
};

export function initializeAnalytics({
  disabled,
  isDevelopment,
}: AnalyticsEnvironment): void {
  // The two ways analytics is off are both deliberate and both local: a Vite
  // development server, or an explicit opt-out for e2e/preview builds. The
  // project key is a compiled-in shared constant, so there is no third,
  // accidental way — a release build that forgot to set something.
  if (isDevelopment || disabled) {
    return;
  }

  posthog.init(POSTHOG_API_KEY, {
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

  posthog.register(
    buildAppSuperProperties({
      appKey: APP_KEY,
      appName: APP_NAME,
      version: appVersion,
      installationId: getOrCreateInstallationId(),
    }),
  );
}

initializeAnalytics({
  disabled: import.meta.env.VITE_DISABLE_ANALYTICS === 'true',
  isDevelopment: import.meta.env.DEV,
});

export { posthog };
