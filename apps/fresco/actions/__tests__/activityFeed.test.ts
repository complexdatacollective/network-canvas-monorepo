import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateMany,
  mockCaptureEvent,
  mockShutdownPostHog,
  mockSafeUpdateTag,
  afterCallbacks,
} = vi.hoisted(() => ({
  mockCreateMany: vi.fn(),
  mockCaptureEvent: vi.fn(),
  mockShutdownPostHog: vi.fn(),
  mockSafeUpdateTag: vi.fn(),
  afterCallbacks: [] as (() => Promise<unknown>)[],
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // Collect rather than run, so tests can assert on *when* registration
    // happened as well as what the callback does.
    after: vi.fn((callback: () => Promise<unknown>) => {
      afterCallbacks.push(callback);
    }),
  };
});

vi.mock('~/lib/db', () => ({
  prisma: {
    events: {
      createMany: mockCreateMany,
      findMany: vi.fn(),
    },
  },
}));

vi.mock('~/lib/cache', () => ({
  safeUpdateTag: mockSafeUpdateTag,
}));

vi.mock('~/lib/posthog-server', () => ({
  captureEvent: mockCaptureEvent,
  shutdownPostHog: mockShutdownPostHog,
}));

vi.mock('~/lib/auth/guards', () => ({
  requireApiAuth: vi.fn().mockResolvedValue(undefined),
}));

import { addEvent, addEvents } from '../activityFeed';

const flushAfterCallbacks = async () => {
  for (const callback of afterCallbacks.splice(0)) {
    await callback();
  }
};

describe('activity feed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
    mockCreateMany.mockResolvedValue({ count: 1 });
  });

  describe('analytics registration', () => {
    // The regression this guards: registering `after` only once the database
    // write had resolved. Callers almost always fire these without awaiting,
    // so by then the request scope was gone, `after` threw, and the error was
    // swallowed — analytics silently stopped for every unawaited caller.
    it('registers analytics before the database write settles', () => {
      mockCreateMany.mockReturnValue(new Promise(() => undefined));

      void addEvent(
        'Protocol Uninstalled',
        'User admin uninstalled a protocol',
      );

      expect(afterCallbacks).toHaveLength(1);
    });

    it('reports the activity even when the caller does not await it', async () => {
      void addEvent(
        'Protocol Uninstalled',
        'User admin uninstalled a protocol',
      );
      await flushAfterCallbacks();

      expect(mockCaptureEvent).toHaveBeenCalledWith(
        'Protocol Uninstalled',
        undefined,
      );
    });
  });

  describe('what reaches analytics', () => {
    // The message is prose for the researcher reading the feed and carries
    // usernames and participant identifiers. It must not leave the
    // installation.
    it('does not report the activity message', async () => {
      await addEvent(
        'Interview Started',
        'Participant "Ada Lovelace (P-001)" started an interview',
      );
      await flushAfterCallbacks();

      const [, reportedProperties] = mockCaptureEvent.mock.calls[0] as [
        string,
        Record<string, unknown> | undefined,
      ];

      expect(JSON.stringify(reportedProperties ?? {})).not.toContain('P-001');
    });

    it('reports explicitly-passed properties', async () => {
      await addEvent('Data Exported', 'User admin exported 3 interview(s)', {
        interviewCount: 3,
      });
      await flushAfterCallbacks();

      expect(mockCaptureEvent).toHaveBeenCalledWith('Data Exported', {
        interviewCount: 3,
      });
    });

    it('still writes the message to the feed', async () => {
      await addEvent('Protocol Uninstalled', 'User admin uninstalled "Study"');

      expect(mockCreateMany).toHaveBeenCalledWith({
        data: [
          {
            type: 'Protocol Uninstalled',
            message: 'User admin uninstalled "Study"',
          },
        ],
      });
      expect(mockSafeUpdateTag).toHaveBeenCalledWith('activityFeed');
    });
  });

  describe('batches', () => {
    it('writes one row per activity and reports each one', async () => {
      await addEvents([
        { type: 'Protocol Uninstalled', message: 'User admin removed "A"' },
        { type: 'Protocol Uninstalled', message: 'User admin removed "B"' },
      ]);
      await flushAfterCallbacks();

      expect(mockCreateMany).toHaveBeenCalledTimes(1);
      expect(mockCreateMany.mock.calls[0]).toEqual([
        {
          data: [
            { type: 'Protocol Uninstalled', message: 'User admin removed "A"' },
            { type: 'Protocol Uninstalled', message: 'User admin removed "B"' },
          ],
        },
      ]);
      expect(mockCaptureEvent).toHaveBeenCalledTimes(2);
    });

    // Shutting the client down is what flushes it, and it nulls the shared
    // instance. One callback per activity would race its own siblings.
    it('shuts the analytics client down once for the whole batch', async () => {
      await addEvents([
        { type: 'Protocol Uninstalled', message: 'User admin removed "A"' },
        { type: 'Protocol Uninstalled', message: 'User admin removed "B"' },
        { type: 'Protocol Uninstalled', message: 'User admin removed "C"' },
      ]);

      expect(afterCallbacks).toHaveLength(1);

      await flushAfterCallbacks();

      expect(mockShutdownPostHog).toHaveBeenCalledTimes(1);
    });

    it('does nothing when there is nothing to record', async () => {
      const result = await addEvents([]);

      expect(result).toEqual({ success: true, error: null });
      expect(mockCreateMany).not.toHaveBeenCalled();
      expect(afterCallbacks).toHaveLength(0);
    });
  });

  it('reports failure without throwing when the write fails', async () => {
    mockCreateMany.mockRejectedValue(new Error('Connection refused'));

    const result = await addEvent('Protocol Uninstalled', 'User admin removed');

    expect(result).toEqual({ success: false, error: 'Failed to add event' });
  });
});
