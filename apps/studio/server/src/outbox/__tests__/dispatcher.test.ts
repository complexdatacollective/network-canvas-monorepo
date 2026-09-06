import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import { OutboxDispatcher, type OutboxAdapter } from '../dispatcher.ts';
import type {
  OutboxLifecycleEvent,
  OutboxObserver,
} from '../instrumentation.ts';

type Claim = { attemptCount: number; privatePayload: string };

const claim: Claim = {
  attemptCount: 1,
  privatePayload: 'private-participant-answer-and-secret',
};

function adapter() {
  return {
    queue: 'message_deliveries',
    suppressUndeliverable: vi
      .fn<OutboxAdapter<Claim>['suppressUndeliverable']>()
      .mockResolvedValue(0),
    failExhaustedLeases: vi
      .fn<OutboxAdapter<Claim>['failExhaustedLeases']>()
      .mockResolvedValue(0),
    claim: vi.fn<OutboxAdapter<Claim>['claim']>().mockResolvedValue(claim),
    remainsDeliverable: vi
      .fn<OutboxAdapter<Claim>['remainsDeliverable']>()
      .mockResolvedValue(true),
    suppressClaim: vi
      .fn<OutboxAdapter<Claim>['suppressClaim']>()
      .mockResolvedValue(true),
    renewLease: vi
      .fn<OutboxAdapter<Claim>['renewLease']>()
      .mockResolvedValue(true),
    deliver: vi
      .fn<OutboxAdapter<Claim>['deliver']>()
      .mockResolvedValue(undefined),
    recordFailure: vi
      .fn<OutboxAdapter<Claim>['recordFailure']>()
      .mockResolvedValue(true),
    recordComplete: vi
      .fn<OutboxAdapter<Claim>['recordComplete']>()
      .mockResolvedValue(true),
    recordUncertain: vi
      .fn<OutboxAdapter<Claim>['recordUncertain']>()
      .mockResolvedValue(true),
  } satisfies OutboxAdapter<Claim>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('shared outbox execution', () => {
  let pool: pg.Pool;

  beforeEach(() => {
    vi.useFakeTimers();
    // A disconnected query double; real pool connections use the shared factory.
    pool = new pg.Pool();
    vi.spyOn(pool, 'query').mockImplementation(async () => ({
      rows: [{ role: TENANT_ROLES.maintenance }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    }));
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await pool.end();
  });

  it('refuses a non-maintenance role before touching work', async () => {
    vi.mocked(pool.query).mockImplementation(async () => ({
      rows: [{ role: TENANT_ROLES.app }],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    }));
    const work = adapter();
    const observer = vi.fn<OutboxObserver>();

    await expect(
      new OutboxDispatcher({ pool, adapter: work, observer }).runOnce(),
    ).rejects.toThrow('must run as studio_maintenance');

    expect(work.suppressUndeliverable).not.toHaveBeenCalled();
    expect(work.claim).not.toHaveBeenCalled();
    expect(work.deliver).not.toHaveBeenCalled();
    expect(observer).toHaveBeenCalledExactlyOnceWith({
      queue: 'message_deliveries',
      kind: 'dispatch_error',
    });
  });

  it('reports aggregate outcomes without forwarding the claim or provider error', async () => {
    const work = adapter();
    const error = new Error('private-provider-recipient@example.com');
    work.deliver.mockRejectedValue(error);
    const events: OutboxLifecycleEvent[] = [];
    const dispatch = new OutboxDispatcher({
      pool,
      adapter: work,
      observer: (event) => {
        events.push(event);
      },
    });

    await expect(dispatch.runOnce()).resolves.toMatchObject({
      claimed: 1,
      retried: 1,
      failed: 0,
    });

    expect(work.deliver).toHaveBeenCalledExactlyOnceWith(claim);
    expect(events).toEqual([
      {
        queue: 'message_deliveries',
        kind: 'dispatch',
        durationMs: expect.any(Number),
        claimed: 1,
        completed: 0,
        retried: 1,
        failed: 0,
        suppressed: 0,
        uncertain: 0,
        leaseLost: 0,
      },
    ]);
    expect(JSON.stringify(events)).not.toContain(claim.privatePayload);
    expect(JSON.stringify(events)).not.toContain(error.message);
  });

  it.each([
    { attemptCount: 1, expectedDelay: 5_000 },
    { attemptCount: 2, expectedDelay: 10_000 },
    { attemptCount: 7, expectedDelay: 320_000 },
    { attemptCount: 8, expectedDelay: null },
  ])(
    'schedules attempt $attemptCount with the established retry policy',
    async ({ attemptCount, expectedDelay }) => {
      const work = adapter();
      const attempt = { ...claim, attemptCount };
      const failure = new Error('transport failure');
      work.claim.mockResolvedValue(attempt);
      work.deliver.mockRejectedValue(failure);

      const result = await new OutboxDispatcher({
        pool,
        adapter: work,
      }).runOnce();

      expect(work.recordFailure).toHaveBeenCalledExactlyOnceWith(
        attempt,
        expect.objectContaining({
          owner: expect.any(String),
          durationMs: 60_000,
        }),
        failure,
        expectedDelay,
      );
      expect(result).toMatchObject(
        expectedDelay === null
          ? { failed: 1, retried: 0 }
          : { failed: 0, retried: 1 },
      );
      expect(work.recordComplete).not.toHaveBeenCalled();
      expect(work.recordUncertain).not.toHaveBeenCalled();
    },
  );

  it('caps exponential retry delays', async () => {
    const work = adapter();
    work.claim.mockResolvedValue({ ...claim, attemptCount: 12 });
    work.deliver.mockRejectedValue(new Error('transport failure'));

    await new OutboxDispatcher({
      pool,
      adapter: work,
      maxAttempts: 20,
    }).runOnce();

    expect(work.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({ attemptCount: 12 }),
      expect.any(Object),
      expect.any(Error),
      1_800_000,
    );
  });

  it('preserves sweep counts and suppresses a claim that became undeliverable', async () => {
    const work = adapter();
    work.suppressUndeliverable.mockResolvedValue(2);
    work.failExhaustedLeases.mockResolvedValue(3);
    work.remainsDeliverable.mockResolvedValue(false);

    await expect(
      new OutboxDispatcher({ pool, adapter: work }).runOnce(),
    ).resolves.toEqual({
      claimed: 1,
      completed: 0,
      retried: 0,
      failed: 3,
      suppressed: 3,
      uncertain: 0,
      leaseLost: 0,
    });
    expect(work.suppressClaim).toHaveBeenCalledOnce();
    expect(work.deliver).not.toHaveBeenCalled();
  });

  it.each(['throws', 'loses ownership'] as const)(
    'never schedules a retry after provider acceptance when finalization %s',
    async (failureMode) => {
      const work = adapter();
      if (failureMode === 'throws')
        work.recordComplete.mockRejectedValue(new Error('commit failed'));
      else work.recordComplete.mockResolvedValue(false);

      await expect(
        new OutboxDispatcher({ pool, adapter: work }).runOnce(),
      ).resolves.toMatchObject({
        claimed: 1,
        completed: 0,
        retried: 0,
        failed: 0,
        uncertain: 1,
      });

      expect(work.deliver).toHaveBeenCalledOnce();
      expect(work.recordUncertain).toHaveBeenCalledOnce();
      expect(work.recordFailure).not.toHaveBeenCalled();
    },
  );

  it('does not claim that uncertainty committed after ownership moved', async () => {
    const work = adapter();
    work.recordComplete.mockResolvedValue(false);
    work.recordUncertain.mockResolvedValue(false);

    await expect(
      new OutboxDispatcher({ pool, adapter: work }).runOnce(),
    ).resolves.toMatchObject({
      uncertain: 0,
      completed: 0,
      retried: 0,
      failed: 0,
      leaseLost: 1,
    });
    expect(work.recordUncertain).toHaveBeenCalledOnce();
  });

  it('waits for the active renewal before finalizing and never overlaps renewals', async () => {
    const work = adapter();
    const sending = deferred<void>();
    const renewing = deferred<boolean>();
    work.deliver.mockReturnValue(sending.promise);
    work.renewLease.mockReturnValue(renewing.promise);
    const running = new OutboxDispatcher({
      pool,
      adapter: work,
      leaseMs: 90,
    }).runOnce();

    await vi.advanceTimersByTimeAsync(30);
    expect(work.deliver).toHaveBeenCalledOnce();
    expect(work.renewLease).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(180);
    expect(work.renewLease).toHaveBeenCalledOnce();
    sending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(work.recordComplete).not.toHaveBeenCalled();

    renewing.resolve(true);
    await expect(running).resolves.toMatchObject({
      completed: 1,
      leaseLost: 0,
    });
    expect(work.recordComplete).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { renewal: 'lost', provider: 'accepts' },
    { renewal: 'error', provider: 'accepts' },
    { renewal: 'throws', provider: 'accepts' },
    { renewal: 'lost', provider: 'rejects' },
    { renewal: 'error', provider: 'rejects' },
    { renewal: 'throws', provider: 'rejects' },
  ] as const)(
    'does not finalize after renewal $renewal when the provider $provider',
    async ({ renewal, provider }) => {
      const work = adapter();
      const sending = deferred<void>();
      const observer = vi.fn<OutboxObserver>();
      work.deliver.mockReturnValue(sending.promise);
      if (renewal === 'lost') work.renewLease.mockResolvedValue(false);
      else if (renewal === 'throws') {
        work.renewLease.mockImplementation(() => {
          throw new Error('private-database-error');
        });
      } else
        work.renewLease.mockRejectedValue(new Error('private-database-error'));
      const running = new OutboxDispatcher({
        pool,
        adapter: work,
        observer,
        leaseMs: 90,
      }).runOnce();

      await vi.advanceTimersByTimeAsync(30);
      expect(observer).toHaveBeenCalledWith({
        queue: 'message_deliveries',
        kind: 'heartbeat',
        outcome: renewal === 'throws' ? 'error' : renewal,
      });
      if (provider === 'accepts') sending.resolve();
      else sending.reject(new Error('provider rejected'));

      await expect(running).resolves.toMatchObject({
        completed: 0,
        retried: 0,
        failed: 0,
        uncertain: 0,
        leaseLost: 1,
      });
      expect(work.deliver).toHaveBeenCalledOnce();
      expect(work.recordComplete).not.toHaveBeenCalled();
      expect(work.recordFailure).not.toHaveBeenCalled();
      expect(work.recordUncertain).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(90);
      expect(work.renewLease).toHaveBeenCalledOnce();
    },
  );

  it.each(['throws', 'rejects'] as const)(
    'continues renewing and finalizing when its observer %s',
    async (failureMode) => {
      const work = adapter();
      const sending = deferred<void>();
      work.deliver.mockReturnValue(sending.promise);
      const observer = vi.fn<OutboxObserver>(() => {
        if (failureMode === 'throws') throw new Error('metrics unavailable');
        return Promise.reject(new Error('metrics unavailable'));
      });
      const running = new OutboxDispatcher({
        pool,
        adapter: work,
        observer,
        leaseMs: 90,
      }).runOnce();

      await vi.advanceTimersByTimeAsync(60);
      expect(work.renewLease).toHaveBeenCalledTimes(2);
      sending.resolve();

      await expect(running).resolves.toMatchObject({
        completed: 1,
        leaseLost: 0,
      });
      await vi.advanceTimersByTimeAsync(90);
      expect(work.recordComplete).toHaveBeenCalledOnce();
      expect(work.recordUncertain).not.toHaveBeenCalled();
      expect(observer).toHaveBeenCalledTimes(3);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
