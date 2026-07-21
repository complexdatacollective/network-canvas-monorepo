import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import {
  asEntityAttributeReference,
  type SkipLogic,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import protocol from '../../store/modules/protocol';
import session, { updateEgo } from '../../store/modules/session';
import ui from '../../store/modules/ui';
import useInterviewNavigation from '../useInterviewNavigation';

type TestStage = {
  id: string;
  type: string;
  label: string;
  items: never[];
  skipLogic?: SkipLogic;
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

const skipTo = (destination: NonNullable<SkipLogic['destination']>) => ({
  ...ALWAYS_SKIPPED,
  destination,
});

const skipWhenDeclined = (
  destination: NonNullable<SkipLogic['destination']>,
): SkipLogic => ({
  action: 'SKIP',
  filter: {
    join: 'AND',
    rules: [
      {
        id: 'does-not-agree',
        type: 'ego',
        options: {
          attribute: asEntityAttributeReference('agrees'),
          operator: 'EXACTLY',
          value: false,
        },
      },
    ],
  },
  destination,
});

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
        codebook: {
          node: {},
          edge: {},
          ego: {
            variables: {
              agrees: { name: 'Agrees', type: 'boolean' },
            },
          },
        },
        stages,
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });
}

function renderStatefulNavigation(
  stages: TestStage[],
  initialStep = 0,
  initialStageOverrideIndex?: number,
) {
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

  const { result } = renderHook(
    () => useInterviewNavigation(initialStageOverrideIndex),
    { wrapper: Wrapper },
  );
  return { result, onStepChange, store };
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
        codebook: {
          node: {},
          edge: {},
          ego: {
            variables: {
              agrees: { name: 'Agrees', type: 'boolean' },
            },
          },
        },
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
  return { result, onStepChange, store };
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

describe('useInterviewNavigation targeted skip routes', () => {
  it('advances directly to a configured later destination', async () => {
    const stages = makeStages(5);
    stages[1]!.skipLogic = skipTo({ type: 'stage', stageId: 's4' });
    const { result, onStepChange } = renderStatefulNavigation(stages, 0);

    await act(async () => {
      await result.current.moveForward();
    });

    expect(onStepChange).toHaveBeenLastCalledWith(4, expect.anything());
  });

  it('advances to the synthetic finish screen for a finish destination', async () => {
    const stages = makeStages(3);
    stages[1]!.skipLogic = skipTo({ type: 'finish' });
    const { result, onStepChange } = renderStatefulNavigation(stages, 0);

    await act(async () => {
      await result.current.moveForward();
    });

    expect(onStepChange).toHaveBeenLastCalledWith(3, {
      progress: 100,
      totalSteps: 4,
    });
  });

  it('continues past a destination that is itself hidden', async () => {
    const stages = makeStages(5);
    stages[1]!.skipLogic = skipTo({ type: 'stage', stageId: 's3' });
    stages[3]!.skipLogic = ALWAYS_SKIPPED;
    const { result, onStepChange } = renderStatefulNavigation(stages, 0);

    await act(async () => {
      await result.current.moveForward();
    });

    expect(onStepChange).toHaveBeenLastCalledWith(4, expect.anything());
  });

  it('uses network changes saved by beforeNext when resolving the next screen', async () => {
    const stages = makeStages(3);
    stages[1]!.skipLogic = skipWhenDeclined({ type: 'finish' });
    const { result, onStepChange, store } = renderStatefulNavigation(stages, 0);

    act(() => {
      result.current.registerBeforeNext(async () => {
        await store.dispatch(updateEgo({ agrees: false }));
        return true;
      });
    });

    await act(async () => {
      await result.current.moveForward();
    });

    expect(onStepChange).toHaveBeenLastCalledWith(3, expect.anything());
  });

  it('returns Back to the decision screen and reopens the range when the answer changes', async () => {
    const stages = makeStages(5);
    stages[1]!.skipLogic = skipWhenDeclined({
      type: 'stage',
      stageId: 's4',
    });
    const { result, onStepChange, store } = renderStatefulNavigation(stages, 0);

    act(() => {
      result.current.registerBeforeNext(async () => {
        await store.dispatch(updateEgo({ agrees: false }));
        return true;
      });
    });
    await act(async () => result.current.moveForward());
    act(() => result.current.handleExitComplete());

    await act(async () => result.current.moveBackward());
    act(() => result.current.handleExitComplete());

    act(() => {
      result.current.registerBeforeNext(async () => {
        await store.dispatch(updateEgo({ agrees: true }));
        return true;
      });
    });
    await act(async () => result.current.moveForward());

    expect(onStepChange.mock.calls.map(([step]) => step)).toEqual([4, 0, 1]);
  });

  it('rechecks and confirms a menu target that becomes bypassed while the current screen saves', async () => {
    const stages = makeStages(5);
    stages[1]!.skipLogic = skipWhenDeclined({
      type: 'stage',
      stageId: 's4',
    });
    const { result, onStepChange, store } = renderStatefulNavigation(stages, 0);
    const confirmUnavailable = vi.fn().mockResolvedValue(true);

    act(() => {
      result.current.registerBeforeNext(async () => {
        await store.dispatch(updateEgo({ agrees: false }));
        return true;
      });
    });
    await act(async () => {
      await result.current.goToStage(2, confirmUnavailable);
    });

    expect(confirmUnavailable).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'bypassed' }),
    );
    expect(onStepChange).toHaveBeenLastCalledWith(2, expect.anything());
  });

  it('allows one confirmed bypassed screen, then returns Next and Back to the active route', async () => {
    const stages = makeStages(5);
    stages[1]!.skipLogic = skipTo({ type: 'stage', stageId: 's4' });
    const { result, onStepChange } = renderStatefulNavigation(stages, 0);
    const confirmUnavailable = vi.fn().mockResolvedValue(true);

    await act(async () => {
      await result.current.goToStage(2, confirmUnavailable);
    });
    expect(confirmUnavailable).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'bypassed' }),
    );

    act(() => result.current.handleExitComplete());
    await act(async () => {
      await result.current.moveForward();
    });
    act(() => result.current.handleExitComplete());
    await act(async () => {
      await result.current.moveBackward();
    });

    expect(onStepChange.mock.calls.map(([step]) => step)).toEqual([2, 4, 0]);
  });

  it('uses an initial override for one hidden screen and clears it on navigation', async () => {
    const stages = makeStages(4);
    stages[2]!.skipLogic = ALWAYS_SKIPPED;
    const { result, onStepChange } = renderStatefulNavigation(stages, 2, 2);

    expect(result.current.canRenderStage).toBe(true);

    await act(async () => {
      await result.current.moveForward();
    });

    expect(onStepChange).toHaveBeenLastCalledWith(3, expect.anything());
  });

  it('gates an unavailable resumed screen before recovering to the route', () => {
    const stages = makeStages(4);
    stages[2]!.skipLogic = ALWAYS_SKIPPED;
    const { result, onStepChange } = renderStatefulNavigation(stages, 2);

    expect(result.current.canRenderStage).toBe(false);
    expect(onStepChange).toHaveBeenLastCalledWith(1, expect.anything());

    act(() => result.current.handleExitComplete());
    expect(result.current.canRenderStage).toBe(true);
  });

  it('recovers a resumed targeted local skip forward to its destination', () => {
    const stages = makeStages(4);
    stages[2]!.skipLogic = skipTo({ type: 'finish' });
    const { result, onStepChange } = renderStatefulNavigation(stages, 2);

    expect(result.current.canRenderStage).toBe(false);
    expect(onStepChange).toHaveBeenLastCalledWith(4, expect.anything());
  });

  it('recovers a resumed bypassed screen forward along the active route', () => {
    const stages = makeStages(5);
    stages[1]!.skipLogic = skipTo({ type: 'stage', stageId: 's4' });
    const { result, onStepChange } = renderStatefulNavigation(stages, 2);

    expect(result.current.canRenderStage).toBe(false);
    expect(onStepChange).toHaveBeenLastCalledWith(4, expect.anything());
  });

  it('disables Back when raw earlier screens exist but none are on the active route', () => {
    const stages = makeStages(3);
    stages[0]!.skipLogic = ALWAYS_SKIPPED;
    const { result } = renderStatefulNavigation(stages, 1);

    expect(result.current.disableMoveBackward).toBe(true);
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

  it("passes intent 'jump' to beforeNext, and 'step' for button navigation", async () => {
    const intents: string[] = [];
    const record = (_direction: string, intent: string) => {
      intents.push(intent);
      return true;
    };

    const jumped = renderStatefulNavigation(makeStages(5), 2);
    act(() => {
      jumped.result.current.registerBeforeNext(record);
    });
    await act(async () => {
      await jumped.result.current.goToStage(4);
    });

    const stepped = renderStatefulNavigation(makeStages(5), 2);
    act(() => {
      stepped.result.current.registerBeforeNext(record);
    });
    await act(async () => {
      await stepped.result.current.moveForward();
    });
    act(() => {
      stepped.result.current.registerBeforeNext(record);
    });
    await act(async () => {
      await stepped.result.current.moveBackward();
    });

    expect(intents).toEqual(['jump', 'step', 'step']);
  });

  it('lets a handler deny a jump while still allowing a step', async () => {
    const denyJumps = (_direction: string, intent: string) => intent !== 'jump';

    const jumped = renderStatefulNavigation(makeStages(5), 2);
    act(() => {
      jumped.result.current.registerBeforeNext(denyJumps);
    });
    await act(async () => {
      await jumped.result.current.goToStage(4);
    });

    expect(jumped.onStepChange).not.toHaveBeenCalled();

    const stepped = renderStatefulNavigation(makeStages(5), 2);
    act(() => {
      stepped.result.current.registerBeforeNext(denyJumps);
    });
    await act(async () => {
      await stepped.result.current.moveForward();
    });

    expect(stepped.onStepChange).toHaveBeenCalledWith(3, expect.anything());
  });

  it('lets a handler allow a jump while still blocking a step', async () => {
    const allowOnlyJumps = (_direction: string, intent: string) =>
      intent === 'jump';

    const jumped = renderStatefulNavigation(makeStages(5), 2);
    act(() => {
      jumped.result.current.registerBeforeNext(allowOnlyJumps);
    });
    await act(async () => {
      await jumped.result.current.goToStage(4);
    });

    expect(jumped.onStepChange).toHaveBeenCalledWith(4, expect.anything());

    const stepped = renderStatefulNavigation(makeStages(5), 2);
    act(() => {
      stepped.result.current.registerBeforeNext(allowOnlyJumps);
    });
    await act(async () => {
      await stepped.result.current.moveForward();
    });

    expect(stepped.onStepChange).not.toHaveBeenCalled();
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
    expect(confirmSkip).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'local-skip' }),
    );
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
