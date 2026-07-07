import posthog from 'posthog-js';

const POSTHOG_API_KEY = 'phc_OThPUolJumHmf142W78TKWtjoYYAxGlF0ZZmhcV7J3c';
const POSTHOG_HOST = 'https://ph-relay.networkcanvas.com';
const INSTALLATION_ID_KEY = 'network-canvas-architect-installation-id';

function getOrCreateInstallationId(): string {
  const existing = localStorage.getItem(INSTALLATION_ID_KEY);
  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID();
  localStorage.setItem(INSTALLATION_ID_KEY, id);
  return id;
}

if (import.meta.env.VITE_DISABLE_ANALYTICS !== 'true') {
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
  });

  posthog.register({
    app: 'ArchitectWeb',
    installation_id: getOrCreateInstallationId(),
  });

  if (import.meta.env.DEV) {
    posthog.debug();
  }
}

export { posthog };
