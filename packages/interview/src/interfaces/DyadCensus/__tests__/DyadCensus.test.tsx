import { configureStore } from '@reduxjs/toolkit';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataContext } from '../../../contexts/StageMetadataContext';
import protocol from '../../../store/modules/protocol';
import session, { updatePrompt } from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import type {
  BeforeNextFunction,
  RegisterBeforeNext,
  StageProps,
} from '../../../types';
import DyadCensus from '../DyadCensus';

const NODE_TYPE = 'person';
const EDGE_TYPE = 'friend';

const twoPromptStage = {
  id: 'dc1',
  type: 'DyadCensus',
  label: 'Dyad Census',
  subject: { entity: 'node', type: NODE_TYPE },
  introductionPanel: { title: 'Welcome', text: 'Intro copy' },
  prompts: [
    { id: 'p1', text: 'Are they friends (q1)?', createEdge: EDGE_TYPE },
    { id: 'p2', text: 'Are they friends (q2)?', createEdge: EDGE_TYPE },
  ],
};

const onePromptStage = {
  id: 'dc1',
  type: 'DyadCensus',
  label: 'Dyad Census',
  subject: { entity: 'node', type: NODE_TYPE },
  introductionPanel: { title: 'Welcome', text: 'Intro copy' },
  prompts: [{ id: 'p1', text: 'Are they friends?', createEdge: EDGE_TYPE }],
};

const codebook = {
  node: {
    [NODE_TYPE]: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {},
    },
  },
  edge: {
    [EDGE_TYPE]: {
      name: 'Friend',
      color: 'edge-color-seq-1',
      variables: {},
    },
  },
  ego: { variables: {} },
};

const makeNodes = () => [
  {
    [entityPrimaryKeyProperty]: 'n1',
    type: NODE_TYPE,
    [entityAttributesProperty]: {},
  },
  {
    [entityPrimaryKeyProperty]: 'n2',
    type: NODE_TYPE,
    [entityAttributesProperty]: {},
  },
];

function renderInterface(
  stage: typeof twoPromptStage | typeof onePromptStage,
  edges: NcEdge[] = [],
) {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        network: {
          nodes: makeNodes(),
          edges,
          ego: { [entityAttributesProperty]: {} },
        },
      } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 8,
        codebook,
        stages: [stage],
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });

  // Capture every registered beforeNext handler by key. The stage registers
  // two: 'stageValidation' (from useStageValidation) and a useId() key (from
  // useBeforeNext for navigation). The test needs the validation handler to
  // assert readiness, and the navigation handler to advance past the intro.
  const handlers = new Map<string, BeforeNextFunction>();
  const registerBeforeNext: RegisterBeforeNext = (
    keyOrFn: string | BeforeNextFunction | null,
    maybeFn?: BeforeNextFunction | null,
  ) => {
    const key = typeof keyOrFn === 'string' ? keyOrFn : '__default__';
    const fn = typeof keyOrFn === 'string' ? (maybeFn ?? null) : keyOrFn;
    if (fn === null) {
      handlers.delete(key);
    } else {
      handlers.set(key, fn);
    }
  };

  const runValidation = async (
    direction: 'forwards' | 'backwards',
    intent: 'step' | 'jump' = 'step',
  ) => {
    let result: boolean | 'FORCE' | undefined;
    await act(async () => {
      result = await handlers.get('stageValidation')?.(direction, intent);
    });
    return result;
  };

  const runNavigation = async (direction: 'forwards' | 'backwards') => {
    await act(async () => {
      for (const [key, fn] of handlers) {
        if (key === 'stageValidation') continue;
        await fn(direction, 'step');
      }
    });
  };

  const moveForward = vi.fn();
  const props: StageProps<'DyadCensus'> = {
    stage: stage as StageProps<'DyadCensus'>['stage'],
    getNavigationHelpers: () => ({ moveForward, moveBackward: vi.fn() }),
  };

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
          <StageMetadataContext.Provider value={registerBeforeNext}>
            {children}
          </StageMetadataContext.Provider>
        </CurrentStepProvider>
      </Provider>
    );
  }

  render(<DyadCensus {...props} />, { wrapper: Wrapper });

  const advancePastIntro = async () => {
    await runNavigation('forwards');
    await waitFor(() =>
      expect(screen.getAllByRole('radio').length).toBeGreaterThan(0),
    );
  };

  const yesButton = () => screen.getByRole('radio', { name: 'Yes' });
  const noButton = () => screen.getByRole('radio', { name: 'No' });

  return {
    store,
    advancePastIntro,
    runValidation,
    yesButton,
    noButton,
  };
}

describe('DyadCensus interface', () => {
  it('blocks stepping forwards on an unanswered pair but allows a direct jump', async () => {
    const { advancePastIntro, runValidation } = renderInterface(onePromptStage);
    await advancePastIntro();

    expect(await runValidation('forwards')).toBe(false);
    expect(await runValidation('forwards', 'jump')).toBe(true);
  });

  it('reflects a shared-graph edge on a later prompt but still requires a per-prompt answer', async () => {
    const { store, advancePastIntro, runValidation, yesButton } =
      renderInterface(twoPromptStage);
    await advancePastIntro();

    // Answer 'Yes' on prompt 0 for (n1, n2): creates the shared 'friend' edge.
    fireEvent.click(yesButton());
    await waitFor(() =>
      expect(store.getState().session.network.edges).toHaveLength(1),
    );

    // Move to prompt 1 (same pair, same createEdge) the way the orchestrator
    // does. The edge still exists on the shared graph.
    act(() => {
      store.dispatch(updatePrompt(1));
    });

    // (a) the network is the single source of truth: prompt 1 reflects the
    // shared edge by pre-selecting 'Yes'.
    await waitFor(() =>
      expect(yesButton().getAttribute('aria-checked')).toBe('true'),
    );

    // (b) but answered-state is scoped per prompt: prompt 1 has no per-prompt
    // record, so forward validation is still blocked until the participant
    // clicks through.
    expect(await runValidation('forwards')).toBe(false);
  });

  it('records a per-prompt negative answer in stage metadata', async () => {
    const { store, advancePastIntro, noButton } =
      renderInterface(onePromptStage);
    await advancePastIntro();

    fireEvent.click(noButton());

    await waitFor(() =>
      expect(store.getState().session.stageMetadata?.[0]).toBeTruthy(),
    );
    expect(store.getState().session.network.edges).toHaveLength(0);
    expect(store.getState().session.stageMetadata?.[0]).toContainEqual([
      0,
      'n1',
      'n2',
      false,
    ]);
  });

  it('does not append a duplicate edge when Yes is selected on an existing edge', async () => {
    const { store, advancePastIntro, yesButton } =
      renderInterface(onePromptStage);
    await advancePastIntro();

    fireEvent.click(yesButton());
    await waitFor(() =>
      expect(store.getState().session.network.edges).toHaveLength(1),
    );

    // Re-select 'Yes' (simulates a double-tap before auto-advance). This must
    // be a no-op on the shared graph: still exactly one 'friend' edge.
    fireEvent.click(yesButton());

    await act(async () => {
      await Promise.resolve();
    });

    expect(store.getState().session.network.edges).toHaveLength(1);
  });
});
