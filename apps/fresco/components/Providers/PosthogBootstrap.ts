'use client';

import { useEffect } from 'react';

import { startPostHog } from '~/lib/posthog-client';

/**
 * Loads and starts PostHog in the browser.
 *
 * Rendered only once the server has confirmed this deployment has analytics
 * enabled (see `AnalyticsLoader`), because loading PostHog at all is what
 * generates traffic to the relay.
 */
export function PostHogBootstrap({
  installationId,
}: {
  installationId?: string;
}) {
  useEffect(() => {
    void startPostHog(installationId);
  }, [installationId]);

  return null;
}
