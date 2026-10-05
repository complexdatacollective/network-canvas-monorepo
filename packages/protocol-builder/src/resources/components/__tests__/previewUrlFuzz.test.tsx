import { describe, expect, it, vi } from 'vitest';

import {
  PREVIEW_RENEWAL_LEAD_MS,
  PREVIEW_RENEWAL_MIN_INTERVAL_MS,
} from '../ResourcePreview.tsx';
import {
  advance,
  createPreviewHost,
  expectShownUrlStillResolves,
  previewOf,
  renderPreview,
  shownUrl,
} from './previewHarness.tsx';
import {
  batched,
  crossProduct,
  runNamedCase,
  shuffled,
} from './seededCases.ts';

/**
 * Every URL lifetime against every renewal outcome against every moment the
 * preview can be taken away, rather than the handful anyone thought to write
 * down.
 *
 * Three review rounds in a row landed in this component, each on a different
 * pairing of "how long the URL lasts" with "what happens next" — one
 * shorter-lived than the renewal floor that armed no timer at all, a renewal
 * failing on exactly the boundary where its URL had already run out, one so
 * long-lived that the delay describing it overflowed the timer and fired at
 * once. They are the same defect written three ways: the URL's own clock and
 * the renewal's are independent, and every ordering of the two has to hold the
 * invariants, not the ones a reader happened to picture.
 *
 * ## The invariants, which are the component's own
 *
 * 1. **What the researcher is looking at is a URL the host has not said is
 *    over.** Checked at every point the preview is observed, not only at the
 *    end: a URL kept past its expiry is a broken image where a preview was.
 * 2. **The host is not asked for anything once the preview has gone.**
 * 3. **A URL is not given up before it is due, nor kept past it.** The first
 *    two are both satisfied by a preview that throws every URL away the instant
 *    it arrives — which is what a delay too large for the timer to hold made it
 *    do — and by one that never asks for another, which is what a URL
 *    shorter-lived than the renewal floor used to get. So what is on screen,
 *    and how many URLs the host has been asked for, are checked against the
 *    clock as well.
 */

/** Fixed, so the shuffled order a failure names is the same order everywhere. */
const SEED = 0x1698_0107;

/** A month's worth of milliseconds, for the delays a signed timer cannot hold. */
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;

/**
 * URL lifetimes either side of the two constants the machine turns on, plus one
 * past the largest delay a timer can express and one that never ends at all.
 */
const URL_LIFETIMES = {
  'under the floor': 3_000,
  'on the floor': PREVIEW_RENEWAL_MIN_INTERVAL_MS,
  'just over the floor': PREVIEW_RENEWAL_MIN_INTERVAL_MS + 30,
  'past what a timer holds': THIRTY_DAYS_MS,
  'never ends': undefined,
} as const;

const RENEWALS = [
  'answers',
  'fails while the URL still works',
  'fails once the URL has run out',
  'never answers',
] as const;

/** Where in the URL's life the preview is taken away. */
const PHASES = [
  'URL on screen',
  'renewal in flight',
  'renewal decided',
  'well past the expiry',
] as const;

const DEPARTURES = ['unmount', 'change of resource', 'stays'] as const;

type PreviewCase = Readonly<{
  lifetime: keyof typeof URL_LIFETIMES;
  renewal: (typeof RENEWALS)[number];
  phase: (typeof PHASES)[number];
  departure: (typeof DEPARTURES)[number];
}>;

const CASES = shuffled(
  crossProduct({
    lifetime: Object.keys(URL_LIFETIMES) as (keyof typeof URL_LIFETIMES)[],
    renewal: RENEWALS,
    phase: PHASES,
    departure: DEPARTURES,
  }),
  SEED,
);

/** When the machine asks for the next URL, and when this one runs out. */
function schedule(
  lifetime: keyof typeof URL_LIFETIMES,
): Readonly<{ renewalAt: number; expiresAt: number }> {
  const lasts = URL_LIFETIMES[lifetime];
  if (lasts === undefined) {
    // Nothing is scheduled at all, so the drive below only has to move past
    // every moment that would have mattered had anything been armed.
    return { renewalAt: PREVIEW_RENEWAL_MIN_INTERVAL_MS, expiresAt: 60_000 };
  }
  return {
    renewalAt: Math.max(
      lasts - PREVIEW_RENEWAL_LEAD_MS,
      PREVIEW_RENEWAL_MIN_INTERVAL_MS,
    ),
    expiresAt: lasts,
  };
}

async function checkCase(subject: PreviewCase): Promise<void> {
  const host = createPreviewHost();
  const chosen = await host.image('chosen.png');
  const other = await host.image('other.png');

  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  try {
    const { renewalAt, expiresAt } = schedule(subject.lifetime);
    host.urlsLastFor(URL_LIFETIMES[subject.lifetime]);
    const { rerender, unmount } = renderPreview(host, chosen);

    let gone = false;
    // Once the field points somewhere else the host is asked again for good
    // reason, so the counts below stop being about this URL alone.
    let switched = false;
    const observe = (): void => {
      expectShownUrlStillResolves(host);
      expect(host.callsAfterGone()).toBe(0);
    };
    const depart = (): void => {
      if (subject.departure === 'unmount') {
        host.previewGone();
        gone = true;
        unmount();
        return;
      }
      if (subject.departure === 'change of resource') {
        switched = true;
        rerender(previewOf(host, other, 'Other'));
      }
    };

    await advance(1);
    // The URL has only just arrived: nothing about it is due, so it is what the
    // researcher is looking at and the host has been asked once.
    expect(shownUrl()).toBe(1);
    expect(host.issued()).toBe(1);
    observe();
    if (subject.phase === 'URL on screen') depart();

    if (!gone && !switched && renewalAt > 2) {
      await advance(renewalAt - 2);
      // Still nothing due. A second URL by now means the first was given up
      // early — a working image thrown away, and a host asked for a replacement
      // it did not need.
      expect(host.issued()).toBe(1);
      observe();
    }

    // The renewal is held from here, so the moment it is in flight and
    // undecided can be observed at all.
    const renewal = host.holdNext();
    if (!gone) await advance(3);
    observe();
    if (subject.phase === 'renewal in flight') depart();

    if (!gone) {
      switch (subject.renewal) {
        case 'answers':
          renewal.settle(undefined);
          break;
        case 'fails while the URL still works':
          host.refuseNext();
          renewal.settle(undefined);
          break;
        case 'fails once the URL has run out':
          await advance(expiresAt + 1);
          host.refuseNext();
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
      host.previewGone();
      unmount();
    }
    // A renewal the host never answered lands with nothing left to render it.
    renewal.settle(undefined);
    await advance(1);

    expect(host.callsAfterGone()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
}

describe(`a preview URL, over ${CASES.length} orderings (seed ${SEED})`, () => {
  it('is enumerated over every axis', () => {
    expect(CASES.length).toBe(
      Object.keys(URL_LIFETIMES).length *
        RENEWALS.length *
        PHASES.length *
        DEPARTURES.length,
    );
  });

  it.each(batched(CASES, 8))(
    'holds its invariants for batch $index',
    async ({ cases }) => {
      expect(cases.length).toBeGreaterThan(0);
      for (const subject of cases) await runNamedCase(subject, checkCase);
    },
  );
});
