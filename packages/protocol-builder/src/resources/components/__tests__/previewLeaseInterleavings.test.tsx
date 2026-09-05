import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ResourceGatewayProvider } from '../../context.tsx';
import {
  resourceFailure,
  type ProtocolBuilderResourceGateway,
  type ResourcePreview as ResolvedPreview,
  type ResourceResult,
} from '../../gateway.ts';
import { InMemoryResourceGateway } from '../../InMemoryResourceGateway.ts';
import { overrideGateway } from '../../overrideGateway.ts';
import ResourcePreview, {
  PREVIEW_RENEWAL_LEAD_MS,
  PREVIEW_RENEWAL_MIN_INTERVAL_MS,
} from '../ResourcePreview.tsx';
import { deferred, type Deferred } from './asyncControls.ts';

/**
 * Every state a preview's lease can be in, against every event that can arrive
 * while it is there.
 *
 * The component holds one thing on the researcher's behalf — a URL the host is
 * keeping open — and the whole of its difficulty is that the two halves of
 * what it owes the host pull against each other:
 *
 *   **Every lease this preview acquires is released exactly once, and a lease
 *   it has released is never what the researcher is looking at.**
 *
 * A leaked lease leaves the host holding a URL for as long as the editor is
 * open; a second release is charged to whichever lease the host handed out
 * next; and releasing one that is still on screen replaces a working preview
 * with a broken image. Every review round so far has found one branch of this
 * that was written for one half and forgot the other, so the branches are
 * enumerated here rather than read one at a time, and each row counts the
 * releases of each individual lease rather than of leases in aggregate.
 */
type LeaseInterleaving = Readonly<{
  /** Where the lease is when the event arrives. */
  state: string;
  /** What arrives. */
  event: string;
  /** What must be true once everything has settled. */
  rule: string;
  check: (ledger: LeaseLedger) => Promise<void>;
}>;

const HOST_UNAVAILABLE = 'the resource host is temporarily unavailable';

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

/**
 * A host handing out leases that end, which counts the releases of each lease
 * separately.
 *
 * Separately, because "released twice" and "one released, one leaked" are the
 * same total and opposite defects. Each lease's URL carries its own number, so
 * what is on screen can be matched against what has been handed back.
 */
type LeaseLedger = Readonly<{
  /** The host underneath, for staging the resource a row is about. */
  inner: InMemoryResourceGateway;
  gateway: ProtocolBuilderResourceGateway;
  /** How long each lease issued from now on lives; `undefined` for no end. */
  leasesLastFor: (ms: number | undefined) => void;
  /** The next resolution is refused rather than answered with a lease. */
  refuseNext: () => void;
  /** Holds the next resolution until the test settles it. */
  holdNext: () => Deferred<void>;
  issued: () => number;
  /** Release counts, one entry per lease issued, in issue order. */
  releases: () => readonly number[];
}>;

function leaseLedger(inner: InMemoryResourceGateway): LeaseLedger {
  let issued = 0;
  const releases: number[] = [];
  let livesForMs: number | undefined;
  let refuse = false;
  let held: Deferred<void> | undefined;

  return {
    inner,
    leasesLastFor: (ms) => {
      livesForMs = ms;
    },
    refuseNext: () => {
      refuse = true;
    },
    holdNext: () => {
      held = deferred<void>();
      return held;
    },
    issued: () => issued,
    releases: () => [...releases],
    gateway: overrideGateway(inner, {
      resolvePreview: async (resourceId) => {
        const waiting = held;
        held = undefined;
        if (waiting !== undefined) await waiting.promise;
        if (refuse) {
          refuse = false;
          return resourceFailure<ResolvedPreview>(
            'unavailable',
            HOST_UNAVAILABLE,
          );
        }
        const result = await inner.resolvePreview(resourceId);
        if (result.status === 'failed') return result;
        issued += 1;
        const lease = issued;
        releases.push(0);
        return {
          status: 'ok',
          data: {
            resourceId,
            url: `${result.data.url}#lease-${lease}`,
            ...(livesForMs === undefined
              ? {}
              : { expiresAt: Date.now() + livesForMs }),
            release: () => {
              releases[lease - 1] = (releases[lease - 1] ?? 0) + 1;
              result.data.release();
            },
          },
        } satisfies ResourceResult<ResolvedPreview>;
      },
    }),
  };
}

