import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_ANALYTICS_EVENTS,
  MAX_ANALYTICS_PROPERTIES_BYTES,
} from '@codaco/studio-contract/schema/participant';

import { createParticipantAnalyticsClient } from '../analyticsClient.ts';

const NOW = new Date('2026-10-07T09:00:00.000Z');

type Send = Parameters<typeof createParticipantAnalyticsClient>[1];

const setup = () => {
  const send = vi.fn<NonNullable<Send>>(() => Promise.resolve());
  const client = createParticipantAnalyticsClient(
    'session-token',
    send,
    () => NOW,
  );
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
    expect(send).toHaveBeenCalledWith(
      [
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
      ],
      { unloading: false },
    );
  });

  it('sends a full batch at once without waiting', () => {
    const { send, client } = setup();
    for (let index = 0; index < MAX_ANALYTICS_EVENTS; index += 1) {
      client.capture('stage_entered', {});
    }
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toHaveLength(MAX_ANALYTICS_EVENTS);
  });

  it('sends what it holds as the page goes, as an unloading send, and not again later', () => {
    const { send, client } = setup();
    client.capture('stage_entered', {});
    client.flush({ unloading: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.any(Array), { unloading: true });
    vi.advanceTimersByTime(2000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('reports an exception by its type only, never its message', () => {
    const { send, client } = setup();
    const error = new SyntaxError('Unexpected token in ROSTER_ROW_SENTINEL');
    client.captureException(error, { feature: 'external-data' });
    client.flush();
    expect(JSON.stringify(send.mock.calls)).not.toContain(
      'ROSTER_ROW_SENTINEL',
    );
    expect(send).toHaveBeenCalledWith(
      [
        {
          event: '$exception',
          timestamp: NOW.toISOString(),
          properties: {
            feature: 'external-data',
            $exception_list: [
              {
                type: 'SyntaxError',
                value: 'SyntaxError',
                mechanism: { handled: true, synthetic: false },
              },
            ],
          },
        },
      ],
      { unloading: false },
    );
  });

  it('drops an event too large for the api to accept, keeping the rest', () => {
    const { send, client } = setup();
    client.capture('stage_entered', { stage_index: 1 });
    client.capture('stage_entered', {
      padding: 'x'.repeat(MAX_ANALYTICS_PROPERTIES_BYTES),
    });
    client.flush();
    expect(send.mock.calls[0]?.[0]).toEqual([
      {
        event: 'stage_entered',
        properties: { stage_index: 1 },
        timestamp: NOW.toISOString(),
      },
    ]);
  });

  it('measures an event in bytes, not characters', () => {
    const { send, client } = setup();
    client.capture('stage_entered', { padding: '€'.repeat(2_000) });
    client.flush();
    expect(send).not.toHaveBeenCalled();
  });

  it('never lets a failed send reach the interview', async () => {
    const send = vi.fn<NonNullable<Send>>(() =>
      Promise.reject(new Error('offline')),
    );
    const client = createParticipantAnalyticsClient(
      'session-token',
      send,
      () => NOW,
    );
    client.capture('stage_entered', {});
    expect(() => client.flush()).not.toThrow();
    await vi.runAllTimersAsync();
  });
});
