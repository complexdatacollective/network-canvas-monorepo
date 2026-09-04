import type { PostHog } from 'posthog-js';

import {
  createEntityIdPseudonymiser,
  type EntityIdPseudonymiser,
  pseudonymiseEntityIds,
} from './entityIds';
import type { SuperProperties } from './PROPERTY_KEYS';

export type EventProps = {
  [key: string]: unknown;
};

export type Tracker = {
  track: (eventName: string, props?: EventProps) => void;
  captureException: (error: Error, props?: EventProps) => void;
};

type CreateTrackerArgs = {
  client: PostHog;
  superProperties: SuperProperties;
  distinctId: string;
  ownsInstance: boolean;
  /**
   * Session-scoped entity-id pseudonymiser (see `./entityIds`). Supplied by
   * `AnalyticsProvider` so a node keeps one pseudonym even when the tracker is
   * rebuilt mid-session. Defaults to a fresh one — a tracker without a session
   * mapping still pseudonymises, it just cannot correlate with another
   * tracker's events.
   */
  pseudonymiseEntityId?: EntityIdPseudonymiser;
};

export function createTracker({
  client,
  superProperties,
  distinctId,
  ownsInstance,
  pseudonymiseEntityId = createEntityIdPseudonymiser(),
}: CreateTrackerArgs): Tracker {
  const merge = (props: EventProps | undefined): EventProps => ({
    ...(ownsInstance ? {} : superProperties),
    // Entity ids are pseudonymised here, at the one boundary every emitter
    // passes through, rather than at each call site.
    ...pseudonymiseEntityIds(props, pseudonymiseEntityId),
    distinct_id: distinctId,
  });

  return {
    track: (eventName, props) => {
      try {
        client.capture(eventName, merge(props));
      } catch {
        // Never let analytics throw into the calling code path.
      }
    },
    captureException: (error, props) => {
      try {
        client.captureException(error, merge(props));
      } catch {
        // Same: never throw out of analytics.
      }
    },
  };
}

export const NULL_TRACKER: Tracker = {
  track: () => {},
  captureException: () => {},
};
