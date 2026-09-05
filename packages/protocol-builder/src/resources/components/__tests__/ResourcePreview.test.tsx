import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ResourceGatewayProvider } from '../../context.tsx';
import {
  resourceFailure,
  type ProtocolBuilderResourceGateway,
  type ResourcePreview as ResolvedPreview,
  type ResourceResult,
} from '../../gateway.ts';
import { InMemoryResourceGateway } from '../../InMemoryResourceGateway.ts';
import ResourcePreview from '../ResourcePreview.tsx';
import {
  deferred,
  flushPendingWork,
  overrideGateway,
} from './overrideGateway.ts';

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
