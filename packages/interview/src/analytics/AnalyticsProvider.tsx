'use client';

import type { PostHog } from 'posthog-js';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import type {
  InterviewAnalyticsMetadata,
  InterviewPayload,
} from '../contract/types';
import { AnalyticsContext } from './AnalyticsContext';
import { resolveClient } from './resolveClient';
import { computeSuperProperties } from './superProperties';
import { createTracker, NULL_TRACKER, type Tracker } from './tracker';

type AnalyticsProviderProps = {
  analytics: InterviewAnalyticsMetadata;
  posthogClient?: PostHog;
  disableAnalytics: boolean;
  payload: InterviewPayload;
  onTrackerChange?: (tracker: Tracker) => void;
  children: ReactNode;
};

export function AnalyticsProvider({
  analytics,
  posthogClient,
  disableAnalytics,
  payload,
  onTrackerChange,
  children,
}: AnalyticsProviderProps) {
  const [tracker, setTracker] = useState<Tracker>(NULL_TRACKER);

  const superProperties = useMemo(
    () => computeSuperProperties(analytics, payload),
    [analytics, payload],
  );
  const distinctId = payload.session.id;

  useEffect(() => {
    if (disableAnalytics) {
      setTracker(NULL_TRACKER);
      onTrackerChange?.(NULL_TRACKER);
      return;
    }
    let cancelled = false;
    void (async () => {
      const client = await resolveClient({ disableAnalytics, posthogClient });
      if (cancelled) return;
      if (!client) {
        setTracker(NULL_TRACKER);
        onTrackerChange?.(NULL_TRACKER);
        return;
      }
      const ownsInstance = !posthogClient;
      if (ownsInstance) {
        try {
          client.register(superProperties);
        } catch {
          // Ignore registration failures; tracker still works.
        }
      }
      const next = createTracker({
        client,
        superProperties,
        distinctId,
        ownsInstance,
      });
      setTracker(next);
      onTrackerChange?.(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    disableAnalytics,
    posthogClient,
    superProperties,
    distinctId,
    onTrackerChange,
  ]);

  return (
    <AnalyticsContext.Provider value={tracker}>
      {children}
    </AnalyticsContext.Provider>
  );
}
