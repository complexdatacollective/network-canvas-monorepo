import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  PREVIEW_RENEWAL_LEAD_MS,
  PREVIEW_RENEWAL_MIN_INTERVAL_MS,
} from '../ResourcePreview.tsx';
import { flushPendingWork } from './asyncControls.ts';
import {
  advance,
  createPreviewHost,
  HOST_UNAVAILABLE,
  previewOf,
  renderPreview,
  shownUrl,
} from './previewHarness.tsx';

describe('ResourcePreview', () => {
  it('renders the URL the host resolved', async () => {
    const host = createPreviewHost();
    const resourceId = await host.image('skyline.png');

    renderPreview(host, resourceId, 'Skyline');

    const image = await screen.findByRole('img', { name: 'Skyline' });
    expect(image).toHaveAttribute('src', expect.stringContaining('#url-1'));
  });

  it('shows the new resource when the field moves to another one', async () => {
    const host = createPreviewHost();
    const first = await host.image('first.png');
    const second = await host.image('second.png');

    const { rerender } = renderPreview(host, first, 'First');
    await screen.findByRole('img', { name: 'First' });

    rerender(previewOf(host, second, 'Second'));

    expect(await screen.findByRole('img', { name: 'Second' })).toBeVisible();
    expect(screen.queryByRole('img', { name: 'First' })).toBeNull();
  });

  it('reports a preview the host could not resolve', async () => {
    const host = createPreviewHost();
    const resourceId = await host.image('skyline.png');
    host.refuseNext();

    renderPreview(host, resourceId, 'Skyline');

    expect(await screen.findByText(HOST_UNAVAILABLE)).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Try loading the preview again' }),
    ).toBeVisible();
  });

  it('offers no retry for a resource the protocol no longer holds', async () => {
    const host = createPreviewHost();

    renderPreview(host, 'image-gone', 'Missing');

    // The host's own words: a refusal it decided is one it wrote, and nothing
    // here rewrites it.
    expect(await screen.findByText('no such resource')).toBeVisible();
    // Repeating the identical call cannot change the answer, so offering it
    // would only invite the researcher to watch it fail again.
    expect(
      screen.queryByRole('button', { name: 'Try loading the preview again' }),
    ).toBeNull();
  });

  it('ignores a failure for the resource the field has already moved off', async () => {
    const host = createPreviewHost();
    const first = await host.image('first.png');
    const second = await host.image('second.png');
    // The first resource's resolution is held open, so it can answer after the
    // field has moved on.
    const held = host.holdNext();

    const { rerender } = renderPreview(host, first, 'First');
    rerender(previewOf(host, second, 'Second'));
    await screen.findByRole('img', { name: 'Second' });

    host.refuseNext();
    held.settle(undefined);
    await act(flushPendingWork);

    // It is about a resource this preview stopped showing, so it decides
    // nothing: replacing the second image with the first one's failure would
    // report a fault in something the researcher is not looking at.
    expect(screen.queryByText(HOST_UNAVAILABLE)).toBeNull();
    expect(screen.getByRole('img', { name: 'Second' })).toBeVisible();
  });
});

describe('a preview whose URL expires', () => {
  it('takes a new URL before the old one expires', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const host = createPreviewHost();
      const image = await host.image('leased.png');
      // Just long enough that the renewal is scheduled rather than skipped.
      host.urlsLastFor(PREVIEW_RENEWAL_LEAD_MS + 30);

      renderPreview(host, image);
      await advance(1);
      expect(shownUrl()).toBe(1);

      // A stage editor stays open far longer than a signed URL lives, so an
      // image that silently stops loading looks like a resource the protocol
      // lost.
      await advance(PREVIEW_RENEWAL_MIN_INTERVAL_MS);

      expect(shownUrl()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never renews faster than the minimum interval, however short the URL', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const host = createPreviewHost();
      const image = await host.image('brief.png');
      // One millisecond longer than the lead. Renewing on the lead alone would
      // ask again in a millisecond, be answered with another such URL, and go
      // on doing that for as long as the preview is on screen.
      host.urlsLastFor(PREVIEW_RENEWAL_LEAD_MS + 1);

      renderPreview(host, image);
      await advance(1);
      expect(host.issued()).toBe(1);

      await advance(PREVIEW_RENEWAL_MIN_INTERVAL_MS - 100);
      expect(host.issued()).toBe(1);

      await advance(200);
      expect(host.issued()).toBe(2);

      // And the one after it is a renewal too, not a poll that happens to have
      // started slowly.
      await advance(PREVIEW_RENEWAL_MIN_INTERVAL_MS - 300);
      expect(host.issued()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps showing a URL whose renewal failed until it expires, then reports the failure', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const host = createPreviewHost();
      const image = await host.image('lapsed.png');
      host.urlsLastFor(PREVIEW_RENEWAL_LEAD_MS + 30);

      renderPreview(host, image);
      await advance(1);
      expect(shownUrl()).toBe(1);

      // The renewal is refused, so the URL on screen is the last one there will
      // be: replacing a working image with an error message while its own URL
      // still resolves throws that time away for nothing.
      host.refuseNext();
      await advance(PREVIEW_RENEWAL_MIN_INTERVAL_MS);
      expect(shownUrl()).toBe(1);
      expect(screen.queryByText(HOST_UNAVAILABLE)).toBeNull();

      await advance(30);

      // Now it really has stopped resolving, so there is nothing left to show
      // and the failure is what there is to say.
      expect(shownUrl()).toBeUndefined();
      expect(screen.getByText(HOST_UNAVAILABLE)).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves a URL with no end alone', async () => {
    const host = createPreviewHost();
    const image = await host.image('open.png');

    renderPreview(host, image);
    await screen.findByRole('img');
    await act(flushPendingWork);

    // Nothing said the URL stops working, so asking for another one would be
    // traffic about nothing.
    expect(host.issued()).toBe(1);
  });
});
