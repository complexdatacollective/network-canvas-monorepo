import type { PostHog } from 'posthog-js';

import type { SuperProperties } from './PROPERTY_KEYS';

export type EventProps = Record<string, unknown>;

export type Tracker = {
  track: (eventName: string, props?: EventProps) => void;
  captureException: (error: Error, props?: EventProps) => void;
};

type CreateTrackerArgs = {
  client: PostHog;
  superProperties: SuperProperties;
  distinctId: string;
  ownsInstance: boolean;
};

export function createTracker({
  client,
  superProperties,
  distinctId,
  ownsInstance,
}: CreateTrackerArgs): Tracker {
  const merge = (props: EventProps | undefined): EventProps => ({
    ...(ownsInstance ? {} : superProperties),
    ...props,
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
