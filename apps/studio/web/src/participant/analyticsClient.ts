import type { ComponentProps } from 'react';

import type { Shell } from '@codaco/interview';
import { MAX_ANALYTICS_EVENTS } from '@codaco/studio-contract/schema/participant';

import { participantCall } from '../runtime/participantRpc.ts';

type AnalyticsClient = NonNullable<
  ComponentProps<typeof Shell>['posthogClient']
>;

type QueuedEvent = {
  readonly event: string;
  readonly properties: Record<string, unknown>;
  readonly timestamp: string;
};

type Send = (events: readonly QueuedEvent[]) => Promise<void>;

export type ParticipantAnalyticsClient = AnalyticsClient & {
  readonly flush: () => void;
};

const FLUSH_DELAY_MS = 2000;

const sendThroughStudio: Send = (events) =>
  participantCall('participant.analytics', { events });

const exceptionProperties = (error: unknown) => {
  const { name, message } =
    error instanceof Error ? error : new Error(String(error));
  return {
    $exception_list: [
      {
        type: name,
        value: message,
        mechanism: { handled: true, synthetic: false },
      },
    ],
  };
};

export function createParticipantAnalyticsClient(
  send: Send = sendThroughStudio,
  now: () => Date = () => new Date(),
): ParticipantAnalyticsClient {
  let queue: QueuedEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    while (queue.length > 0) {
      const batch = queue.slice(0, MAX_ANALYTICS_EVENTS);
      queue = queue.slice(MAX_ANALYTICS_EVENTS);
      send(batch).catch(() => undefined);
    }
  };

  const enqueue = (event: string, properties: Record<string, unknown>) => {
    queue.push({ event, properties, timestamp: now().toISOString() });
    if (queue.length >= MAX_ANALYTICS_EVENTS) {
      flush();
      return;
    }
    timer ??= setTimeout(flush, FLUSH_DELAY_MS);
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
