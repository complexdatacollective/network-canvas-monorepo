import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_ANALYTICS_EVENTS } from '@codaco/studio-contract/schema/participant';

import { createParticipantAnalyticsClient } from '../analyticsClient.ts';

const NOW = new Date('2026-10-07T09:00:00.000Z');

type Send = Parameters<typeof createParticipantAnalyticsClient>[0];

const setup = () => {
  const send = vi.fn<NonNullable<Send>>(() => Promise.resolve());
  const client = createParticipantAnalyticsClient(send, () => NOW);
  return { send, client };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the participant analytics client', () => {
  it('batches events and sends them once the page has been quiet', () => {
    const { send, client } = setup();
    client.capture('stage_entered', { stage_type: 'Information' });
    client.capture('stage_left', { stage_type: 'Information' });
    expect(send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2000);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith([
      {
        event: 'stage_entered',
        properties: { stage_type: 'Information' },
        timestamp: NOW.toISOString(),
      },
      {
        event: 'stage_left',
        properties: { stage_type: 'Information' },
        timestamp: NOW.toISOString(),
      },
    ]);
  });

  it('sends a full batch at once without waiting', () => {
    const { send, client } = setup();
    for (let index = 0; index < MAX_ANALYTICS_EVENTS; index += 1) {
      client.capture('stage_entered', {});
    }
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toHaveLength(MAX_ANALYTICS_EVENTS);
  });

  it('sends what it holds at once when asked, and not again later', () => {
    const { send, client } = setup();
    client.capture('stage_entered', {});
    client.flush();
    expect(send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('reports an exception by its type and message only', () => {
    const { send, client } = setup();
    const error = new TypeError('video load failed: 4');
    client.captureException(error, { feature: 'information-media' });
    client.flush();
    expect(send).toHaveBeenCalledWith([
      {
        event: '$exception',
        timestamp: NOW.toISOString(),
        properties: {
          feature: 'information-media',
          $exception_list: [
            {
              type: 'TypeError',
              value: 'video load failed: 4',
              mechanism: { handled: true, synthetic: false },
            },
          ],
        },
      },
    ]);
  });

  it('never lets a failed send reach the interview', async () => {
    const send = vi.fn<NonNullable<Send>>(() =>
      Promise.reject(new Error('offline')),
    );
    const client = createParticipantAnalyticsClient(send, () => NOW);
    client.capture('stage_entered', {});
    expect(() => client.flush()).not.toThrow();
    await vi.runAllTimersAsync();
  });
});
