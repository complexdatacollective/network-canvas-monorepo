import { configureStore, type Middleware } from '@reduxjs/toolkit';
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
import { createWritesInFlightMiddleware } from '../../store/middleware/writesInFlight';
import protocol from '../../store/modules/protocol';
import session, { updateEgo, updatePrompt } from '../../store/modules/session';
import ui from '../../store/modules/ui';
import { WritesInFlightProvider } from '../../store/WritesInFlightContext';
import useInterviewNavigation from '../useInterviewNavigation';

type TestStage = {
  id: string;
  type: string;
  label: string;
  items: never[];
  skipLogic?: SkipLogic;
  prompts?: { id: string; text: string }[];
};

// `count` authored stages, followed by the finish stage every protocol ends
// at; its index is `count`.
const makeStages = (count: number): TestStage[] => [
  ...Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    type: 'Information',
    label: `Stage ${i}`,
    items: [] as never[],
  })),
  { id: 'finish', type: 'FinishSession', label: 'Finish', items: [] },
];

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

function makeStore(stages: TestStage[], extraMiddleware: Middleware[] = []) {
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
        schemaVersion: 9,
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
    middleware: (g) =>
      g({ serializableCheck: false }).concat(...extraMiddleware),
  });
}

function renderStatefulNavigation(
  stages: TestStage[],
  initialStep = 0,
  initialStageOverrideIndex?: number,
  reviewMode = false,
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
    () => useInterviewNavigation(initialStageOverrideIndex, reviewMode),
    { wrapper: Wrapper },
  );
  return { result, onStepChange, store };
}

// Navigation in a store that tracks the session writes under way, as the
// interview's own store does.
function renderTrackingWrites(stages: TestStage[], initialStep = 0) {
  const { middleware, writesSettled, trackWrite } =
    createWritesInFlightMiddleware();
  const store = makeStore(stages, [middleware]);
  const onStepChange = vi.fn();

  function Wrapper({ children }: { children: ReactNode }) {
    const [step, setStep] = useState(initialStep);
    return (
      <Provider store={store}>
        <WritesInFlightProvider
          writesSettled={writesSettled}
          trackWrite={trackWrite}
        >
          <CurrentStepProvider
            currentStep={step}
            onStepChange={(nextStep, meta) => {
              onStepChange(nextStep, meta);
              setStep(nextStep);
            }}
          >
            {children}
          </CurrentStepProvider>
        </WritesInFlightProvider>
      </Provider>
    );
  }

  const { result } = renderHook(() => useInterviewNavigation(), {
    wrapper: Wrapper,
  });
  return { result, onStepChange, store };
}

function renderNavigation(
  stageCount: number,
  currentStep: number,
  reviewMode = false,
) {
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
        schemaVersion: 9,
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

  const { result } = renderHook(
    () => useInterviewNavigation(undefined, reviewMode),
    {
      wrapper: Wrapper,
    },
  );
  return { result, onStepChange, store };
}

