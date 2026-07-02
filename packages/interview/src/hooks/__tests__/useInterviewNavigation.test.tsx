import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import { entityAttributesProperty } from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import protocol from '../../store/modules/protocol';
import session from '../../store/modules/session';
import ui from '../../store/modules/ui';
import useInterviewNavigation from '../useInterviewNavigation';

type TestStage = {
  id: string;
  type: string;
  label: string;
  items: never[];
  skipLogic?: { action: 'SKIP'; filter: { join: 'AND'; rules: never[] } };
};

const makeStages = (count: number): TestStage[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    type: 'Information',
    label: `Stage ${i}`,
    items: [],
  }));

const ALWAYS_SKIPPED = {
  action: 'SKIP' as const,
  filter: { join: 'AND' as const, rules: [] as never[] },
};

function makeStore(stages: TestStage[]) {
  return configureStore({
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
        stages,
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });
}

function renderStatefulNavigation(stages: TestStage[], initialStep = 0) {
  const store = makeStore(stages);
  const onStepChange = vi.fn();

  function Wrapper({ children }: { children: ReactNode }) {
    const [step, setStep] = useState(initialStep);
    return (
      <Provider store={store}>
        <CurrentStepProvider
          currentStep={step}
          onStepChange={(nextStep, meta) => {
            onStepChange(nextStep, meta);
            setStep(nextStep);
          }}
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

describe('useInterviewNavigation goToStage (progress-bar jump)', () => {
  it('jumps directly to a non-skipped stage', async () => {
    const { result, onStepChange } = renderStatefulNavigation(makeStages(4), 0);

    await act(async () => {
      await result.current.goToStage(2);
    });

    expect(onStepChange).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ totalSteps: 5 }),
    );
  });

  it('does nothing when the target is the current step', async () => {
    const { result, onStepChange } = renderStatefulNavigation(makeStages(4), 1);

    await act(async () => {
      await result.current.goToStage(1);
    });

    expect(onStepChange).not.toHaveBeenCalled();
  });

  it('is blocked when a beforeNext handler returns false', async () => {
    const { result, onStepChange } = renderStatefulNavigation(makeStages(4), 0);

    act(() => {
      result.current.registerBeforeNext(() => false);
    });

    await act(async () => {
      await result.current.goToStage(2);
    });

    expect(onStepChange).not.toHaveBeenCalled();
  });

  it('passes forwards/backwards to beforeNext based on the target', async () => {
    const directions: string[] = [];
    const record = (direction: string) => {
      directions.push(direction);
      return true;
    };

    const forward = renderStatefulNavigation(makeStages(5), 2);
    act(() => {
      forward.result.current.registerBeforeNext(record);
    });
    await act(async () => {
      await forward.result.current.goToStage(4);
    });

    const backward = renderStatefulNavigation(makeStages(5), 2);
    act(() => {
      backward.result.current.registerBeforeNext(record);
    });
    await act(async () => {
      await backward.result.current.goToStage(0);
    });

    expect(directions).toEqual(['forwards', 'backwards']);
  });

  it('still navigates when a beforeNext handler returns FORCE', async () => {
    const { result, onStepChange } = renderStatefulNavigation(makeStages(4), 0);

    act(() => {
      result.current.registerBeforeNext(() => 'FORCE');
    });

    await act(async () => {
      await result.current.goToStage(2);
    });

    expect(onStepChange).toHaveBeenCalledWith(2, expect.anything());
  });

  it('asks for confirmation before jumping to a skipped stage and aborts if declined', async () => {
    const stages = makeStages(4);
    stages[2]!.skipLogic = ALWAYS_SKIPPED;
    const { result, onStepChange } = renderStatefulNavigation(stages, 0);

    const confirmSkip = vi.fn().mockResolvedValue(false);

    await act(async () => {
      await result.current.goToStage(2, confirmSkip);
    });

    expect(confirmSkip).toHaveBeenCalledTimes(1);
    expect(onStepChange).not.toHaveBeenCalled();
  });

  it('lands on a confirmed skipped stage without being bounced by recovery', async () => {
    const stages = makeStages(4);
    stages[2]!.skipLogic = ALWAYS_SKIPPED;
    const { result, onStepChange } = renderStatefulNavigation(stages, 0);

    const confirmSkip = vi.fn().mockResolvedValue(true);

    await act(async () => {
      await result.current.goToStage(2, confirmSkip);
    });

    await act(async () => {
      result.current.handleExitComplete();
    });

    expect(onStepChange).toHaveBeenCalledTimes(1);
    expect(onStepChange).toHaveBeenCalledWith(2, expect.anything());
  });
});
