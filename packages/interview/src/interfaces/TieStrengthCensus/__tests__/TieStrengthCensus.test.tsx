import { configureStore } from '@reduxjs/toolkit';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import {
  asEntityAttributeReference,
  type LocaleTag,
  type LocalizationDeclaration,
  type LocalizedString,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
} from '@codaco/shared-consts';
import { withAnimationsEnabled } from '@codaco/vitest-config/modern/with-animations-enabled';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataContext } from '../../../contexts/StageMetadataContext';
import { StageDynamicValues } from '../../../dynamicValues/DynamicValueScope';
import protocol from '../../../store/modules/protocol';
import session from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import type { RegisterBeforeNext, StageProps } from '../../../types';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import TieStrengthCensus from '../TieStrengthCensus';

const NODE_TYPE = 'person';
const EDGE_TYPE = 'friendship';
const EDGE_VAR = 'strength';

const stage: StageProps<'TieStrengthCensus'>['stage'] = {
  id: 'tsc1',
  type: 'TieStrengthCensus',
  label: { en: 'Tie Strength' },
  subject: { entity: 'node', type: NODE_TYPE },
  prompts: [
    {
      id: 'p1',
      text: { en: 'How strong is the tie?' },
      createEdge: EDGE_TYPE,
      edgeVariable: asEntityAttributeReference(EDGE_VAR),
      negativeLabel: { en: 'No tie' },
    },
  ],
};

type OptionDef = { label: LocalizedString; value: string | number | boolean };

