import posthog from 'posthog-js';

import { isProductionHost } from '~/lib/analytics/isProductionHost';

const POSTHOG_API_KEY = 'phc_OThPUolJumHmf142W78TKWtjoYYAxGlF0ZZmhcV7J3c';
const POSTHOG_HOST = 'https://ph-relay.networkcanvas.com';

if (isProductionHost(window.location.hostname)) {
  posthog.init(POSTHOG_API_KEY, {
    api_host: POSTHOG_HOST,
    // 'history_change', not `true`: the site navigates client-side through the App
    // Router, and plain `true` only captures the initial load, not the pages
    // visited after it.
    capture_pageview: 'history_change',
    capture_pageleave: true,
    capture_exceptions: true,
    autocapture: true,
    disable_session_recording: false,
    session_recording: {
      recordCrossOriginIframes: false,
    },
    cross_subdomain_cookie: false,
    persistence: 'localStorage+cookie',
  });

  posthog.register({
    app: 'Website',
    installation_id: 'website-production',
  });
}
