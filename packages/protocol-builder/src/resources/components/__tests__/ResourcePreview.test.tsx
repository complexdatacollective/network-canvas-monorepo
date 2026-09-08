import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
import { deferred, flushPendingWork } from './asyncControls.ts';

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

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

function renderPreview(
  gateway: ProtocolBuilderResourceGateway,
  resourceId: string,
  name: string,
) {
  return render(
    <ResourceGatewayProvider gateway={gateway}>
      <ResourcePreview resourceId={resourceId} kind="image" name={name} />
    </ResourceGatewayProvider>,
  );
}

/**
 * A host that has not answered yet, so the component can be taken away while a
 * preview is still on its way back.
 */
function gatewayWithPendingPreview(gateway: InMemoryResourceGateway): Readonly<{
  gateway: ProtocolBuilderResourceGateway;
  resolve(resourceId: string): Promise<void>;
}> {
  let deliver: (result: ResourceResult<ResolvedPreview>) => void = () =>
    undefined;
  const pending = new Promise<ResourceResult<ResolvedPreview>>(
    (resolveWith) => {
      deliver = resolveWith;
    },
  );

  return {
    gateway: overrideGateway(gateway, { resolvePreview: () => pending }),
    resolve: async (resourceId: string) => {
      const result = await gateway.resolvePreview(resourceId);
      if (result.status === 'failed') throw new Error('no preview to deliver');
      deliver(result);
      // Long enough for the component's own continuation to run.
      await new Promise((settle) => setTimeout(settle, 0));
    },
  };
}

