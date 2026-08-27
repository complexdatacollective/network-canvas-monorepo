'use client';

import { useEffect } from 'react';

import { startPostHog, stopPostHog } from '~/lib/posthog-client';

/**
 * Starts or stops PostHog in the browser, following the server's decision.
 *
 * `enabled` is resolved on the server (see `AnalyticsLoader`) because loading
 * PostHog at all is what generates traffic to the relay — when it is false,
 * posthog-js is never fetched. It is still rendered in that case so that
 * turning analytics off in the settings, which re-renders this component,
 * stops a client this tab had already started rather than leaving it capturing
 * until the next full page load.
 */
export function PostHogBootstrap({
  enabled,
  installationId,
}: {
  enabled: boolean;
  installationId?: string;
}) {
  useEffect(() => {
    if (!enabled) {
      void stopPostHog();
      return;
    }

    void startPostHog(installationId);
  }, [enabled, installationId]);

  return null;
}
