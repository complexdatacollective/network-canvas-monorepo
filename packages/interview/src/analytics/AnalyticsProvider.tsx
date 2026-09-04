'use client';

import type { PostHog } from 'posthog-js';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import type {
  InterviewAnalyticsMetadata,
  InterviewPayload,
} from '../contract/types';
import { AnalyticsContext } from './AnalyticsContext';
import {
  createEntityIdPseudonymiser,
  type EntityIdPseudonymiser,
} from './entityIds';
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

  // One entity-id pseudonym mapping per interview session, held in memory only
  // (see ./entityIds). It outlives the tracker deliberately: a tracker rebuilt
  // mid-session — a new super-property object, a client resolving late — must
  // keep reporting the same pseudonym for a node, or one node's events split in
  // two. Keyed on the session id so a different session can never reuse a
  // mapping, in a ref rather than a memo because a discarded memo would silently
  // renumber a live session's nodes.
  const pseudonymiserRef = useRef<{
    sessionId: string;
    pseudonymise: EntityIdPseudonymiser;
  } | null>(null);
  if (pseudonymiserRef.current?.sessionId !== distinctId) {
    pseudonymiserRef.current = {
      sessionId: distinctId,
      pseudonymise: createEntityIdPseudonymiser(),
    };
  }
  const pseudonymiseEntityId = pseudonymiserRef.current.pseudonymise;

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
        pseudonymiseEntityId,
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
    pseudonymiseEntityId,
    onTrackerChange,
  ]);

  return (
    <AnalyticsContext.Provider value={tracker}>
      {children}
    </AnalyticsContext.Provider>
  );
}