async function stageImage(
  gateway: InMemoryResourceGateway,
  requestId: string,
  source: string,
): Promise<string> {
  const staged = await gateway.stageUpload({
    requestId,
    kind: 'image',
    name: source,
    source,
    contentType: 'image/png',
    bytes: bytesOf(`png-${source}`),
  });
  if (staged.status === 'failed') throw new Error('could not stage the image');
  return staged.data.id;
}

function renderPreview(gateway: ProtocolBuilderResourceGateway, id: string) {
  return render(previewOf(gateway, id));
}

function previewOf(gateway: ProtocolBuilderResourceGateway, id: string) {
  return (
    <ResourceGatewayProvider gateway={gateway}>
      <ResourcePreview resourceId={id} kind="image" name="Leased image" />
    </ResourceGatewayProvider>
  );
}

/** Which lease the researcher is looking at, if any. */
function shownLease(): number | undefined {
  const source = screen.queryByRole('img')?.getAttribute('src');
  const lease = /#lease-(\d+)$/.exec(source ?? '')?.[1];
  return lease === undefined ? undefined : Number(lease);
}

/** Moves both clocks, and lets everything they start settle. */
async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/**
 * Lets a held call's answer arrive without moving the timer clock — a tab in
 * the background, where `setTimeout` is throttled to minutes while promises go
 * on resolving as promptly as ever.
 */
async function settleWithoutTimers(): Promise<void> {
  await act(async () => {
    for (let hop = 0; hop < 10; hop += 1) await Promise.resolve();
  });
}

/** The second half of the invariant, at whatever moment it is asked. */
function expectShownLeaseIsHeld(ledger: LeaseLedger): void {
  const shown = shownLease();
  if (shown === undefined) return;
  expect(ledger.releases()[shown - 1]).toBe(0);
}

/**
 * The first half of the invariant, once the preview is gone: by then nothing
 * is left to release anything, so any lease not released exactly once here
 * never will be.
 */
function expectEveryLeaseReleasedOnce(ledger: LeaseLedger): void {
  expect(ledger.releases()).toEqual(
    Array.from({ length: ledger.issued() }, () => 1),
  );
}

