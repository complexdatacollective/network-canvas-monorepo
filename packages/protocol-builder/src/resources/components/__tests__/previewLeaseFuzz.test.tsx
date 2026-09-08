import { describe, expect, it, vi } from 'vitest';

import { InMemoryResourceGateway } from '../../InMemoryResourceGateway.ts';
import { overrideGateway } from '../../overrideGateway.ts';
import {
  PREVIEW_RENEWAL_LEAD_MS,
  PREVIEW_RENEWAL_MIN_INTERVAL_MS,
} from '../ResourcePreview.tsx';
import {
  advance,
  expectEveryLeaseReleasedOnce,
  expectShownLeaseIsHeld,
  leaseLedger,
  previewOf,
  renderPreview,
  shownLease,
  stageImage,
  type LeaseLedger,
} from './leaseLedger.tsx';
import {
  batched,
  crossProduct,
  runNamedCase,
  shuffled,
} from './seededCases.ts';

/**
 * Every lease length against every renewal outcome against every moment the
 * preview can be taken away, rather than the handful anyone thought to write
 * down.
 *
 * Three review rounds in a row landed in this component, each on a different
 * pairing of "how long the lease lasts" with "what happens next" — a lease
 * shorter than the renewal floor that armed no timer at all, a renewal failing
 * on exactly the boundary where its lease had already run out, a lease so long
 * that the delay describing it overflowed the timer and fired at once. They are
 * the same defect written three ways: the lease's own clock and the renewal's
 * are independent, and every ordering of the two has to hold the invariant, not
 * the ones a reader happened to picture.
 *
 * ## The invariants, which are the component's own
 *
 * 1. **Every lease is released exactly once.** Checked once the preview is
 *    gone, when nothing is left that could ever release anything: a lease not
 *    released by then leaves the host holding a URL forever, and one released
 *    twice is charged to whichever lease the host issued next.
 * 2. **A lease that has been released is never what the researcher is looking
 *    at.** Checked at every point the preview is observed, not only at the end.
 * 3. **The host is not asked for anything once the preview has gone.**
 * 4. **A lease is not given up before it is due, nor kept past it.** The first
 *    three are all satisfied both by a preview that throws every lease away
 *    the instant it arrives — which is what a delay too large for the timer to
 *    hold made it do — and by one that never lets go of a lease at all, which
 *    is what a lease shorter than the renewal floor used to get. So what is on
 *    screen, and how many leases the host has been asked for, are checked
 *    against the clock as well as against the ledger.
 */

/** Fixed, so the shuffled order a failure names is the same order everywhere. */
const SEED = 0x1698_0107;

/** A day's worth of milliseconds, for the leases a signed timer cannot hold. */
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;

/**
 * Lease lengths either side of the two constants the machine turns on, plus one
 * past the largest delay a timer can express and one that never ends at all.
 */
const LEASE_LENGTHS = {
  'under the floor': 3_000,
  'on the floor': PREVIEW_RENEWAL_MIN_INTERVAL_MS,
  'just over the floor': PREVIEW_RENEWAL_MIN_INTERVAL_MS + 30,
  'past what a timer holds': THIRTY_DAYS_MS,
  'never ends': undefined,
} as const;

const RENEWALS = [
  'answers',
  'fails while the lease still works',
  'fails once the lease has run out',
  'never answers',
] as const;

/** Where in the lease's life the preview is taken away. */
const PHASES = [
  'lease on screen',
  'renewal in flight',
  'renewal decided',
  'well past the expiry',
] as const;

const DEPARTURES = ['unmount', 'change of resource', 'stays'] as const;

type PreviewCase = Readonly<{
  lease: keyof typeof LEASE_LENGTHS;
  renewal: (typeof RENEWALS)[number];
  phase: (typeof PHASES)[number];
  departure: (typeof DEPARTURES)[number];
}>;

const CASES = shuffled(
  crossProduct({
    lease: Object.keys(LEASE_LENGTHS) as (keyof typeof LEASE_LENGTHS)[],
    renewal: RENEWALS,
    phase: PHASES,
    departure: DEPARTURES,
  }),
  SEED,
);

/** When the machine asks for the next lease, and when this one runs out. */
function schedule(
  lease: keyof typeof LEASE_LENGTHS,
): Readonly<{ renewalAt: number; expiresAt: number }> {
  const lifetime = LEASE_LENGTHS[lease];
  if (lifetime === undefined) {
    // Nothing is scheduled at all, so the drive below only has to move past
    // every moment that would have mattered had anything been armed.
    return { renewalAt: PREVIEW_RENEWAL_MIN_INTERVAL_MS, expiresAt: 60_000 };
  }
  return {
    renewalAt: Math.max(
      lifetime - PREVIEW_RENEWAL_LEAD_MS,
      PREVIEW_RENEWAL_MIN_INTERVAL_MS,
    ),
    expiresAt: lifetime,
  };
}

