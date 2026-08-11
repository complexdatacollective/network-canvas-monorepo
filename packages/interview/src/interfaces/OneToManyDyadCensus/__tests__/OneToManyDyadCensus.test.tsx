import { configureStore } from '@reduxjs/toolkit';
import { render, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
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
import OneToManyDyadCensus from '../OneToManyDyadCensus';

const NODE_TYPE = 'person';
const EDGE_TYPE = 'friendship';
const NAME_VAR = 'name';

const stage = {
  id: 'otm1',
  type: 'OneToManyDyadCensus',
  label: 'One to Many',
  subject: { entity: 'node', type: NODE_TYPE },
  behaviours: { removeAfterConsideration: false },
  prompts: [
    {
      id: 'p1',
      text: 'Prompt one',
      createEdge: EDGE_TYPE,
    },
    {
      id: 'p2',
      text: 'Prompt two',
      createEdge: EDGE_TYPE,
    },
  ],
};

const codebook = {
  node: {
    [NODE_TYPE]: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        [NAME_VAR]: { name: 'name', type: 'text' },
      },
    },
  },
  edge: {
    [EDGE_TYPE]: {
      name: 'Friendship',
      color: 'edge-color-seq-1',
      variables: {},
    },
  },
  ego: { variables: {} },
};

const NODE_NAMES = ['Alice', 'Bob', 'Carol'];

const makeNodes = () =>
  NODE_NAMES.map((name, index) => ({
    [entityPrimaryKeyProperty]: `n${index + 1}`,
    type: NODE_TYPE,
    [entityAttributesProperty]: { [NAME_VAR]: name },
  }));

function renderInterface(edges: NcEdge[] = []) {
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

  let beforeNext: BeforeNextFunction | null = null;
  const registerBeforeNext: RegisterBeforeNext = (
    keyOrFn: string | BeforeNextFunction | null,
    maybeFn?: BeforeNextFunction | null,
  ) => {
    beforeNext = typeof keyOrFn === 'string' ? (maybeFn ?? null) : keyOrFn;
  };

  const props: StageProps<'OneToManyDyadCensus'> = {
    stage: stage as StageProps<'OneToManyDyadCensus'>['stage'],
    getNavigationHelpers: () => ({
      moveForward: vi.fn(),
      moveBackward: vi.fn(),
    }),
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

  const { container } = render(<OneToManyDyadCensus {...props} />, {
    wrapper: Wrapper,
  });

  // The focal (source) node is rendered with className="z-10", distinguishing
  // it from the target nodes in the list.
  const getFocalLabel = () =>
    container.querySelector('button.z-10')?.getAttribute('aria-label') ?? null;

  // Drives the stage's registered beforeNext handler. When it returns true the
  // stage allows real navigation, which we simulate by dispatching updatePrompt
  // (mirroring useInterviewNavigation's prompt change on a prompt boundary).
  const navigate = async (direction: 'forwards' | 'backwards') => {
    let allowed = false;
    await act(async () => {
      allowed = (await beforeNext?.(direction, 'step')) === true;
    });
    if (allowed) {
      const current = store.getState().session?.promptIndex ?? 0;
      const next = direction === 'forwards' ? current + 1 : current - 1;
      await act(async () => {
        store.dispatch(updatePrompt(next));
      });
    }
    return allowed;
  };

  return { store, container, getFocalLabel, navigate };
}

describe('OneToManyDyadCensus backward navigation across prompts', () => {
  it('lands on the LAST focal node of the previous prompt when navigating back across the prompt boundary', async () => {
    const { store, getFocalLabel, navigate } = renderInterface();

    // Prompt 0 starts on the first focal node.
    await waitFor(() => expect(getFocalLabel()).toBe('Alice'));

    // Advance through every focal node of prompt 0 (3 nodes => steps 0,1,2).
    expect(await navigate('forwards')).toBe(false); // 0 -> 1
    await waitFor(() => expect(getFocalLabel()).toBe('Bob'));

    expect(await navigate('forwards')).toBe(false); // 1 -> 2
    await waitFor(() => expect(getFocalLabel()).toBe('Carol'));

    // On the last focal node, forwards crosses the prompt boundary.
    expect(await navigate('forwards')).toBe(true); // prompt 0 -> prompt 1
    expect(store.getState().session.promptIndex).toBe(1);

    // Prompt 1 begins on its first focal node.
    await waitFor(() => expect(getFocalLabel()).toBe('Alice'));

    // On the first focal node of prompt 1, Back crosses back to prompt 0.
    expect(await navigate('backwards')).toBe(true); // prompt 1 -> prompt 0
    expect(store.getState().session.promptIndex).toBe(0);

    // Regression (#668): must land on the LAST focal node of prompt 0 (Carol),
    // not the first (Alice).
    await waitFor(() => expect(getFocalLabel()).toBe('Carol'));
  });

  it('preserves edges created earlier when navigating back across the prompt boundary', async () => {
    const existingEdge = {
      [entityPrimaryKeyProperty]: 'e1',
      type: EDGE_TYPE,
      from: 'n1',
      to: 'n2',
      [entityAttributesProperty]: {},
    } as unknown as NcEdge;

    const { store, navigate } = renderInterface([existingEdge]);

    await navigate('forwards');
    await navigate('forwards');
    await navigate('forwards'); // cross into prompt 1
    await navigate('backwards'); // cross back to prompt 0

    expect(store.getState().session.network.edges).toHaveLength(1);
    expect(
      store.getState().session.network.edges[0]?.[entityPrimaryKeyProperty],
    ).toBe('e1');
  });
});