const LEASE_INTERLEAVINGS: readonly LeaseInterleaving[] = [
  {
    state: 'live',
    event:
      'the lease runs out before the renewal floor lets another be asked for',
    rule: 'it is released and taken off screen, and the scheduled renewal brings the preview back',
    check: async (ledger) => {
      const image = await stageImage(
        ledger.inner,
        'request-brief',
        'brief.png',
      );
      // Shorter than the floor, so it ends before its own renewal is due.
      ledger.leasesLastFor(3_000);
      const { unmount } = renderPreview(ledger.gateway, image);
      await advance(1);
      expect(shownLease()).toBe(1);

      await advance(3_000);

      // A URL that no longer resolves is a broken image where a preview was,
      // and a host still holding what nothing is showing.
      expect(shownLease()).toBeUndefined();
      expect(ledger.releases()).toEqual([1]);

      ledger.leasesLastFor(60_000);
      await advance(PREVIEW_RENEWAL_MIN_INTERVAL_MS - 3_000);

      expect(shownLease()).toBe(2);
      expectShownLeaseIsHeld(ledger);
      unmount();
      expectEveryLeaseReleasedOnce(ledger);
    },
  },
  {
    state: 'renewing',
    event: 'the renewal fails while the lease it would replace still works',
    rule: 'the lease goes on rendering until its own expiry, and is released once when it ends',
    check: async (ledger) => {
      const image = await stageImage(
        ledger.inner,
        'request-lapse',
        'lapse.png',
      );
      ledger.leasesLastFor(PREVIEW_RENEWAL_MIN_INTERVAL_MS + 30);
      const { unmount } = renderPreview(ledger.gateway, image);
      await advance(1);

      ledger.refuseNext();
      await advance(PREVIEW_RENEWAL_MIN_INTERVAL_MS);

      // Replacing a working preview with an error message throws away the rest
      // of a lease that is still good.
      expect(shownLease()).toBe(1);
      expect(ledger.releases()).toEqual([0]);
      expectShownLeaseIsHeld(ledger);

      await advance(30);

      expect(screen.getByText(HOST_UNAVAILABLE)).toBeVisible();
      expect(shownLease()).toBeUndefined();
      expect(ledger.releases()).toEqual([1]);
      unmount();
      expectEveryLeaseReleasedOnce(ledger);
    },
  },
  {
    state: 'renewing',
    event:
      'the renewal fails after the lease it would replace has already run out',
    rule: 'the failure is shown at once and the expired lease is released',
    check: async (ledger) => {
      const image = await stageImage(ledger.inner, 'request-late', 'late.png');
      ledger.leasesLastFor(PREVIEW_RENEWAL_MIN_INTERVAL_MS + 30);
      const { unmount } = renderPreview(ledger.gateway, image);
      await advance(1);

      const renewal = ledger.holdNext();
      await advance(PREVIEW_RENEWAL_MIN_INTERVAL_MS);
      expect(shownLease()).toBe(1);

      // The lease's own expiry is armed, but its timer is throttled while the
      // renewal's answer is not: waiting for a timer that is already overdue
      // is what would leave the host holding this URL.
      vi.setSystemTime(Date.now() + 100);
      ledger.refuseNext();
      renewal.settle(undefined);
      await settleWithoutTimers();

      expect(screen.getByText(HOST_UNAVAILABLE)).toBeVisible();
      expect(shownLease()).toBeUndefined();
      expect(ledger.releases()).toEqual([1]);
      unmount();
      expectEveryLeaseReleasedOnce(ledger);
    },
  },
  {
    state: 'renewing',
    event: 'the lease runs out while the renewal is still unanswered',
    rule: 'the lease is released and nothing is shown until the renewal lands',
    check: async (ledger) => {
      const image = await stageImage(ledger.inner, 'request-slow', 'slow.png');
      ledger.leasesLastFor(PREVIEW_RENEWAL_MIN_INTERVAL_MS + 30);
      const { unmount } = renderPreview(ledger.gateway, image);
      await advance(1);

      const renewal = ledger.holdNext();
      await advance(PREVIEW_RENEWAL_MIN_INTERVAL_MS);
      await advance(30);

      // A host that never answers must not cost the researcher a dead image
      // and the host a URL it can never take back.
      expect(shownLease()).toBeUndefined();
      expect(ledger.releases()).toEqual([1]);

      renewal.settle(undefined);
      await advance(1);

      expect(shownLease()).toBe(2);
      expectShownLeaseIsHeld(ledger);
      unmount();
      expectEveryLeaseReleasedOnce(ledger);
    },
  },
  {
    state: 'renewing',
    event: 'the field moves to another resource',
    rule: 'both the lease on screen and the one still on its way are released once each',
    check: async (ledger) => {
      const first = await stageImage(
        ledger.inner,
        'request-first',
        'first.png',
      );
      const second = await stageImage(
        ledger.inner,
        'request-second',
        'second.png',
      );
      ledger.leasesLastFor(10_030);
      const { rerender, unmount } = renderPreview(ledger.gateway, first);
      await advance(1);

      const renewal = ledger.holdNext();
      await advance(5_030);

      rerender(previewOf(ledger.gateway, second));
      await advance(1);
      renewal.settle(undefined);
      await advance(1);

      // The renewal has nothing left to render it, so it is released as it
      // lands: this is the last place that knows it exists.
      expect(ledger.issued()).toBe(3);
      expect(ledger.releases()).toEqual([1, 0, 1]);
      expectShownLeaseIsHeld(ledger);
      unmount();
      expectEveryLeaseReleasedOnce(ledger);
    },
  },
  {
    state: 'renewing',
    event: 'the preview is taken away',
    rule: 'both the lease on screen and the one still on its way are released once each',
    check: async (ledger) => {
      const image = await stageImage(ledger.inner, 'request-gone', 'gone.png');
      ledger.leasesLastFor(10_030);
      const { unmount } = renderPreview(ledger.gateway, image);
      await advance(1);

      const renewal = ledger.holdNext();
      await advance(5_030);

      unmount();
      renewal.settle(undefined);
      await advance(1);

      expect(ledger.issued()).toBe(2);
      expectEveryLeaseReleasedOnce(ledger);
    },
  },
  {
    state: 'failed',
    event: 'the researcher asks to load the preview again',
    rule: 'a fresh lease is taken and the one the failure ended is not released a second time',
    check: async (ledger) => {
      const image = await stageImage(
        ledger.inner,
        'request-retry',
        'retry.png',
      );
      ledger.leasesLastFor(PREVIEW_RENEWAL_MIN_INTERVAL_MS + 30);
      const { unmount } = renderPreview(ledger.gateway, image);
      await advance(1);
      ledger.refuseNext();
      await advance(PREVIEW_RENEWAL_MIN_INTERVAL_MS + 30);
      expect(ledger.releases()).toEqual([1]);

      ledger.leasesLastFor(60_000);
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Try loading the preview again' }),
        );
      });
      await advance(1);

      expect(shownLease()).toBe(2);
      // The retry tears the effect down first, and the lease it ended has
      // already gone back: a host counting what it handed out would read a
      // second release as being about the lease it issued next.
      expect(ledger.releases()).toEqual([1, 0]);
      unmount();
      expectEveryLeaseReleasedOnce(ledger);
    },
  },
  {
    state: 'resolving',
    event: 'the lease that arrives has already run out',
    rule: 'it is never rendered, is released once, and another is asked for after the floor',
    check: async (ledger) => {
      const image = await stageImage(ledger.inner, 'request-dead', 'dead.png');
      ledger.leasesLastFor(-1);
      const { unmount } = renderPreview(ledger.gateway, image);
      await advance(1);

      expect(shownLease()).toBeUndefined();
      expect(ledger.releases()).toEqual([1]);

      ledger.leasesLastFor(60_000);
      await advance(PREVIEW_RENEWAL_MIN_INTERVAL_MS);

      expect(shownLease()).toBe(2);
      expectShownLeaseIsHeld(ledger);
      unmount();
      expectEveryLeaseReleasedOnce(ledger);
    },
  },
  {
    state: 'live',
    event: 'the lease lasts longer than a timer delay can express',
    rule: 'it is neither renewed nor released early, and its renewal still falls due on time',
    check: async (ledger) => {
      const image = await stageImage(ledger.inner, 'request-long', 'long.png');
      // A signed URL a month out. `setTimeout` holds a signed 32-bit
      // millisecond delay (about 24.8 days), and a delay past it wraps to
      // something small — so a lease scheduled naively is renewed and released
      // at once, and every replacement is too, which is a request loop for as
      // long as the editor is open.
      const thirtyDays = 30 * 24 * 60 * 60 * 1_000;
      ledger.leasesLastFor(thirtyDays);
      const { unmount } = renderPreview(ledger.gateway, image);
      await advance(1);
      expect(shownLease()).toBe(1);

      await advance(60_000);

      expect(ledger.issued()).toBe(1);
      expect(shownLease()).toBe(1);
      expect(ledger.releases()).toEqual([0]);

      // Still armed for the moment it is really due, rather than dropped for
      // being too far away: a lease that is never renewed stops resolving.
      await advance(thirtyDays - 60_000 - PREVIEW_RENEWAL_LEAD_MS);

      expect(ledger.issued()).toBe(2);
      expect(shownLease()).toBe(2);
      expectShownLeaseIsHeld(ledger);
      unmount();
      expectEveryLeaseReleasedOnce(ledger);
    },
  },
  {
    state: 'live',
    event: 'the preview is taken away, and the lease never said when it ends',
    rule: 'it is never renewed and is released once',
    check: async (ledger) => {
      const image = await stageImage(ledger.inner, 'request-open', 'open.png');
      ledger.leasesLastFor(undefined);
      const { unmount } = renderPreview(ledger.gateway, image);
      await advance(1);

      // Nothing said the URL stops working, so asking for another one would be
      // traffic about nothing.
      await advance(60_000);
      expect(ledger.issued()).toBe(1);
      expect(shownLease()).toBe(1);

      unmount();
      expectEveryLeaseReleasedOnce(ledger);
    },
  },
];

it.each(LEASE_INTERLEAVINGS)(
  'a lease that is $state, when $event — $rule',
  async ({ check }) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      await check(leaseLedger(new InMemoryResourceGateway()));
    } finally {
      vi.useRealTimers();
    }
  },
);