async function checkCase(subject: PreviewCase): Promise<void> {
  const inner = new InMemoryResourceGateway();
  const chosen = await stageImage(inner, 'request-chosen', 'chosen.png');
  const other = await stageImage(inner, 'request-other', 'other.png');
  const ledger = leaseLedger(inner);
  let mounted = true;
  let callsAfterUnmount = 0;
  /** When each issued lease stops resolving, in the order they were issued. */
  const endsAt: (number | undefined)[] = [];
  const gateway = overrideGateway(ledger.gateway, {
    resolvePreview: async (resourceId) => {
      if (!mounted) callsAfterUnmount += 1;
      const result = await ledger.gateway.resolvePreview(resourceId);
      if (result.status === 'ok') endsAt.push(result.data.expiresAt);
      return result;
    },
  });
  const watched: LeaseLedger = { ...ledger, gateway };

  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  try {
    const { renewalAt, expiresAt } = schedule(subject.lease);
    watched.leasesLastFor(LEASE_LENGTHS[subject.lease]);
    const { rerender, unmount } = renderPreview(watched.gateway, chosen);

    let gone = false;
    // Once the field points somewhere else the host is asked again for good
    // reason, so the counts below stop being about this lease alone.
    let switched = false;
    const observe = (): void => {
      expectShownLeaseIsHeld(watched);
      expect(callsAfterUnmount).toBe(0);
      // A URL the host has stopped resolving is a broken image where a preview
      // was, and a host holding a lease nothing will ever hand back.
      const shown = shownLease();
      const ends = shown === undefined ? undefined : endsAt[shown - 1];
      if (ends !== undefined) expect(Date.now()).toBeLessThanOrEqual(ends);
    };
    const depart = (): void => {
      if (subject.departure === 'unmount') {
        mounted = false;
        gone = true;
        unmount();
        return;
      }
      if (subject.departure === 'change of resource') {
        switched = true;
        rerender(previewOf(watched.gateway, other));
      }
    };

    await advance(1);
    // The lease has only just arrived: nothing about it is due, so it is what
    // the researcher is looking at and the host has been asked once.
    expect(shownLease()).toBe(1);
    expect(watched.issued()).toBe(1);
    observe();
    if (subject.phase === 'lease on screen') depart();

    if (!gone && !switched && renewalAt > 2) {
      await advance(renewalAt - 2);
      // Still nothing due. A second lease by now means the first was given up
      // early — a working URL thrown away, and a host asked for a replacement
      // it did not need.
      expect(watched.issued()).toBe(1);
      observe();
    }

    // The renewal is held from here, so the moment it is in flight and
    // undecided can be observed at all.
    const renewal = watched.holdNext();
    if (!gone) await advance(3);
    observe();
    if (subject.phase === 'renewal in flight') depart();

    if (!gone) {
      switch (subject.renewal) {
        case 'answers':
          renewal.settle(undefined);
          break;
        case 'fails while the lease still works':
          watched.refuseNext();
          renewal.settle(undefined);
          break;
        case 'fails once the lease has run out':
          await advance(expiresAt + 1);
          watched.refuseNext();
          renewal.settle(undefined);
          break;
        case 'never answers':
          break;
      }
      await advance(1);
    }
    observe();
    if (subject.phase === 'renewal decided') depart();

    if (!gone) await advance(Math.max(expiresAt, renewalAt) + 60_000);
    observe();
    if (subject.phase === 'well past the expiry') depart();

    if (!gone) {
      mounted = false;
      unmount();
    }
    // A renewal the host never answered lands with nothing left to render it.
    // Nothing else knows the lease exists, so this is where a leak shows.
    renewal.settle(undefined);
    await advance(1);

    expect(callsAfterUnmount).toBe(0);
    expectEveryLeaseReleasedOnce(watched);
  } finally {
    vi.useRealTimers();
  }
}

describe(`a preview lease, over ${CASES.length} orderings (seed ${SEED})`, () => {
  it.each(batched(CASES, 8))(
    'holds its invariants for batch $index',
    async ({ cases }) => {
      for (const subject of cases) await runNamedCase(subject, checkCase);
    },
  );
});
