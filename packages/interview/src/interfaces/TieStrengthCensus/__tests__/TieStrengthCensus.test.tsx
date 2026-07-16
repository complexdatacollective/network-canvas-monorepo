import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import session from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import type {
  BeforeNextFunction,
  RegisterBeforeNext,
  StageProps,
} from '../../../types';
import TieStrengthCensus from '../TieStrengthCensus';

const NODE_TYPE = 'person';
const EDGE_TYPE = 'friendship';
const EDGE_VAR = 'strength';

const stage = {
  id: 'tsc1',
  type: 'TieStrengthCensus',
  label: 'Tie Strength',
  subject: { entity: 'node', type: NODE_TYPE },
  introductionPanel: { title: 'Welcome', text: 'Intro copy' },
  prompts: [
    {
      id: 'p1',
      text: 'How strong is the tie?',
      createEdge: EDGE_TYPE,
      edgeVariable: EDGE_VAR,
      negativeLabel: 'No tie',
    },
  ],
};

type OptionDef = { label: string; value: string | number | boolean };

const makeCodebook = (
  options: OptionDef[] = [
    { label: 'Weak', value: 1 },
    { label: 'Strong', value: 2 },
  ],
) => ({
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
      name: 'Friendship',
      color: 'edge-color-seq-1',
      variables: {
        [EDGE_VAR]: {
          name: EDGE_VAR,
          type: 'ordinal',
          component: 'RadioGroup',
          options,
        },
      },
    },
  },
  ego: { variables: {} },
});

const codebook = makeCodebook();

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
  edges: NcEdge[] = [],
  codebookOverride: ReturnType<typeof makeCodebook> = codebook,
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
        codebook: codebookOverride,
        stages: [stage],
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });

  // Capture the stage's registered beforeNext handler so the test can advance
  // past the introduction panel (its visibility is internal stage state).
  let beforeNext: BeforeNextFunction | null = null;
  const registerBeforeNext: RegisterBeforeNext = (
    keyOrFn: string | BeforeNextFunction | null,
    maybeFn?: BeforeNextFunction | null,
  ) => {
    beforeNext = typeof keyOrFn === 'string' ? (maybeFn ?? null) : keyOrFn;
  };

  const moveForward = vi.fn();
  const props: StageProps<'TieStrengthCensus'> = {
    stage: stage as StageProps<'TieStrengthCensus'>['stage'],
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

  render(<TieStrengthCensus {...props} />, { wrapper: Wrapper });

  const advancePastIntro = async () => {
    await act(async () => {
      await beforeNext?.('forwards');
    });
    await waitFor(() =>
      expect(screen.getAllByRole('option').length).toBeGreaterThan(0),
    );
  };

  return { store, advancePastIntro };
}

describe('TieStrengthCensus interface', () => {
  it('shows the introduction panel before the census begins', () => {
    renderInterface();
    expect(screen.getByText('Intro copy')).toBeTruthy();
  });

  it('creates an edge with the prompt edgeVariable when an option is chosen', async () => {
    const { store, advancePastIntro } = renderInterface();
    await advancePastIntro();

    fireEvent.click(screen.getByRole('option', { name: 'Strong' }));

    await waitFor(() =>
      expect(store.getState().session.network.edges).toHaveLength(1),
    );
    const edge = store.getState().session.network.edges[0];
    expect(edge?.type).toBe(EDGE_TYPE);
    expect(edge?.[entityAttributesProperty]?.[EDGE_VAR]).toBe(2);
  });

  it('records a negative answer in stage metadata without creating an edge', async () => {
    const { store, advancePastIntro } = renderInterface();
    await advancePastIntro();

    fireEvent.click(screen.getByRole('option', { name: 'No tie' }));

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

  it('does not treat a sibling-type edge without this edgeVariable as answered', async () => {
    const siblingEdge = {
      [entityPrimaryKeyProperty]: 'e1',
      type: EDGE_TYPE,
      from: 'n1',
      to: 'n2',
      [entityAttributesProperty]: {},
    } as unknown as NcEdge;

    const { advancePastIntro } = renderInterface([siblingEdge]);
    await advancePastIntro();

    // No option should be pre-selected: the edge exists but this prompt's
    // edgeVariable is unset, so the prompt is unanswered.
    for (const option of screen.getAllByRole('option')) {
      expect(option.getAttribute('aria-selected')).not.toBe('true');
    }
  });

  describe("when an ordinal option's value is the literal '__none__'", () => {
    const noneCodebook = makeCodebook([
      { label: 'Real none', value: '__none__' },
      { label: 'Strong', value: 'strong' },
    ]);

    it('renders distinct cards for the real option and the decline option', async () => {
      const { advancePastIntro } = renderInterface([], noneCodebook);
      await advancePastIntro();

      // Both the real '__none__' option and the decline option must render as
      // their own cards. A collision on the React key would drop one of them.
      expect(screen.getByRole('option', { name: 'Real none' })).toBeTruthy();
      expect(screen.getByRole('option', { name: 'No tie' })).toBeTruthy();
      // Real options (2) + decline card (1) = 3.
      expect(screen.getAllByRole('option')).toHaveLength(3);
    });

    it("records the real '__none__' option as the edge value (not decline)", async () => {
      const { store, advancePastIntro } = renderInterface([], noneCodebook);
      await advancePastIntro();

      fireEvent.click(screen.getByRole('option', { name: 'Real none' }));

      await waitFor(() =>
        expect(store.getState().session.network.edges).toHaveLength(1),
      );
      const edge = store.getState().session.network.edges[0];
      expect(edge?.type).toBe(EDGE_TYPE);
      expect(edge?.[entityAttributesProperty]?.[EDGE_VAR]).toBe('__none__');
      // The decline path records a stage-metadata entry; choosing the real
      // option must NOT take that path.
      expect(store.getState().session.stageMetadata?.[0]).toBeFalsy();
    });

    it('still declines when the decline card is chosen', async () => {
      const { store, advancePastIntro } = renderInterface([], noneCodebook);
      await advancePastIntro();

      fireEvent.click(screen.getByRole('option', { name: 'No tie' }));

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
  });
});