describe('useInterviewNavigation step-change meta', () => {
  it('reports progress and the finish-inclusive total when advancing a stage', async () => {
    // Two authored stages and the finish stage ⇒ totalSteps is 3.
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

  it('reports 100% when advancing into the finish stage', async () => {
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

  it('stops review mode at the final authored stage', async () => {
    const { result, onStepChange } = renderNavigation(2, 1, true);

    expect(result.current.disableMoveForward).toBe(true);

    await act(async () => {
      await result.current.moveForward();
    });

    expect(onStepChange).not.toHaveBeenCalled();
  });

  it('allows stage-local navigation on the final authored review stage', async () => {
    const { result, onStepChange } = renderNavigation(2, 1, true);
    const beforeNext = vi.fn(() => false);

    act(() => {
      result.current.registerBeforeNext(beforeNext);
    });

    expect(result.current.disableMoveForward).toBe(false);

    await act(async () => {
      await result.current.moveForward();
    });

    expect(beforeNext).toHaveBeenCalledWith('forwards', 'step');
    expect(onStepChange).not.toHaveBeenCalled();
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

  it('advances to the finish stage for a finish destination', async () => {
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
        await store.dispatch(updateEgo({ set: { agrees: false }, unset: [] }));
        return true;
      });
    });

    await act(async () => {
      await result.current.moveForward();
    });

    expect(onStepChange).toHaveBeenLastCalledWith(3, expect.anything());
  });

  it('keeps the current authored stage when a review edit changes its route to finish', async () => {
    const stages = makeStages(3);
    stages[0]!.skipLogic = skipWhenDeclined({ type: 'finish' });
    const { result, onStepChange, store } = renderStatefulNavigation(
      stages,
      0,
      undefined,
      true,
    );

    act(() => {
      result.current.registerBeforeNext(async () => {
        await store.dispatch(updateEgo({ set: { agrees: false }, unset: [] }));
        return true;
      });
    });

    await act(async () => {
      await result.current.moveForward();
    });

    expect(onStepChange).not.toHaveBeenCalled();
    expect(result.current.currentStep).toBe(0);
    expect(result.current.canRenderStage).toBe(true);
    expect(result.current.disableMoveForward).toBe(true);
  });

  it('still recovers backward from an untargeted hidden review stage', () => {
    const stages = makeStages(3);
    stages[2]!.skipLogic = ALWAYS_SKIPPED;
    const { result, onStepChange } = renderStatefulNavigation(
      stages,
      2,
      undefined,
      true,
    );

    expect(result.current.canRenderStage).toBe(false);
    expect(onStepChange).toHaveBeenLastCalledWith(1, expect.anything());
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
        await store.dispatch(updateEgo({ set: { agrees: false }, unset: [] }));
        return true;
      });
    });
    await act(async () => result.current.moveForward());
    act(() => result.current.handleExitComplete());

    await act(async () => result.current.moveBackward());
    act(() => result.current.handleExitComplete());

    act(() => {
      result.current.registerBeforeNext(async () => {
        await store.dispatch(updateEgo({ set: { agrees: true }, unset: [] }));
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
        await store.dispatch(updateEgo({ set: { agrees: false }, unset: [] }));
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

describe('useInterviewNavigation Back at the interview start', () => {
  it('keeps Back disabled on a fresh first stage even when a beforeNext handler registers', () => {
    const { result } = renderStatefulNavigation(makeStages(2), 0);

    act(() => {
      result.current.registerBeforeNext(() => false);
    });

    expect(result.current.disableMoveBackward).toBe(true);
  });

  it('enables Back once the participant has attempted navigation on a handler stage', async () => {
    const { result } = renderStatefulNavigation(makeStages(2), 0);

    act(() => {
      // Consumes the step internally, like a census moving intro -> first pair.
      result.current.registerBeforeNext(() => false);
    });

    await act(async () => {
      await result.current.moveForward();
    });

    expect(result.current.disableMoveBackward).toBe(false);
  });

  it('keeps Back disabled on a handler stage when every earlier screen is off the active route', () => {
    const stages = makeStages(3);
    stages[0]!.skipLogic = ALWAYS_SKIPPED;
    const { result } = renderStatefulNavigation(stages, 1);

    act(() => {
      result.current.registerBeforeNext(() => false);
    });

    expect(result.current.disableMoveBackward).toBe(true);
  });

  it('leaves beforeNext handlers registered when Back has nowhere to go', async () => {
    const { result, onStepChange } = renderStatefulNavigation(makeStages(2), 0);
    const handler = vi.fn(() => true);

    act(() => {
      result.current.registerBeforeNext(handler);
    });

    await act(async () => {
      await result.current.moveBackward();
    });

    // No previous stage: nothing to navigate to, and the stage's handler must
    // survive so it still intercepts the next Forward.
    expect(onStepChange).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.moveForward();
    });

    expect(handler).toHaveBeenCalledTimes(2);
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

  it('never takes a review to the finish stage', async () => {
    const { result, onStepChange } = renderStatefulNavigation(
      makeStages(3),
      0,
      undefined,
      true,
    );

    await act(async () => {
      await result.current.goToStage(3);
    });
    expect(onStepChange).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.goToStage(2);
    });
    expect(onStepChange).toHaveBeenCalledWith(2, expect.anything());
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

  it('does not run beforeNext handlers when an unavailable target is declined', async () => {
    const stages = makeStages(4);
    stages[2]!.skipLogic = ALWAYS_SKIPPED;
    const { result, onStepChange } = renderStatefulNavigation(stages, 0);

    const beforeNext = vi.fn(() => true);
    act(() => {
      result.current.registerBeforeNext(beforeNext);
    });

    const confirmSkip = vi.fn().mockResolvedValue(false);
    await act(async () => {
      await result.current.goToStage(2, confirmSkip);
    });

    expect(confirmSkip).toHaveBeenCalledTimes(1);
    expect(beforeNext).not.toHaveBeenCalled();
    expect(onStepChange).not.toHaveBeenCalled();
  });

  it('confirms an unavailable target once when it is already unavailable', async () => {
    const stages = makeStages(4);
    stages[2]!.skipLogic = ALWAYS_SKIPPED;
    const { result, onStepChange } = renderStatefulNavigation(stages, 0);

    const confirmSkip = vi.fn().mockResolvedValue(true);
    await act(async () => {
      await result.current.goToStage(2, confirmSkip);
    });

    expect(confirmSkip).toHaveBeenCalledTimes(1);
    expect(onStepChange).toHaveBeenCalledWith(2, expect.anything());
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

describe('useInterviewNavigation waiting for writes begun on the stage', () => {
  const declined = { set: { agrees: false }, unset: [] };
  // Lets everything already queued run, so a navigation that did not wait
  // would have finished.
  const queuedWorkRuns = () =>
    act(() => new Promise((resolve) => setTimeout(resolve, 0)));

  it('chooses the next screen with an answer still being stored', async () => {
    const stages = makeStages(3);
    stages[1]!.skipLogic = skipWhenDeclined({ type: 'finish' });
    const { result, onStepChange, store } = renderTrackingWrites(stages);
    store.dispatch(updateEgo.pending('w1', declined));

    let moving: Promise<unknown> = Promise.resolve();
    act(() => {
      moving = result.current.moveForward();
    });
    await queuedWorkRuns();
    expect(onStepChange).not.toHaveBeenCalled();

    await act(async () => {
      store.dispatch(updateEgo.fulfilled(declined, 'w1', declined));
      await moving;
    });
    expect(onStepChange).toHaveBeenLastCalledWith(3, expect.anything());
  });

  it('chooses the previous screen with an answer still being stored', async () => {
    const stages = makeStages(3);
    stages[1]!.skipLogic = {
      action: 'SKIP',
      filter: skipWhenDeclined({ type: 'finish' }).filter,
    };
    const { result, onStepChange, store } = renderTrackingWrites(stages, 2);
    store.dispatch(updateEgo.pending('w1', declined));

    let moving: Promise<unknown> = Promise.resolve();
    act(() => {
      moving = result.current.moveBackward();
    });
    await queuedWorkRuns();
    expect(onStepChange).not.toHaveBeenCalled();

    await act(async () => {
      store.dispatch(updateEgo.fulfilled(declined, 'w1', declined));
      await moving;
    });
    expect(onStepChange).toHaveBeenLastCalledWith(0, expect.anything());
  });

  it('rechecks a menu target with an answer still being stored', async () => {
    const stages = makeStages(5);
    stages[1]!.skipLogic = skipWhenDeclined({
      type: 'stage',
      stageId: 's4',
    });
    const { result, onStepChange, store } = renderTrackingWrites(stages);
    const confirmUnavailable = vi.fn().mockResolvedValue(true);
    store.dispatch(updateEgo.pending('w1', declined));

    let moving: Promise<unknown> = Promise.resolve();
    act(() => {
      moving = result.current.goToStage(2, confirmUnavailable);
    });
    await queuedWorkRuns();
    expect(onStepChange).not.toHaveBeenCalled();

    await act(async () => {
      store.dispatch(updateEgo.fulfilled(declined, 'w1', declined));
      await moving;
    });
    expect(confirmUnavailable).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'bypassed' }),
    );
    expect(onStepChange).toHaveBeenLastCalledWith(2, expect.anything());
  });

  type Navigation = ReturnType<typeof useInterviewNavigation>;
  it.each<
    [string, (navigation: Navigation) => Promise<unknown>, number, number]
  >([
    ['forward', (navigation) => navigation.moveForward(), 0, 1],
    ['back', (navigation) => navigation.moveBackward(), 2, 1],
    ['to a menu target', (navigation) => navigation.goToStage(2), 0, 2],
  ])(
    'stays when an answer still being stored is refused, going %s, and goes when asked again',
    async (_direction, navigate, from, to) => {
      const { result, onStepChange, store } = renderTrackingWrites(
        makeStages(3),
        from,
      );
      store.dispatch(updateEgo.pending('w1', declined));

      let moving: Promise<unknown> = Promise.resolve();
      act(() => {
        moving = navigate(result.current);
      });
      await act(async () => {
        store.dispatch(
          updateEgo.rejected(new Error('refused'), 'w1', declined),
        );
        await moving;
      });
      expect(onStepChange).not.toHaveBeenCalled();

      await act(async () => {
        await navigate(result.current);
      });
      expect(onStepChange).toHaveBeenLastCalledWith(to, expect.anything());
    },
  );

  it.each<[string, (navigation: Navigation) => Promise<unknown>]>([
    ['forward', (navigation) => navigation.moveForward()],
    ['to a menu target', (navigation) => navigation.goToStage(2)],
  ])(
    'stays, going %s, when an answer the stage begins storing as it is left is refused',
    async (_direction, navigate) => {
      const { result, onStepChange, store } = renderTrackingWrites(
        makeStages(3),
      );
      act(() => {
        result.current.registerBeforeNext(() => {
          store.dispatch(updateEgo.pending('w1', declined));
          return true;
        });
      });

      let moving: Promise<unknown> = Promise.resolve();
      act(() => {
        moving = navigate(result.current);
      });
      await queuedWorkRuns();
      await act(async () => {
        store.dispatch(
          updateEgo.rejected(new Error('refused'), 'w1', declined),
        );
        await moving;
      });

      expect(onStepChange).not.toHaveBeenCalled();
    },
  );

  // One stage asking two questions, then a second stage.
  const twoPrompts = () => {
    const stages = makeStages(2);
    stages[0]!.prompts = [
      { id: 'p1', text: 'First question' },
      { id: 'p2', text: 'Second question' },
    ];
    return stages;
  };

  it.each<
    [string, (navigation: Navigation) => Promise<unknown>, number, number]
  >([
    ['forward', (navigation) => navigation.moveForward(), 0, 1],
    ['back', (navigation) => navigation.moveBackward(), 1, 0],
  ])(
    'moves to the %s prompt only once an answer still being stored is stored',
    async (_direction, navigate, from, to) => {
      const { result, onStepChange, store } =
        renderTrackingWrites(twoPrompts());
      act(() => {
        store.dispatch(updatePrompt(from));
      });
      store.dispatch(updateEgo.pending('w1', declined));

      let moving: Promise<unknown> = Promise.resolve();
      act(() => {
        moving = navigate(result.current);
      });
      await queuedWorkRuns();
      expect(store.getState().session.promptIndex).toBe(from);

      await act(async () => {
        store.dispatch(updateEgo.fulfilled(declined, 'w1', declined));
        await moving;
      });
      expect(store.getState().session.promptIndex).toBe(to);
      expect(onStepChange).not.toHaveBeenCalled();
    },
  );

  it.each<
    [string, (navigation: Navigation) => Promise<unknown>, number, number]
  >([
    ['forward', (navigation) => navigation.moveForward(), 0, 1],
    ['back', (navigation) => navigation.moveBackward(), 1, 0],
  ])(
    'stays on the prompt when an answer still being stored is refused, going %s, and moves when asked again',
    async (_direction, navigate, from, to) => {
      const { result, store } = renderTrackingWrites(twoPrompts());
      act(() => {
        store.dispatch(updatePrompt(from));
      });
      store.dispatch(updateEgo.pending('w1', declined));

      let moving: Promise<unknown> = Promise.resolve();
      act(() => {
        moving = navigate(result.current);
      });
      await act(async () => {
        store.dispatch(
          updateEgo.rejected(new Error('refused'), 'w1', declined),
        );
        await moving;
      });
      expect(store.getState().session.promptIndex).toBe(from);

      await act(async () => {
        await navigate(result.current);
      });
      expect(store.getState().session.promptIndex).toBe(to);
    },
  );

  it.each<[string, (navigation: Navigation) => Promise<unknown>, number]>([
    ['forward', (navigation) => navigation.moveForward(), 0],
    ['back', (navigation) => navigation.moveBackward(), 1],
  ])(
    'stays on the prompt, going %s, when an answer the stage begins storing as it moves on is refused',
    async (_direction, navigate, from) => {
      const { result, store } = renderTrackingWrites(twoPrompts());
      act(() => {
        store.dispatch(updatePrompt(from));
        result.current.registerBeforeNext(() => {
          store.dispatch(updateEgo.pending('w1', declined));
          return true;
        });
      });

      let moving: Promise<unknown> = Promise.resolve();
      act(() => {
        moving = navigate(result.current);
      });
      await queuedWorkRuns();
      await act(async () => {
        store.dispatch(
          updateEgo.rejected(new Error('refused'), 'w1', declined),
        );
        await moving;
      });

      expect(store.getState().session.promptIndex).toBe(from);
    },
  );

  it.each<[string, (navigation: Navigation) => Promise<unknown>]>([
    ['forward', (navigation) => navigation.moveForward()],
    ['back', (navigation) => navigation.moveBackward()],
  ])(
    'takes no step within the stage, going %s, until an answer still being stored is stored, and none when it is refused',
    async (_direction, navigate) => {
      const { result, store } = renderTrackingWrites(makeStages(3), 1);
      // A stage that moves between its own steps, as the map moves from one
      // person to the next.
      const steps: string[] = [];
      act(() => {
        result.current.registerBeforeNext((direction) => {
          steps.push(direction);
          return false;
        });
      });
      store.dispatch(updateEgo.pending('w1', declined));
      store.dispatch(updateEgo.pending('w2', declined));

      let moving: Promise<unknown> = Promise.resolve();
      act(() => {
        moving = navigate(result.current);
      });
      await queuedWorkRuns();
      expect(steps).toEqual([]);

      await act(async () => {
        store.dispatch(updateEgo.fulfilled(declined, 'w1', declined));
        store.dispatch(
          updateEgo.rejected(new Error('refused'), 'w2', declined),
        );
        await moving;
      });
      expect(steps).toEqual([]);

      await act(async () => {
        await navigate(result.current);
      });
      expect(steps).toHaveLength(1);
    },
  );
});