const makeCodebook = (
  options: OptionDef[] = [
    { label: { en: 'Weak' }, value: 1 },
    { label: { en: 'Strong' }, value: 2 },
  ],
) => ({
  node: {
    [NODE_TYPE]: {
      name: 'Person',
      label: { en: 'Person' },
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {},
    },
  },
  edge: {
    [EDGE_TYPE]: {
      name: 'Friendship',
      label: { en: 'Friendship' },
      color: 'edge-color-seq-1',
      variables: {
        [EDGE_VAR]: {
          name: EDGE_VAR,
          label: 'Strength',
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

const ENGLISH_ONLY: LocalizationDeclaration = {
  defaultLocale: 'en',
  locales: ['en'],
};

type LocaleSetup = {
  localization?: LocalizationDeclaration;
  locale?: LocaleTag | null;
  stage?: StageProps<'TieStrengthCensus'>['stage'];
  nodes?: ReturnType<typeof makeNodes>;
};

function renderInterface(
  edges: NcEdge[] = [],
  codebookOverride: ReturnType<typeof makeCodebook> = codebook,
  skipAnimations = false,
  {
    localization = ENGLISH_ONLY,
    locale = null,
    stage: stageUnderTest = stage,
    nodes = makeNodes(),
  }: LocaleSetup = {},
) {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        network: {
          nodes,
          edges,
          ego: { [entityAttributesProperty]: {} },
        },
      } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 9,
        localization,
        codebook: codebookOverride,
        stages: [stageUnderTest],
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });

  const registerBeforeNext: RegisterBeforeNext = () => undefined;

  const moveForward = vi.fn();
  const props: StageProps<'TieStrengthCensus'> = {
    stage: stageUnderTest,
    getNavigationHelpers: () => ({ moveForward, moveBackward: vi.fn() }),
  };

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <TestProtocolLocalization localization={localization} locale={locale}>
        <Provider store={store}>
          <MotionConfig reducedMotion="never" skipAnimations={skipAnimations}>
            <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
              <StageMetadataContext.Provider value={registerBeforeNext}>
                <StageDynamicValues stage={stageUnderTest}>
                  {children}
                </StageDynamicValues>
              </StageMetadataContext.Provider>
            </CurrentStepProvider>
          </MotionConfig>
        </Provider>
      </TestProtocolLocalization>
    );
  }

  render(<TieStrengthCensus {...props} />, { wrapper: Wrapper });

  const waitForFirstPair = async () => {
    await waitFor(() =>
      expect(screen.getAllByRole('option').length).toBeGreaterThan(0),
    );
  };

  return { store, waitForFirstPair, moveForward };
}

describe('TieStrengthCensus interface', () => {
  it('opens directly on the first pair', async () => {
    const { waitForFirstPair } = renderInterface();
    await waitForFirstPair();
    expect(screen.getByText('How strong is the tie?')).toBeTruthy();
  });

  it('creates an edge with the prompt edgeVariable when an option is chosen', async () => {
    const { store, waitForFirstPair } = renderInterface();
    await waitForFirstPair();

    fireEvent.click(screen.getByRole('option', { name: 'Strong' }));

    await waitFor(() =>
      expect(store.getState().session.network.edges).toHaveLength(1),
    );
    const edge = store.getState().session.network.edges[0];
    expect(edge?.type).toBe(EDGE_TYPE);
    expect(edge?.[entityAttributesProperty]?.[EDGE_VAR]).toBe(2);
  });

  it('records a negative answer in stage metadata without creating an edge', async () => {
    const { store, waitForFirstPair } = renderInterface();
    await waitForFirstPair();

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

  it('waits for the selection animation before advancing normally', async () => {
    await withAnimationsEnabled(async () => {
      const { waitForFirstPair, moveForward } = renderInterface();
      await waitForFirstPair();

      fireEvent.click(screen.getByRole('option', { name: 'No tie' }));

      expect(moveForward).not.toHaveBeenCalled();
      await waitFor(() => expect(moveForward).toHaveBeenCalledOnce());
    });
  });

  it('advances immediately when animations are disabled', async () => {
    const { waitForFirstPair, moveForward } = renderInterface(
      [],
      codebook,
      true,
    );
    await waitForFirstPair();

    fireEvent.click(screen.getByRole('option', { name: 'No tie' }));

    expect(moveForward).toHaveBeenCalledOnce();
  });

  it('does not treat a sibling-type edge without this edgeVariable as answered', async () => {
    const siblingEdge = {
      [entityPrimaryKeyProperty]: 'e1',
      type: EDGE_TYPE,
      from: 'n1',
      to: 'n2',
      [entityAttributesProperty]: {},
    } as unknown as NcEdge;

    const { waitForFirstPair } = renderInterface([siblingEdge]);
    await waitForFirstPair();

    // No option should be pre-selected: the edge exists but this prompt's
    // edgeVariable is unset, so the prompt is unanswered.
    for (const option of screen.getAllByRole('option')) {
      expect(option.getAttribute('aria-selected')).not.toBe('true');
    }
  });

  describe("when an ordinal option's value is the literal '__none__'", () => {
    const noneCodebook = makeCodebook([
      { label: { en: 'Real none' }, value: '__none__' },
      { label: { en: 'Strong' }, value: 'strong' },
    ]);

    it('renders distinct cards for the real option and the decline option', async () => {
      const { waitForFirstPair } = renderInterface([], noneCodebook);
      await waitForFirstPair();

      // Both the real '__none__' option and the decline option must render as
      // their own cards. A collision on the React key would drop one of them.
      expect(screen.getByRole('option', { name: 'Real none' })).toBeTruthy();
      expect(screen.getByRole('option', { name: 'No tie' })).toBeTruthy();
      // Real options (2) + decline card (1) = 3.
      expect(screen.getAllByRole('option')).toHaveLength(3);
    });

    it("records the real '__none__' option as the edge value (not decline)", async () => {
      const { store, waitForFirstPair } = renderInterface([], noneCodebook);
      await waitForFirstPair();

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
      const { store, waitForFirstPair } = renderInterface([], noneCodebook);
      await waitForFirstPair();

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

describe('TieStrengthCensus option labels', () => {
  const bilingual: LocalizationDeclaration = {
    defaultLocale: 'en',
    locales: ['en', 'ar'],
  };
  const arabicCodebook = makeCodebook([
    { label: { en: 'Weak', ar: 'ضعيفة' }, value: 1 },
    // No Arabic translation: the participant sees the default.
    { label: { en: 'Strong' }, value: 2 },
  ]);

  // The interview sets one language for everything it renders, so an option
  // names none of its own, nor does any wrapper between it and the stage.
  const marksOwnLanguage = (optionName: string) =>
    within(screen.getByRole('option', { name: optionName }))
      .getByText(optionName)
      .closest('[lang], [dir]') !== null;

  it('renders each option in the interview locale or the default, with no language of its own', async () => {
    const { waitForFirstPair } = renderInterface([], arabicCodebook, false, {
      localization: bilingual,
      locale: 'ar',
    });
    await waitForFirstPair();

    expect(marksOwnLanguage('ضعيفة')).toBe(false);
    expect(marksOwnLanguage('Strong')).toBe(false);
  });
});

describe('TieStrengthCensus dynamic values', () => {
  it('names the pair on screen in the decline label', async () => {
    const [first, second] = makeNodes();
    renderInterface([], codebook, false, {
      stage: {
        ...stage,
        dynamicValues: {
          first: { path: 'dyad.source.name' },
          second: { path: 'dyad.target.name' },
        },
        prompts: stage.prompts.map((prompt) => ({
          ...prompt,
          negativeLabel: {
            en: '{first, select, missing {Not close} other {{first} and {second} are not close}}',
          },
        })),
      } as StageProps<'TieStrengthCensus'>['stage'],
      nodes: [
        { ...first!, [entityAttributesProperty]: { name: 'Ada' } },
        { ...second!, [entityAttributesProperty]: { name: 'Grace' } },
      ],
    });

    expect(
      await screen.findByRole('option', {
        name: 'Ada and Grace are not close',
      }),
    ).toBeInTheDocument();
  });

  it('names each node of the pair by the label it shows', async () => {
    const [first, second] = makeNodes();
    renderInterface([], codebook, false, {
      stage: {
        ...stage,
        dynamicValues: {
          first: { path: 'dyad.source.$label' },
          second: { path: 'dyad.target.$label' },
        },
        prompts: stage.prompts.map((prompt) => ({
          ...prompt,
          negativeLabel: { en: '{first} and {second} are not close' },
        })),
      } as StageProps<'TieStrengthCensus'>['stage'],
      // The second has no name, so it shows its type's.
      nodes: [
        { ...first!, [entityAttributesProperty]: { name: 'Ada' } },
        second!,
      ],
    });

    expect(
      await screen.findByRole('option', {
        name: 'Ada and Person are not close',
      }),
    ).toBeInTheDocument();
  });
});
