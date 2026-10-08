import type { ComponentProps } from 'react';

import type { Shell } from '@codaco/interview';
import {
  analyticsPropertiesBytes,
  MAX_ANALYTICS_EVENTS,
  MAX_ANALYTICS_PROPERTIES_BYTES,
} from '@codaco/studio-contract/schema/participant';

import { participantAnalytics } from '../runtime/participantRpc.ts';

type AnalyticsClient = NonNullable<
  ComponentProps<typeof Shell>['posthogClient']
>;

type QueuedEvent = {
  readonly event: string;
  readonly properties: Record<string, unknown>;
  readonly timestamp: string;
};

type Send = (
  events: readonly QueuedEvent[],
  options: { readonly unloading: boolean },
) => Promise<void>;

export type ParticipantAnalyticsClient = AnalyticsClient & {
  readonly flush: (options?: { readonly unloading: boolean }) => void;
};

const FLUSH_DELAY_MS = 2000;

const sendThroughStudio =
  (sessionToken: string): Send =>
  (events, { unloading }) =>
    participantAnalytics({ events }, { sessionToken, unloading });

const exceptionProperties = (error: unknown) => {
  const type = error instanceof Error ? error.name : 'Error';
  return {
    $exception_list: [
      {
        type,
        value: type,
        mechanism: { handled: true, synthetic: false },
      },
    ],
  };
};

export function createParticipantAnalyticsClient(
  sessionToken: string,
  send: Send = sendThroughStudio(sessionToken),
  now: () => Date = () => new Date(),
): ParticipantAnalyticsClient {
  let queue: QueuedEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = ({
    unloading = false,
  }: { readonly unloading?: boolean } = {}) => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    while (queue.length > 0) {
      const batch = queue.slice(0, MAX_ANALYTICS_EVENTS);
      queue = queue.slice(MAX_ANALYTICS_EVENTS);
      send(batch, { unloading }).catch(() => undefined);
    }
  };

  const enqueue = (event: string, properties: Record<string, unknown>) => {
    if (analyticsPropertiesBytes(properties) > MAX_ANALYTICS_PROPERTIES_BYTES) {
      return;
    }
    queue.push({ event, properties, timestamp: now().toISOString() });
    if (queue.length >= MAX_ANALYTICS_EVENTS) {
      flush();
      return;
    }
    timer ??= setTimeout(() => flush(), FLUSH_DELAY_MS);
  };

  return {
    capture: (event, properties) => {
      enqueue(event, { ...properties });
      return undefined;
    },
    captureException: (error, properties) => {
      enqueue('$exception', {
        ...properties,
        ...exceptionProperties(error),
      });
      return undefined;
    },
    register: () => undefined,
    flush,
  };
}
