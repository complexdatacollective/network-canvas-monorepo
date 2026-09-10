import { act, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import {
  PREVIEW_RENEWAL_LEAD_MS,
  PREVIEW_RENEWAL_MIN_INTERVAL_MS,
} from '../ResourcePreview.tsx';
import {
  advance,
  createPreviewHost,
  expectShownUrlStillResolves,
  HOST_UNAVAILABLE,
  previewOf,
  renderPreview,
  settleWithoutTimers,
  shownUrl,
  type PreviewHost,
} from './previewHarness.tsx';

/**
 * Every state a preview's URL can be in, against every event that can arrive
 * while it is there.
 *
 * The component holds one thing on the researcher's behalf — a URL the host
 * says stops resolving at a moment it names — and the whole of its difficulty
 * is the invariant:
 *
 *   **What the researcher is looking at is a URL the host has not said is over,
 *   for the resource this preview is currently about.**
 *
 * A URL kept past its expiry is a broken image where a preview was; one given
 * up before it is due throws away a working image and asks the host for a
 * replacement it did not need; and an answer that lands after the field has
 * moved on would put the previous resource's content under the new one's name.
 * Every review round so far has found one branch written for one of those and
 * forgetting another, so the branches are enumerated here rather than read one
 * at a time.
 *
 * The harness they share with the fuzz over the same machine lives in
 * `previewHarness.tsx`.
 */
type UrlInterleaving = Readonly<{
  /** Where the URL is when the event arrives. */
  state: string;
  /** What arrives. */
  event: string;
  /** What must be true once everything has settled. */
  rule: string;
  check: (host: PreviewHost) => Promise<void>;
}>;

const URL_INTERLEAVINGS: readonly UrlInterleaving[] = [
  {
    state: 'live',
    event: 'the URL expires before the renewal floor lets another be asked for',
    rule: 'it is taken off screen, and the scheduled renewal brings the preview back',
    check: async (host) => {
      const image = await host.image('brief.png');
      // Shorter-lived than the floor, so it ends before its own renewal is due.
      host.urlsLastFor(3_000);
      renderPreview(host, image);
      await advance(1);
      expect(shownUrl()).toBe(1);

      await advance(3_000);

      // A URL that no longer resolves is a broken image where a preview was.
      expect(shownUrl()).toBeUndefined();

      host.urlsLastFor(60_000);
      await advance(PREVIEW_RENEWAL_MIN_INTERVAL_MS - 3_000);

      expect(shownUrl()).toBe(2);
      expectShownUrlStillResolves(host);
    },
  },
  {
    state: 'renewing',
    event: 'the renewal fails while the URL it would replace still works',
    rule: 'the URL goes on rendering until its own expiry, and the failure waits for it',
    check: async (host) => {
      const image = await host.image('lapse.png');
      host.urlsLastFor(PREVIEW_RENEWAL_MIN_INTERVAL_MS + 30);
      renderPreview(host, image);
      await advance(1);

      host.refuseNext();
      await advance(PREVIEW_RENEWAL_MIN_INTERVAL_MS);

      // Replacing a working preview with an error message throws away the rest
      // of a URL that still resolves.
      expect(shownUrl()).toBe(1);
      expect(screen.queryByText(HOST_UNAVAILABLE)).toBeNull();
      expectShownUrlStillResolves(host);

      await advance(30);

      expect(screen.getByText(HOST_UNAVAILABLE)).toBeVisible();
      expect(shownUrl()).toBeUndefined();
    },
  },
  {
    state: 'renewing',
    event:
      'the renewal fails after the URL it would replace has already expired',
    rule: 'the failure is shown at once rather than waiting for a timer that is overdue',
    check: async (host) => {
      const image = await host.image('late.png');
      host.urlsLastFor(PREVIEW_RENEWAL_MIN_INTERVAL_MS + 30);
      renderPreview(host, image);
      await advance(1);

      const renewal = host.holdNext();
      await advance(PREVIEW_RENEWAL_MIN_INTERVAL_MS);
      expect(shownUrl()).toBe(1);

      // The URL's own expiry is armed, but its timer is throttled while the
      // renewal's answer is not: a background tab goes on resolving promises
      // while `setTimeout` is held back for minutes, so the preview must not
      // wait for a timer that is already overdue before it stops showing a URL
      // that has run out.
      vi.setSystemTime(Date.now() + 100);
      host.refuseNext();
      renewal.settle(undefined);
      await settleWithoutTimers();

      expect(screen.getByText(HOST_UNAVAILABLE)).toBeVisible();
      expect(shownUrl()).toBeUndefined();
    },
  },
  {
    state: 'renewing',
    event: 'the URL expires while the renewal is still unanswered',
    rule: 'nothing is shown until the renewal lands',
    check: async (host) => {
      const image = await host.image('slow.png');
      host.urlsLastFor(PREVIEW_RENEWAL_MIN_INTERVAL_MS + 30);
      renderPreview(host, image);
      await advance(1);

      const renewal = host.holdNext();
      await advance(PREVIEW_RENEWAL_MIN_INTERVAL_MS);
      await advance(30);

      // A host that never answers must not cost the researcher a dead image.
      expect(shownUrl()).toBeUndefined();

      renewal.settle(undefined);
      await advance(1);

      expect(shownUrl()).toBe(2);
      expectShownUrlStillResolves(host);
    },
  },
  {
    state: 'renewing',
    event: 'the field moves to another resource',
    rule: 'the new resource is shown, and the renewal for the old one never replaces it',
    check: async (host) => {
      const first = await host.image('first.png');
      const second = await host.image('second.png');
      host.urlsLastFor(10_030);
      const { rerender } = renderPreview(host, first, 'First');
      await advance(1);

      const renewal = host.holdNext();
      await advance(5_030);

      rerender(previewOf(host, second, 'Second'));
      await advance(1);
      // `getBy`, not `findBy`: the timers are faked, and testing-library's own
      // retry loop waits on one of them.
      expect(screen.getByRole('img', { name: 'Second' })).toBeVisible();
      const shownForSecond = shownUrl();

      renewal.settle(undefined);
      await advance(1);

      // The renewal was about the resource this preview has stopped being
      // about; rendering it would put the first image under the second's name.
      expect(host.issued()).toBe(3);
      expect(shownUrl()).toBe(shownForSecond);
      expect(screen.getByRole('img', { name: 'Second' })).toBeVisible();
    },
  },
  {
    state: 'failed',
    event: 'the researcher asks to load the preview again',
    rule: 'a fresh URL is taken and shown',
    check: async (host) => {
      const image = await host.image('retry.png');
      host.urlsLastFor(PREVIEW_RENEWAL_MIN_INTERVAL_MS + 30);
      renderPreview(host, image);
      await advance(1);
      host.refuseNext();
      await advance(PREVIEW_RENEWAL_MIN_INTERVAL_MS + 30);
      expect(screen.getByText(HOST_UNAVAILABLE)).toBeVisible();

      host.urlsLastFor(60_000);
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Try loading the preview again' }),
        );
      });
      await advance(1);

      expect(shownUrl()).toBe(2);
      expectShownUrlStillResolves(host);
    },
  },
  {
    state: 'resolving',
    event: 'the URL that arrives has already expired',
    rule: 'it is never rendered, and another is asked for after the floor',
    check: async (host) => {
      const image = await host.image('dead.png');
      host.urlsLastFor(-1);
      renderPreview(host, image);
      await advance(1);

      expect(shownUrl()).toBeUndefined();

      host.urlsLastFor(60_000);
      await advance(PREVIEW_RENEWAL_MIN_INTERVAL_MS);

      expect(shownUrl()).toBe(2);
      expectShownUrlStillResolves(host);
    },
  },
  {
    state: 'live',
    event: 'the URL lasts longer than a timer delay can express',
    rule: 'it is not renewed early, and its renewal still falls due on time',
    check: async (host) => {
      const image = await host.image('long.png');
      // A signed URL a month out. `setTimeout` holds a signed 32-bit
      // millisecond delay (about 24.8 days), and a delay past it wraps to
      // something small — so a URL scheduled naively is renewed at once, and
      // every replacement is too, which is a request loop for as long as the
      // editor is open.
      const thirtyDays = 30 * 24 * 60 * 60 * 1_000;
      host.urlsLastFor(thirtyDays);
      renderPreview(host, image);
      await advance(1);
      expect(shownUrl()).toBe(1);

      await advance(60_000);

      expect(host.issued()).toBe(1);
      expect(shownUrl()).toBe(1);

      // Still armed for the moment it is really due, rather than dropped for
      // being too far away: a URL that is never renewed stops resolving.
      await advance(thirtyDays - 60_000 - PREVIEW_RENEWAL_LEAD_MS);

      expect(host.issued()).toBe(2);
      expect(shownUrl()).toBe(2);
      expectShownUrlStillResolves(host);
    },
  },
  {
    state: 'live',
    event: 'the URL never said when it ends',
    rule: 'it is never renewed',
    check: async (host) => {
      const image = await host.image('open.png');
      host.urlsLastFor(undefined);
      renderPreview(host, image);
      await advance(1);

      // Nothing said the URL stops working, so asking for another one would be
      // traffic about nothing.
      await advance(60_000);
      expect(host.issued()).toBe(1);
      expect(shownUrl()).toBe(1);
    },
  },
];

it.each(URL_INTERLEAVINGS)(
  'a preview URL that is $state, when $event — $rule',
  async ({ check }) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      await check(createPreviewHost());
    } finally {
      vi.useRealTimers();
    }
  },
);
