import posthog from 'posthog-js';

import { isProductionHost } from '~/lib/analytics/isProductionHost';

const POSTHOG_API_KEY = 'phc_OThPUolJumHmf142W78TKWtjoYYAxGlF0ZZmhcV7J3c';
const POSTHOG_HOST = 'https://ph-relay.networkcanvas.com';

if (isProductionHost(window.location.hostname)) {
  posthog.init(POSTHOG_API_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: true,
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
