import { renderHook, waitFor } from '@testing-library/react';
import { Redacted } from 'effect';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import {
  deferred,
  flushPendingWork,
} from '../../../resources/components/__tests__/asyncControls.ts';
import { ResourceContextFrame } from '../../../resources/components/__tests__/resourceContext.tsx';
import {
  createResourceHost,
  withResourceProcedures,
} from '../../../resources/components/__tests__/resourceHost.ts';
import { useGeoJsonFeatureProperties } from '../useGeoJsonFeatureProperties.ts';

const document = (properties: Record<string, unknown>): string =>
  JSON.stringify({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties, geometry: null }],
  });

const asDataUrl = (text: string): string =>
  `data:application/json,${encodeURIComponent(text)}`;

/**
 * A layer that is chosen, cleared and chosen again is read afresh.
 *
 * What was read the first time belongs to that selection. The second must not
 * start with it on screen, and must not keep it when the new read fails.
 */
function setUp() {
  const host = createResourceHost();
  let mode: 'answer' | 'hold' | 'refuse' | 'unreadable' = 'answer';
  const held = deferred<void>();
  const adapter = withResourceProcedures(host, {
    preview: async (input) => {
      if (mode === 'refuse') {
        return {
          status: 'failed' as const,
          failure: {
            reason: 'unavailable' as const,
            message: 'the resource host is temporarily unavailable',
            retryable: true,
          },
        };
      }
      if (mode === 'hold') await held.promise;
      return {
        status: 'ok' as const,
        data: {
          resourceId: input.resourceId,
          url: Redacted.make(
            asDataUrl(
              mode === 'unreadable' ? 'not json' : document({ town: 'x' }),
            ),
          ),
        },
      };
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ResourceContextFrame adapter={adapter} protocolId={host.protocolId}>
      {children}
    </ResourceContextFrame>
  );
  const hook = renderHook(
    ({ id }: { id: string | undefined }) => useGeoJsonFeatureProperties(id),
    { initialProps: { id: 'layer-a' as string | undefined }, wrapper },
  );
  return {
    hook,
    mode: (next: typeof mode) => {
      mode = next;
    },
  };
}

describe('useGeoJsonFeatureProperties, when a layer is chosen again', () => {
  it('does not offer the properties from before the layer was cleared', async () => {
    const { hook, mode } = setUp();
    await waitFor(() => expect(hook.result.current.names).toEqual(['town']));

    hook.rerender({ id: undefined });
    mode('hold');
    hook.rerender({ id: 'layer-a' });
    await flushPendingWork();

    expect(hook.result.current.names).toBeUndefined();
    expect(hook.result.current.busy).toBe(true);
  });

  it('keeps no properties when the new read fails', async () => {
    const { hook, mode } = setUp();
    await waitFor(() => expect(hook.result.current.names).toEqual(['town']));

    hook.rerender({ id: undefined });
    mode('refuse');
    hook.rerender({ id: 'layer-a' });

    await waitFor(() => expect(hook.result.current.failure).toBeDefined());
    expect(hook.result.current.names).toBeUndefined();
  });

  it('does not report a layer as unreadable after it has been replaced', async () => {
    const { hook, mode } = setUp();
    mode('unreadable');
    hook.rerender({ id: 'layer-b' });
    await waitFor(() => expect(hook.result.current.unreadable).toBe(true));

    hook.rerender({ id: undefined });
    mode('hold');
    hook.rerender({ id: 'layer-b' });
    await flushPendingWork();

    expect(hook.result.current.unreadable).toBe(false);
  });
});
