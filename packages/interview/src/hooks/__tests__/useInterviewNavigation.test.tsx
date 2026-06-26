import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import { entityAttributesProperty } from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import protocol from '../../store/modules/protocol';
import session from '../../store/modules/session';
import ui from '../../store/modules/ui';
import useInterviewNavigation from '../useInterviewNavigation';

const makeStages = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    type: 'Information',
    label: `Stage ${i}`,
    items: [],
  }));

function renderNavigation(stageCount: number, currentStep: number) {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        network: {
          nodes: [],
          edges: [],
          ego: { [entityAttributesProperty]: {} },
        },
      } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 8,
        codebook: { node: {}, edge: {}, ego: { variables: {} } },
        stages: makeStages(stageCount),
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });

  const onStepChange = vi.fn();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <CurrentStepProvider
          currentStep={currentStep}
          onStepChange={onStepChange}
        >
          {children}
        </CurrentStepProvider>
      </Provider>
    );
  }

  const { result } = renderHook(() => useInterviewNavigation(), {
    wrapper: Wrapper,
  });
  return { result, onStepChange };
}

describe('useInterviewNavigation step-change meta', () => {
  it('reports progress and the finish-inclusive total when advancing a stage', async () => {
    // Two protocol stages ⇒ totalSteps is 3 (the appended FinishSession stage).
    const { result, onStepChange } = renderNavigation(2, 0);

    await act(async () => {
      await result.current.moveForward();
    });

    // Entering stage 1 (single-prompt): (1/3 + 1·1/3)·100 ≈ 66.67
    expect(onStepChange).toHaveBeenCalledWith(1, {
      progress: expect.closeTo(200 / 3),
      totalSteps: 3,
    });
  });

  it('reports 100% when advancing into the appended finish stage', async () => {
    // From the last protocol stage (index 1), forward lands on finish (index 2).
    const { result, onStepChange } = renderNavigation(2, 1);

    await act(async () => {
      await result.current.moveForward();
    });

    expect(onStepChange).toHaveBeenCalledWith(2, {
      progress: 100,
      totalSteps: 3,
    });
  });
});
