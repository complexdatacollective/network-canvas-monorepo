import posthog from 'posthog-js';

import {
  buildAppSuperProperties,
  POSTHOG_API_KEY,
  POSTHOG_HOST,
} from '@codaco/shared-consts';
import { isProductionHost } from '~/lib/analytics/isProductionHost';

import pkg from './package.json' with { type: 'json' };

// Built from the shared helper so this site's events carry the same
// super-property schema as every other Network Canvas product, and a mistyped
// key is a compile error rather than a dimension that quietly stops reporting.
const POSTHOG_APP_PROPERTIES = buildAppSuperProperties({
  appKey: 'Documentation',
  appName: 'Documentation',
  version: pkg.version,
  installationId: 'documentation-production',
});

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

  posthog.register(POSTHOG_APP_PROPERTIES);
}
