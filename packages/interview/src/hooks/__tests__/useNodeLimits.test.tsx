import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import { AnalyticsContext } from '../../analytics/AnalyticsContext';
import type { Tracker } from '../../analytics/tracker';
import { StageMetadataContext } from '../../contexts/StageMetadataContext';
import ui from '../../store/modules/ui';
import type { BeforeNextFunction, RegisterBeforeNext } from '../../types';
import useNodeLimits from '../useNodeLimits';

function makeWrapper(tracker: Tracker, registerBeforeNext: RegisterBeforeNext) {
  const store = configureStore({ reducer: { ui } });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <AnalyticsContext.Provider value={tracker}>
          <StageMetadataContext.Provider value={registerBeforeNext}>
            {children}
          </StageMetadataContext.Provider>
        </AnalyticsContext.Provider>
      </Provider>
    );
  };
}

describe('useNodeLimits', () => {
  it('reports the structural min_nodes validation kind', async () => {
    const tracker = { track: vi.fn(), captureException: vi.fn() };
    let beforeNext: BeforeNextFunction | null = null;
    const registerBeforeNext = ((keyOrHandler, maybeHandler) => {
      beforeNext =
        typeof keyOrHandler === 'string' ? maybeHandler : keyOrHandler;
    }) as RegisterBeforeNext;

    renderHook(
      () =>
        useNodeLimits({
          stageNodeCount: 0,
          minNodes: 1,
          maxNodes: 4,
          isLastPrompt: true,
        }),
      { wrapper: makeWrapper(tracker, registerBeforeNext) },
    );

    expect(beforeNext).not.toBeNull();
    await act(async () => {
      const allowed = await beforeNext?.('forwards', 'step');
      expect(allowed).toBe(false);
    });

    expect(tracker.track).toHaveBeenCalledWith('stage_validation_failed', {
      validation_kind: 'min_nodes',
      direction: 'forwards',
    });
  });
});