describe('ResourcePreview', () => {
  it('renders the URL the host resolved and releases it on unmount', async () => {
    const gateway = new InMemoryResourceGateway();
    const resourceId = await stageImage(gateway, 'request-1', 'skyline.png');

    const { unmount } = renderPreview(gateway, resourceId, 'Skyline');

    const image = await screen.findByRole('img', { name: 'Skyline' });
    expect(image).toHaveAttribute('src', expect.stringContaining('image/png'));
    // The host is holding something open for as long as this is on screen.
    expect(gateway.getStagingResidue()).toContain('preview:preview-1');

    unmount();

    expect(gateway.getStagingResidue()).not.toContain('preview:preview-1');
  });

  it('releases the previous resource when the field moves to another one', async () => {
    const gateway = new InMemoryResourceGateway();
    const first = await stageImage(gateway, 'request-1', 'first.png');
    const second = await stageImage(gateway, 'request-2', 'second.png');

    const { rerender } = renderPreview(gateway, first, 'First');
    await screen.findByRole('img', { name: 'First' });
    expect(gateway.getStagingResidue()).toContain('preview:preview-1');

    rerender(
      <ResourceGatewayProvider gateway={gateway}>
        <ResourcePreview resourceId={second} kind="image" name="Second" />
      </ResourceGatewayProvider>,
    );

    await screen.findByRole('img', { name: 'Second' });
    const residue = gateway.getStagingResidue();
    expect(residue).not.toContain('preview:preview-1');
    expect(residue).toContain('preview:preview-2');
  });

  it('releases a preview that arrives after the component has gone', async () => {
    const inner = new InMemoryResourceGateway();
    const resourceId = await stageImage(inner, 'request-1', 'skyline.png');
    const pending = gatewayWithPendingPreview(inner);

    const { unmount } = renderPreview(pending.gateway, resourceId, 'Skyline');
    unmount();

    await pending.resolve(resourceId);

    // Nothing will ever render it, so nothing else would ever release it.
    expect(inner.getStagingResidue()).not.toContain('preview:preview-1');
  });

  it('reports a preview the host could not resolve', async () => {
    const gateway = new InMemoryResourceGateway();
    const resourceId = await stageImage(gateway, 'request-1', 'skyline.png');
    gateway.failNext('resolvePreview');

    renderPreview(gateway, resourceId, 'Skyline');

    expect(
      await screen.findByText('the resource host is temporarily unavailable'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Try loading the preview again' }),
    ).toBeVisible();
  });

  it('offers no retry for a resource the protocol no longer holds', async () => {
    const gateway = new InMemoryResourceGateway();

    renderPreview(gateway, 'image-gone', 'Missing');

    expect(
      await screen.findByText('that resource is no longer available'),
    ).toBeVisible();
    // Repeating the identical call cannot change the answer, so offering it
    // would only invite the researcher to watch it fail again.
    expect(
      screen.queryByRole('button', { name: 'Try loading the preview again' }),
    ).toBeNull();
  });

  it('ignores a failure for the resource the field has already moved off', async () => {
    const inner = new InMemoryResourceGateway();
    const first = await stageImage(inner, 'request-1', 'first.png');
    const second = await stageImage(inner, 'request-2', 'second.png');
    const held = deferred<ResourceResult<ResolvedPreview>>();
    const gateway = overrideGateway(inner, {
      resolvePreview: (resourceId) =>
        resourceId === first ? held.promise : inner.resolvePreview(resourceId),
    });

    const { rerender } = renderPreview(gateway, first, 'First');
    rerender(
      <ResourceGatewayProvider gateway={gateway}>
        <ResourcePreview resourceId={second} kind="image" name="Second" />
      </ResourceGatewayProvider>,
    );
    await screen.findByRole('img', { name: 'Second' });

    // The first resource's answer arrives at last, and it is a failure. It is
    // about a resource this preview stopped showing, so it decides nothing.
    held.settle(
      resourceFailure<ResolvedPreview>(
        'unavailable',
        'the first preview could not be resolved',
      ),
    );
    await act(flushPendingWork);

    expect(
      screen.queryByText('the first preview could not be resolved'),
    ).toBeNull();
    expect(screen.getByRole('img', { name: 'Second' })).toBeVisible();
  });
});

/**
 * A host that hands out leases which end, as a signed delivery URL does. Each
 * one is distinct, so a renewal is visible in what the element is showing.
 */
function leasingGateway(
  gateway: InMemoryResourceGateway,
  livesForMs: number,
): Readonly<{
  gateway: ProtocolBuilderResourceGateway;
  issued: () => number;
  released: () => number;
}> {
  let issued = 0;
  let released = 0;
  return {
    issued: () => issued,
    released: () => released,
    gateway: overrideGateway(gateway, {
      resolvePreview: async (resourceId) => {
        const result = await gateway.resolvePreview(resourceId);
        if (result.status === 'failed') return result;
        issued += 1;
        const lease = issued;
        return {
          status: 'ok',
          data: {
            resourceId,
            url: `${result.data.url}#lease-${lease}`,
            expiresAt: Date.now() + livesForMs,
            release: () => {
              released += 1;
              result.data.release();
            },
          },
        };
      },
    }),
  };
}

describe('a preview whose URL is a lease that ends', () => {
  it('takes a new lease before the old one expires, and lets the old one go', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const gateway = new InMemoryResourceGateway();
      const image = await stageImage(gateway, 'request-leased', 'leased.png');
      // Just long enough that the renewal is scheduled rather than skipped.
      const host = leasingGateway(gateway, PREVIEW_RENEWAL_LEAD_MS + 30);

      renderPreview(host.gateway, image, 'Leased image');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(
        screen.getByRole('img', { name: 'Leased image' }).getAttribute('src'),
      ).toContain('#lease-1');

      // A stage editor stays open far longer than a signed URL lives, so an
      // image that silently stops loading looks like a resource the protocol
      // lost.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PREVIEW_RENEWAL_MIN_INTERVAL_MS);
      });
      expect(
        screen.getByRole('img', { name: 'Leased image' }).getAttribute('src'),
      ).toContain('#lease-2');
      expect(host.released()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never renews faster than the minimum interval, however short the lease', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const gateway = new InMemoryResourceGateway();
      const image = await stageImage(gateway, 'request-brief', 'brief.png');
      // A lease one millisecond longer than the lead. Renewing on the lead
      // alone would ask again in a millisecond, be answered with another such
      // lease, and go on doing that for as long as the preview is on screen.
      const host = leasingGateway(gateway, PREVIEW_RENEWAL_LEAD_MS + 1);

      renderPreview(host.gateway, image, 'Brief lease');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(host.issued()).toBe(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(
          PREVIEW_RENEWAL_MIN_INTERVAL_MS - 100,
        );
      });
      expect(host.issued()).toBe(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(host.issued()).toBe(2);

      // And the one after it is a renewal too, not a poll that happens to
      // have started slowly.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(
          PREVIEW_RENEWAL_MIN_INTERVAL_MS - 300,
        );
      });
      expect(host.issued()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets the expired lease go when the renewal that would have replaced it failed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const gateway = new InMemoryResourceGateway();
      const image = await stageImage(gateway, 'request-lapsed', 'lapsed.png');
      const host = leasingGateway(gateway, PREVIEW_RENEWAL_LEAD_MS + 30);

      renderPreview(host.gateway, image, 'Lapsing image');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(gateway.getStagingResidue()).toContain('preview:preview-1');

      // The renewal is refused, so the lease on screen is the last one there
      // will be: it goes on rendering until its own time runs out.
      gateway.failNext('resolvePreview');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PREVIEW_RENEWAL_MIN_INTERVAL_MS);
      });
      expect(screen.getByRole('img', { name: 'Lapsing image' })).toBeVisible();
      expect(host.released()).toBe(0);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30);
      });

      // Nothing renders the lease any more, and nothing else ever will: the
      // effect that would have released it is not going to run again, so a
      // field left open would hold the host's URL for as long as the editor is.
      expect(
        screen.getByText('the resource host is temporarily unavailable'),
      ).toBeVisible();
      expect(host.released()).toBe(1);
      expect(gateway.getStagingResidue()).not.toContain('preview:preview-1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases the lapsed lease exactly once, however the preview ends', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const gateway = new InMemoryResourceGateway();
      const image = await stageImage(gateway, 'request-once', 'once.png');
      const host = leasingGateway(gateway, PREVIEW_RENEWAL_LEAD_MS + 30);

      const { unmount } = renderPreview(host.gateway, image, 'Once image');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      gateway.failNext('resolvePreview');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PREVIEW_RENEWAL_MIN_INTERVAL_MS + 30);
      });
      expect(host.released()).toBe(1);

      unmount();

      // A host counts what it hands out: releasing the same lease twice is a
      // second release the next lease of the same URL would be charged with.
      expect(host.released()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases both leases when the field goes away mid-renewal', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const gateway = new InMemoryResourceGateway();
      const image = await stageImage(gateway, 'request-midway', 'midway.png');
      // The renewal is held open, so the component can be taken away while its
      // replacement lease is still on its way back from the host.
      const held = deferred<void>();
      const leasing = leasingGateway(gateway, PREVIEW_RENEWAL_LEAD_MS + 30);
      let resolutions = 0;
      const host = overrideGateway(gateway, {
        resolvePreview: async (resourceId) => {
          resolutions += 1;
          const result = await leasing.gateway.resolvePreview(resourceId);
          if (resolutions > 1) await held.promise;
          return result;
        },
      });

      const { unmount } = renderPreview(host, image, 'Midway image');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PREVIEW_RENEWAL_MIN_INTERVAL_MS);
      });
      expect(leasing.issued()).toBe(2);

      unmount();
      held.settle(undefined);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      // The one on screen went with the component; the one still on its way
      // back has nothing to render it, so it is released as it lands.
      expect(leasing.released()).toBe(2);
      expect(gateway.getStagingResidue()).not.toContain('preview:preview-1');
      expect(gateway.getStagingResidue()).not.toContain('preview:preview-2');
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves a lease with no end alone', async () => {
    const gateway = new InMemoryResourceGateway();
    const image = await stageImage(gateway, 'request-open', 'open.png');
    const resolvePreview = vi.spyOn(gateway, 'resolvePreview');

    renderPreview(gateway, image, 'Open image');
    await screen.findByRole('img', { name: 'Open image' });
    await act(flushPendingWork);

    // Nothing said the URL stops working, so asking for another one would be
    // traffic about nothing.
    expect(resolvePreview).toHaveBeenCalledTimes(1);
  });
});
