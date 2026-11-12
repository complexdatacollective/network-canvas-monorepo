import { renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { useResourceInspection } from '../useResourceInspection.ts';
import { deferred, flushPendingWork } from './asyncControls.ts';
import {
  createPreviewHost,
  HOST_UNAVAILABLE,
  previewOf,
  renderPreview,
} from './previewHarness.tsx';
import { ResourceContextFrame } from './resourceContext.tsx';
import {
  createResourceHost,
  withResourceProcedures,
  type CommittedResource,
} from './resourceHost.ts';

/**
 * A selection that is left and made again is a new selection.
 *
 * What was read for the resource before it was left belongs to that
 * selection. Choosing the same resource again must not show it while the new
 * request is pending, and must not keep it when the new request fails.
 */

const seed = (id: string): CommittedResource => ({
  id,
  kind: 'image',
  name: `Photo ${id}`,
  source: `${id.padEnd(64, '0')}.png`,
  bytes: `png-${id}`,
});

describe('useResourceInspection, when a resource is chosen again', () => {
  function setUp() {
    const host = createResourceHost({ resources: [seed('a'), seed('b')] });
    let mode: 'answer' | 'hold' | 'refuse' = 'answer';
    const held = deferred<void>();
    const adapter = withResourceProcedures(host, {
      inspect: async (input) => {
        if (mode === 'refuse') {
          return {
            status: 'failed' as const,
            failure: {
              reason: 'unavailable' as const,
              message: HOST_UNAVAILABLE,
              retryable: true,
            },
          };
        }
        if (mode === 'hold') await held.promise;
        return host.adapter.rpcCall('ResourcesInspect', input);
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ResourceContextFrame adapter={adapter} protocolId={host.protocolId}>
        {children}
      </ResourceContextFrame>
    );
    const hook = renderHook(
      ({ id }: { id: string | undefined }) => useResourceInspection(id),
      { initialProps: { id: 'a' as string | undefined }, wrapper },
    );
    return {
      hook,
      mode: (next: typeof mode) => {
        mode = next;
      },
      release: () => held.settle(),
    };
  }

  it('does not show the inspection from before the selection was left', async () => {
    const { hook, mode } = setUp();
    await waitFor(() => expect(hook.result.current.inspection).toBeDefined());

    hook.rerender({ id: undefined });
    mode('hold');
    hook.rerender({ id: 'a' });

    expect(hook.result.current.inspection).toBeUndefined();
    expect(hook.result.current.busy).toBe(true);
  });

  it('keeps no inspection when the new request fails', async () => {
    const { hook, mode } = setUp();
    await waitFor(() => expect(hook.result.current.inspection).toBeDefined());

    hook.rerender({ id: undefined });
    mode('refuse');
    hook.rerender({ id: 'a' });

    await waitFor(() => expect(hook.result.current.failure).toBeDefined());
    expect(hook.result.current.inspection).toBeUndefined();
  });

  it('still shows the inspection of the resource it was asked about', async () => {
    const { hook } = setUp();
    await waitFor(() => expect(hook.result.current.inspection).toBeDefined());

    hook.rerender({ id: 'b' });

    await waitFor(() =>
      expect(hook.result.current.inspection?.descriptor.id).toBe('b'),
    );
  });
});

describe('ResourcePreview, when a resource is chosen again', () => {
  it('does not bring back the preview from before the selection was left', async () => {
    const host = createPreviewHost();
    const first = await host.image('first.png');
    const second = await host.image('second.png');

    const { rerender } = renderPreview(host, first, 'First');
    await screen.findByRole('img', { name: 'First' });

    // The second resource's answer is held, and so is the first's when it is
    // asked for again: nothing has been resolved for either selection yet.
    host.holdNext();
    rerender(previewOf(host, second, 'Second'));
    host.holdNext();
    rerender(previewOf(host, first, 'First'));
    await flushPendingWork();

    expect(screen.queryByRole('img', { name: 'First' })).toBeNull();
  });

  it('shows no preview when the new request fails', async () => {
    const host = createPreviewHost();
    const first = await host.image('first.png');
    const second = await host.image('second.png');

    const { rerender } = renderPreview(host, first, 'First');
    await screen.findByRole('img', { name: 'First' });

    // The second resource never answers, so the first's preview is the only
    // thing there is to come back.
    host.holdNext();
    rerender(previewOf(host, second, 'Second'));
    host.refuseNext();
    rerender(previewOf(host, first, 'First'));

    expect(await screen.findByText(HOST_UNAVAILABLE)).toBeVisible();
    expect(screen.queryByRole('img', { name: 'First' })).toBeNull();
  });
});
