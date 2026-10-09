import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  asEntityAttributeReference,
  type FramingId,
  type LocalizationDeclaration,
  type PedigreeRelationshipKind,
  type PedigreeSexAssignedAtBirth,
  familyPedigreeWordingIn,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcEncryptionHeader,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import protocol from '../../../store/modules/protocol';
import session from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import type { StageProps } from '../../../types';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import { encryptionFor } from '../../Anonymisation/__tests__/encryptionFixtures';
import { installEncryptionKey } from '../../Anonymisation/unlockEncryption';
import { encryptedPerson } from '../../FamilyPedigree/__tests__/fixtures';
import { narrativePedigreeWords } from './narrativePedigreeWords';

const exportSnapshotMock =
  vi.fn<(element: HTMLElement, filename: string) => Promise<void>>();
exportSnapshotMock.mockResolvedValue(undefined);
vi.mock('../export/snapshot', () => ({
  exportSnapshot: (element: HTMLElement, filename: string) =>
    exportSnapshotMock(element, filename),
}));

// Every family tree the view lays out, as it was asked to lay it out: the
// real layout, recorded on the way through.
type LayoutProps = {
  nodeIds: readonly string[];
  nodeShapes?: ReadonlyMap<string, string>;
};
const layoutsDrawn = vi.hoisted(
  () => [] as { instance: string; props: LayoutProps }[],
);
vi.mock(
  '../../FamilyPedigree/pedigree-layout/components/PedigreeLayout',
  async (importActual) => {
    const { createElement, useId } = await import('react');
    const actual =
      await importActual<
        typeof import('../../FamilyPedigree/pedigree-layout/components/PedigreeLayout')
      >();
    const Recorded = (
      props: Parameters<typeof actual.default>[0] & LayoutProps,
    ) => {
      // Which layout drew it: the canvas's, or the snapshot's.
      const instance = useId();
      layoutsDrawn.push({ instance, props });
      return createElement(actual.default, props);
    };
    return { default: Recorded };
  },
);

import NarrativePedigreeView, {
  resolveDiseaseColor,
} from '../components/NarrativePedigreeView';

// jsdom lacks ResizeObserver, which fresco-ui layout primitives observe.
// The stub immediately reports a fixed content size so the off-screen node
// measurement (useNodeMeasurement) yields a non-zero size and PedigreeLayout
// lays nodes out instead of rendering its loading spinner.
const MEASURED_SIZE = 96;
class StubResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: { width: MEASURED_SIZE, height: MEASURED_SIZE },
        } as unknown as ResizeObserverEntry,
      ],
      this,
    );
  }
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  // jsdom lacks pointer capture, which the canvas's drag-to-pan takes on
  // every press.
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  // jsdom's getBoundingClientRect returns all-zeros; give the measurement node
  // a real size so the initial synchronous measurement is also non-zero.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    width: MEASURED_SIZE,
    height: MEASURED_SIZE,
    top: 0,
    left: 0,
    bottom: MEASURED_SIZE,
    right: MEASURED_SIZE,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  exportSnapshotMock.mockClear();
});

// --- The Family Pedigree's configuration, as the source stage records it ---
const NODE_TYPE = 'person';
const EDGE_TYPE = 'family';
const NAME_VAR = 'name';
const EGO_VAR = 'isEgo';
const SEX_VAR = 'sex';
const KIND_VAR = 'kind';
const CARRIER_VAR = 'carrier';
const CURRENT_VAR = 'current';
const DISEASE_A_VAR = 'diseaseA';
const DISEASE_B_VAR = 'diseaseB';

const SOURCE_STAGE_ID = 'source-fp';

type Attrs = Record<string, VariableValue>;

function person(
  id: string,
  sex: PedigreeSexAssignedAtBirth | undefined,
  attributes: Attrs = {},
): NcNode {
  return {
    [entityPrimaryKeyProperty]: id,
    type: NODE_TYPE,
    [entityAttributesProperty]: {
      ...(sex ? { [SEX_VAR]: [sex] } : {}),
      ...attributes,
    },
  };
}

function link(
  from: string,
  to: string,
  kind: PedigreeRelationshipKind = 'biological',
  attributes: Attrs = {},
): NcEdge {
  return {
    [entityPrimaryKeyProperty]: `${from}->${to}-${kind}`,
    type: EDGE_TYPE,
    from,
    to,
    [entityAttributesProperty]: {
      [KIND_VAR]: [kind],
      ...(kind === 'partner' ? { [CURRENT_VAR]: true } : {}),
      ...attributes,
    },
  };
}

/** A tie of another type, as a sociogram on another stage might draw. */
function friendship(from: string, to: string): NcEdge {
  return {
    [entityPrimaryKeyProperty]: `${from}->${to}-friend`,
    type: 'friendship',
    from,
    to,
    [entityAttributesProperty]: {},
  };
}

/**
 * Fixture pedigree:
 *   mother (affected disease A) --- father
 *                 |
 *                ego --- partner
 *                     |
 *                   child
 * and a colleague of the same type, added on another stage and tied to the
 * participant only by a friendship: not family.
 */
const nodes: NcNode[] = [
  person('mother', 'female', { [NAME_VAR]: 'Mother', [DISEASE_A_VAR]: true }),
  person('father', 'male', { [NAME_VAR]: 'Father' }),
  person('ego', 'male', { [NAME_VAR]: 'Ego', [EGO_VAR]: true }),
  person('partner', 'female', { [NAME_VAR]: 'Partner' }),
  person('child', 'female', { [NAME_VAR]: 'Child' }),
  person('colleague', 'female', { [NAME_VAR]: 'Colleague' }),
];

const edges: NcEdge[] = [
  link('mother', 'father', 'partner'),
  link('mother', 'ego'),
  link('father', 'ego'),
  link('ego', 'partner', 'partner'),
  link('ego', 'child'),
  link('partner', 'child'),
  friendship('ego', 'colleague'),
];

const sourceStage = {
  id: SOURCE_STAGE_ID,
  type: 'FamilyPedigree' as const,
  wording: familyPedigreeWordingIn(['en', 'es']),
  label: { en: 'Family Pedigree' },
  subject: { entity: 'node' as const, type: NODE_TYPE },
  prompt: { en: 'Build your pedigree.' },
  nodeConfiguration: {
    nameAttribute: NAME_VAR,
    sexAssignedAtBirthAttribute: SEX_VAR,
    egoAttribute: EGO_VAR,
  },
  edgeConfiguration: {
    type: EDGE_TYPE,
    kindAttribute: KIND_VAR,
    gestationalCarrierAttribute: CARRIER_VAR,
    currentPartnerAttribute: CURRENT_VAR,
  },
};

type NarrativeStage = StageProps<'NarrativePedigree'>['stage'];
type SourceFraming = StageProps<'FamilyPedigree'>['stage']['framing'];

function makeNarrativeStage(): NarrativeStage {
  return {
    id: 'np-1',
    type: 'NarrativePedigree',
    label: { en: 'Disease Pedigree' },
    sourceStageId: SOURCE_STAGE_ID,
    showAtRiskStatuses: false,
    ...narrativePedigreeWords(),
    diseases: [
      {
        id: 'da',
        label: { en: 'Disease A' },
        color: 'node-color-seq-1',
        attribute: asEntityAttributeReference(DISEASE_A_VAR),
        inheritancePattern: 'autosomalDominant',
      },
      {
        id: 'db',
        label: { en: 'Disease B' },
        color: 'node-color-seq-5',
        attribute: asEntityAttributeReference(DISEASE_B_VAR),
        inheritancePattern: 'autosomalRecessive',
      },
    ],
  };
}

function makeCodebook(encryptNames = false) {
  return {
    node: {
      [NODE_TYPE]: {
        name: 'Person',
        label: { en: 'Person' },
        color: 'node-color-seq-1',
        shape: { default: 'square' },
        variables: encryptNames
          ? {
              [NAME_VAR]: {
                type: 'text',
                name: NAME_VAR,
                label: { en: 'Name' },
                encrypted: true,
              },
            }
          : {},
      },
    },
    edge: {
      [EDGE_TYPE]: {
        name: 'Family',
        label: { en: 'Family' },
        color: 'edge-color-seq-1',
      },
    },
    ego: { variables: {} },
  };
}

type StoreOptions = {
  narrativeStage?: NarrativeStage;
  sourceFraming?: SourceFraming;
  /** The framing the participant chose on the source stage. */
  chosenFraming?: FramingId;
  network?: { nodes: NcNode[]; edges: NcEdge[] };
  /**
   * Store names encrypted, in an interview protected by this header, with
   * the key of its passphrase in force once the passphrase has been entered.
   */
  encryption?: { header: NcEncryptionHeader; key?: CryptoKey };
};

function makeStore({
  narrativeStage = makeNarrativeStage(),
  sourceFraming,
  chosenFraming,
  network = { nodes, edges },
  encryption,
}: StoreOptions = {}) {
  const store = configureStore({
    reducer: { protocol, session, ui },
    preloadedState: {
      protocol: {
        localization: { defaultLocale: 'en', locales: ['en', 'es'] },
        codebook: makeCodebook(encryption !== undefined),
        stages: [{ ...sourceStage, framing: sourceFraming }, narrativeStage],
        assets: [],
      } as never,
      session: {
        id: 'test-session',
        network: {
          ...network,
          ego: { [entityAttributesProperty]: {} },
          ...(encryption ? { encryption: encryption.header } : {}),
        },
        stageMetadata: chosenFraming ? { 0: { framing: chosenFraming } } : {},
      } as never,
      ui: {
        FORM_IS_READY: false,
        encryptionKeyId: null,
        showPassphrasePrompter: false,
      },
    },
    middleware: (g) => g({ serializableCheck: false }),
  });
  if (encryption?.key) installEncryptionKey(store, encryption.key);
  return store;
}

const ENGLISH_AND_SPANISH: LocalizationDeclaration = {
  defaultLocale: 'en',
  locales: ['en', 'es'],
};

function renderView(options: StoreOptions = {}, locale = 'en') {
  const stage = options.narrativeStage ?? makeNarrativeStage();
  const store = makeStore({ ...options, narrativeStage: stage });

  // The participant's stated locale reaches the protocol's localization, so
  // the stage's own words resolve in it, as they do in the Shell.
  const view = (requestedLocale: string) => (
    <Provider store={store}>
      <CurrentStepProvider currentStep={1} onStepChange={() => undefined}>
        <TestProtocolLocalization
          localization={ENGLISH_AND_SPANISH}
          locale={requestedLocale}
        >
          <InterviewI18nProvider requestedLocale={requestedLocale}>
            <NarrativePedigreeView stage={stage} />
          </InterviewI18nProvider>
        </TestProtocolLocalization>
      </CurrentStepProvider>
    </Provider>
  );
  const rendered = render(view(locale));
  return {
    ...rendered,
    store,
    changeLocale: (requestedLocale: string) =>
      rendered.rerender(view(requestedLocale)),
  };
}

// Selects (or, when already selected, clears) a condition by clicking its row in
// the key's "Conditions" list.
async function selectCondition(name: string) {
  await userEvent.click(await screen.findByRole('button', { name }));
}

// The single-condition status symbol ([data-notation-status]) is queried inside
// the pedigree view; the ConditionPanel key also renders illustrative Sticker
// glyphs that a document-wide query would pick up.
function viewMarker(selector: string): Element | null {
  return (
    document
      .querySelector('[data-narrative-pedigree-view]')
      ?.querySelector(selector) ?? null
  );
}

function member(nodeId: string): HTMLElement {
  const el = document.querySelector(`[data-node-id="${nodeId}"]`);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`No pedigree member for "${nodeId}"`);
  }
  return el;
}

const memberIds = () =>
  Array.from(document.querySelectorAll('[data-pedigree-member]'))
    .map((el) => el.getAttribute('data-node-id') ?? '')
    .sort((a, b) => a.localeCompare(b));

const waitForFamily = () =>
  waitFor(() =>
    expect(document.querySelector('[data-pedigree-member]')).toBeTruthy(),
  );

/** The family with every name left blank, as the source stage saves it when
 * the participant names no one and labels have not yet been written. */
const unnamed = {
  nodes: nodes.map((node) => ({
    ...node,
    [entityAttributesProperty]: {
      ...node[entityAttributesProperty],
      [NAME_VAR]: '',
    },
  })),
  edges,
};

describe('NarrativePedigreeView — who is drawn', () => {
  it('draws the participant and everyone connected to them as family, and no one else', async () => {
    renderView();
    await waitForFamily();
    expect(memberIds()).toEqual([
      'child',
      'ego',
      'father',
      'mother',
      'partner',
    ]);
    expect(
      screen.queryByRole('button', { name: 'Focus on Colleague' }),
    ).not.toBeInTheDocument();
  });

  it('shows the participant as "You" and everyone else by name', async () => {
    renderView();
    expect(
      await screen.findByRole('button', { name: 'Focus on You' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Focus on Partner' }),
    ).toBeInTheDocument();
  });

  it('draws ended partnerships, donors and surrogates as part of the family', async () => {
    renderView({
      network: {
        nodes: [
          ...nodes,
          person('ex', 'female', { [NAME_VAR]: 'Ex' }),
          person('donor', 'male', { [NAME_VAR]: 'Donor' }),
          person('surrogate', 'female', { [NAME_VAR]: 'Surrogate' }),
          person('baby', 'unknown', { [NAME_VAR]: 'Baby' }),
        ],
        edges: [
          ...edges,
          link('ego', 'ex', 'partner', { [CURRENT_VAR]: false }),
          link('ex', 'baby'),
          link('donor', 'baby', 'donor'),
          link('surrogate', 'baby', 'surrogate', { [CARRIER_VAR]: true }),
        ],
      },
    });
    for (const name of ['Ex', 'Donor', 'Surrogate', 'Baby']) {
      expect(
        await screen.findByRole('button', { name: `Focus on ${name}` }),
      ).toBeInTheDocument();
    }
  });

  it('throws when the source is not a Family Pedigree, so the task error boundary reports it', () => {
    const stage = { ...makeNarrativeStage(), sourceStageId: 'missing' };
    // React logs the expected render error; it is not what this test is about.
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    expect(() => renderView({ narrativeStage: stage })).toThrow(
      'The Narrative Pedigree source stage could not be found.',
    );
    consoleError.mockRestore();
  });
});

describe('NarrativePedigreeView — labels for unnamed relatives', () => {
  it.each([
    { sourceFraming: 'gendered', chosenFraming: 'gamete' },
    { sourceFraming: 'participantPreference', chosenFraming: 'gendered' },
  ] satisfies { sourceFraming: SourceFraming; chosenFraming: FramingId }[])(
    'describes them in gendered words when the source framing is $sourceFraming and the participant chose $chosenFraming',
    async ({ sourceFraming, chosenFraming }) => {
      renderView({ network: unnamed, sourceFraming, chosenFraming });
      await selectCondition('Disease A');
      expect(
        await screen.findByRole('button', { name: 'Focus on Mother' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Focus on Father' }),
      ).toBeInTheDocument();
    },
  );

  it('describes them by the gametes they gave when the participant chose that framing', async () => {
    renderView({
      network: unnamed,
      sourceFraming: 'participantPreference',
      chosenFraming: 'gamete',
    });
    expect(
      await screen.findByRole('button', { name: 'Focus on Egg parent' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Focus on Sperm parent' }),
    ).toBeInTheDocument();
  });
});

describe('NarrativePedigreeView — encrypted names', () => {
  const encryptedNetwork = async () => ({
    nodes: [
      ...nodes.filter((node) => node[entityPrimaryKeyProperty] !== 'father'),
      await encryptedPerson('father', 'David', 'secret', {
        [SEX_VAR]: ['male'],
      }),
    ],
    edges,
  });

  it('asks for the passphrase, and describes the person by how they are related until it is entered', async () => {
    const { store } = renderView({
      network: await encryptedNetwork(),
      encryption: { header: (await encryptionFor('secret')).header },
    });
    expect(
      await screen.findByRole('button', { name: 'Focus on Father' }),
    ).toBeInTheDocument();
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);
  });

  it('shows the decrypted name once the passphrase is entered', async () => {
    const { store } = renderView({
      network: await encryptedNetwork(),
      encryption: await encryptionFor('secret'),
    });
    expect(
      await screen.findByRole('button', { name: 'Focus on David' }),
    ).toBeInTheDocument();
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });
});

describe('NarrativePedigreeView — node mode selection', () => {
  it('reformats selected condition, status, focus and snapshot in place while preserving authored copy and network data', async () => {
    const stage = makeNarrativeStage();
    stage.label = { en: 'Árbol **del estudio**' };
    const firstDisease = stage.diseases[0];
    if (!firstDisease) throw new Error('The condition fixture is missing');
    firstDisease.label = { en: 'Condition <b>A</b>' };
    const rendered = renderView({ narrativeStage: stage });
    const before = JSON.stringify(rendered.store.getState().session.network);
    await selectCondition('Condition <b>A</b>');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Focus on You' }),
    );
    expect(
      screen.getByRole('button', { name: 'Focus on Mother' }),
    ).toHaveAccessibleDescription('Condition <b>A</b>: Affected');

    rendered.changeLocale('es');
    expect(
      await screen.findByRole('button', { name: 'Centrar en Tú' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Centrar en Mother' }),
    ).toHaveAccessibleDescription('Condition <b>A</b>: Afectado/a');
    expect(
      screen.getByRole('button', { name: 'Condition <b>A</b>' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Quitar el foco' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Tiene esta afección').length).toBeGreaterThan(
      0,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar imagen' }),
    );
    await waitFor(() => expect(exportSnapshotMock).toHaveBeenCalledTimes(1));
    const snapshot = exportSnapshotMock.mock.calls[0]?.[0];
    expect(snapshot?.querySelector('h2')).toHaveTextContent(
      'Árbol **del estudio**: Condition <b>A</b> — herencia de Tú',
    );
    expect(snapshot?.querySelector('h3')).toHaveTextContent('Leyenda');

    rendered.changeLocale('en-GB');
    expect(
      await screen.findByRole('button', { name: 'Focus on You' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Clear focus' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Focus on Mother' }),
    ).toHaveAccessibleDescription('Condition <b>A</b>: Affected');
    expect(JSON.stringify(rendered.store.getState().session.network)).toBe(
      before,
    );
  });

  it('renders plain nodes with no status symbol by default', async () => {
    renderView();
    await waitForFamily();
    expect(viewMarker('[data-notation-status]')).toBeNull();
  });

  it('renders classic-notation nodes when a condition is selected from the key', async () => {
    renderView();
    await waitForFamily();
    expect(viewMarker('[data-notation-status]')).toBeNull();

    await selectCondition('Disease A');

    await waitFor(() =>
      expect(viewMarker('[data-notation-status]')).toBeTruthy(),
    );
  });

  it('returns to plain nodes when the selected condition is clicked again', async () => {
    renderView();
    await waitForFamily();

    await selectCondition('Disease A');
    await waitFor(() =>
      expect(viewMarker('[data-notation-status]')).toBeTruthy(),
    );

    await selectCondition('Disease A');
    await waitFor(() =>
      expect(viewMarker('[data-notation-status]')).toBeNull(),
    );
  });
});

describe('NarrativePedigreeView — condition colours', () => {
  it('resolves every defined node color reference', () => {
    expect(resolveDiseaseColor('node-color-seq-1')).toBe('var(--node-1)');
    expect(resolveDiseaseColor('node-color-seq-8')).toBe('var(--node-8)');
  });

  it('resolves Architect node colour tokens for the key, pedigree, dimming, and snapshot', async () => {
    const baseStage = makeNarrativeStage();
    const stage: NarrativeStage = {
      ...baseStage,
      diseases: baseStage.diseases.map((disease, index) =>
        index === 0 ? { ...disease, color: 'node-color-seq-3' } : disease,
      ),
    };
    renderView({ narrativeStage: stage });

    const conditionButton = await screen.findByRole('button', {
      name: 'Disease A',
    });
    expect(conditionButton.querySelector('[aria-hidden]')).toHaveStyle({
      backgroundColor: 'var(--node-3)',
    });

    await userEvent.click(conditionButton);
    await waitFor(() =>
      expect(
        member('mother').querySelector('[data-filled-shape]'),
      ).toHaveAttribute('fill', 'var(--node-3)'),
    );

    await userEvent.click(member('ego'));
    const dimmedOutline = await waitFor(() => {
      const outline = document.querySelector(
        '[data-pedigree-member][data-dimmed="true"] [data-shape-outline]',
      );
      expect(outline).toBeTruthy();
      return outline;
    });
    expect(dimmedOutline).toHaveAttribute(
      'stroke',
      'color-mix(in oklab, var(--node-3) 30%, var(--dim-blend, var(--background)))',
    );

    await userEvent.click(
      screen.getByRole('button', { name: /save snapshot/i }),
    );
    await waitFor(() => expect(exportSnapshotMock).toHaveBeenCalledTimes(1));
    const snapshot = exportSnapshotMock.mock.calls[0]?.[0];
    expect(
      snapshot?.querySelector('[data-filled-shape][fill="var(--node-3)"]'),
    ).toBeTruthy();
    expect(
      snapshot?.querySelector('[data-shape-outline][stroke="var(--node-3)"]'),
    ).toBeTruthy();
  });
});

describe('NarrativePedigreeView — focal selection', () => {
  const dimmedIds = () =>
    Array.from(document.querySelectorAll('[data-pedigree-member]'))
      .filter((el) => el.getAttribute('data-dimmed') === 'true')
      .map((el) => el.getAttribute('data-node-id') ?? '')
      .sort((a, b) => a.localeCompare(b));

  it('cannot focus on anyone until a condition is chosen', async () => {
    renderView();
    await waitForFamily();
    const mother = screen.getByRole('button', { name: 'Focus on Mother' });
    expect(mother).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(mother);
    expect(
      screen.queryByRole('button', { name: 'Clear focus' }),
    ).not.toBeInTheDocument();
  });

  it('focuses on a person when they are clicked, and says so', async () => {
    renderView();
    await waitForFamily();
    await selectCondition('Disease A');

    const before = dimmedIds();
    const mother = screen.getByRole('button', { name: 'Focus on Mother' });
    await userEvent.click(mother);

    await waitFor(() => expect(dimmedIds()).not.toEqual(before));
    expect(mother).toHaveAttribute('aria-pressed', 'true');
    expect(
      await screen.findByRole('button', { name: 'Clear focus' }),
    ).toBeInTheDocument();
  });

  it('clears dimming when "Clear focus" is clicked', async () => {
    renderView();
    await waitForFamily();
    await selectCondition('Disease A');
    await userEvent.click(member('mother'));

    await userEvent.click(
      await screen.findByRole('button', { name: 'Clear focus' }),
    );

    for (const el of document.querySelectorAll('[data-pedigree-member]')) {
      expect(el.getAttribute('data-dimmed')).toBe('false');
    }
  });

  it('clears the focus with Escape', async () => {
    renderView();
    await waitForFamily();
    await selectCondition('Disease A');
    await userEvent.click(member('mother'));
    await screen.findByRole('button', { name: 'Clear focus' });

    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Clear focus' }),
      ).not.toBeInTheDocument(),
    );
  });
});

describe('NarrativePedigreeView — the canvas', () => {
  it('is a named region holding the family as a single tab stop, starting at the participant', async () => {
    renderView();
    await waitForFamily();
    expect(
      screen.getByRole('region', { name: 'Your family' }),
    ).toContainElement(member('ego'));
    const tabStops = Array.from(
      document.querySelectorAll('[data-pedigree-member]'),
    ).filter((el) => el.getAttribute('tabindex') === '0');
    expect(tabStops).toEqual([member('ego')]);
  });

  it('offers zoom controls and a way back to the whole family', async () => {
    renderView();
    await waitForFamily();
    for (const name of ['Zoom out', 'Zoom in', 'Show the whole family']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });
});

describe('NarrativePedigreeView — symbol shapes', () => {
  // Lines meet each symbol's edge only when the layout knows the shape the
  // symbol is drawn with (here every person is a square, as the codebook
  // says), on screen and in the printable snapshot alike.
  it('lays out the family, on screen and in the snapshot, with the shape each symbol is drawn with', async () => {
    layoutsDrawn.length = 0;
    renderView();
    await waitForFamily();
    await userEvent.click(
      screen.getByRole('button', { name: /save snapshot/i }),
    );
    await waitFor(() => expect(exportSnapshotMock).toHaveBeenCalledTimes(1));
    // The canvas's layout and the snapshot's.
    expect(new Set(layoutsDrawn.map(({ instance }) => instance)).size).toBe(2);
    for (const { props } of layoutsDrawn) {
      expect(props.nodeIds.map((id) => props.nodeShapes?.get(id))).toEqual(
        props.nodeIds.map(() => 'square'),
      );
    }
  });
});

describe('NarrativePedigreeView — snapshot', () => {
  it('calls exportSnapshot with the view element when Save snapshot is clicked', async () => {
    renderView();

    const saveButton = await screen.findByRole('button', {
      name: /save snapshot/i,
    });
    await userEvent.click(saveButton);

    await waitFor(() => expect(exportSnapshotMock).toHaveBeenCalledTimes(1));
    const [element, filename] = exportSnapshotMock.mock.calls[0]!;
    expect(element).toBeInstanceOf(HTMLElement);
    expect(typeof filename).toBe('string');
  });

  it('captures the whole family, untransformed, however the canvas is zoomed', async () => {
    renderView();
    await waitForFamily();
    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    await userEvent.click(
      screen.getByRole('button', { name: /save snapshot/i }),
    );

    await waitFor(() => expect(exportSnapshotMock).toHaveBeenCalledTimes(1));
    const snapshot = exportSnapshotMock.mock.calls[0]?.[0];
    const text = snapshot?.textContent ?? '';
    for (const name of ['You', 'Mother', 'Father', 'Partner', 'Child']) {
      expect(text).toContain(name);
    }
    expect(text).not.toContain('Colleague');
    const transformed = [...(snapshot?.querySelectorAll('*') ?? [])].filter(
      (el) => el instanceof HTMLElement && el.style.transform !== '',
    );
    expect(transformed).toEqual([]);
  });
});

// --- Cousin-union pedigree fixture for the at-risk display gate ---
//
// Topology (AR disease seeded on GGP):
//   ggp (affected) + ggpPartner → childA, childB
//   childA + partnerA → cousin1
//   childB + partnerB → cousin2
//   cousin1 + cousin2 → sharedChild
//
// AR engine marks childA/childB as obligateCarrier and cousin1/cousin2 as
// atRiskCarrier (1 carrier parent each), so the fixture exercises the at-risk
// display gate (whether the probabilistic "?" markers are drawn).
const AR_DISEASE_VAR = 'arDisease';

const cousinNodes: NcNode[] = [
  person('ggp', 'male', { [AR_DISEASE_VAR]: true }),
  person('ggpPartner', 'female'),
  person('childA', 'male'),
  person('partnerA', 'female'),
  person('childB', 'female'),
  person('partnerB', 'male'),
  person('cousin1', 'male', { [EGO_VAR]: true }),
  person('cousin2', 'female'),
  person('sharedChild', 'male'),
];

const cousinEdges: NcEdge[] = [
  link('ggp', 'ggpPartner', 'partner'),
  link('ggp', 'childA'),
  link('ggpPartner', 'childA'),
  link('ggp', 'childB'),
  link('ggpPartner', 'childB'),
  link('childA', 'partnerA', 'partner'),
  link('childA', 'cousin1'),
  link('partnerA', 'cousin1'),
  link('childB', 'partnerB', 'partner'),
  link('childB', 'cousin2'),
  link('partnerB', 'cousin2'),
  link('cousin1', 'cousin2', 'partner'),
  link('cousin1', 'sharedChild'),
  link('cousin2', 'sharedChild'),
];

function renderCousinView(showAtRiskStatuses = true) {
  return renderView({
    narrativeStage: {
      id: 'np-cousin',
      type: 'NarrativePedigree',
      label: { en: 'Cousin Union Disease Pedigree' },
      sourceStageId: SOURCE_STAGE_ID,
      showAtRiskStatuses,
      ...narrativePedigreeWords({ atRisk: showAtRiskStatuses }),
      diseases: [
        {
          id: 'ar',
          label: { en: 'AR Disease' },
          color: 'node-color-seq-1',
          attribute: asEntityAttributeReference(AR_DISEASE_VAR),
          inheritancePattern: 'autosomalRecessive',
        },
      ],
    },
    network: { nodes: cousinNodes, edges: cousinEdges },
  });
}

// ---------------------------------------------------------------------------
// At-risk display gate (stage.showAtRiskStatuses).
//
// The genetics engine always emits the at-risk statuses; the stage option
// decides whether they are drawn on the selected condition. When off (the
// default), no "?" glyphs appear and the key panel drops the at-risk rows; when
// on, both reappear.
// ---------------------------------------------------------------------------
describe('NarrativePedigreeView — at-risk display gate', () => {
  it('hides the at-risk "?" glyphs when showAtRiskStatuses is off', async () => {
    renderCousinView(false);
    await selectCondition('AR Disease');
    await waitFor(() =>
      expect(viewMarker('[data-notation-status]')).toBeTruthy(),
    );

    // cousin1 is atRiskCarrier per the engine, but with the option off its
    // status collapses to unknown, so no "?"-bearing marker is drawn.
    expect(
      member('cousin1').querySelector('[data-notation-status="atRiskCarrier"]'),
    ).toBeNull();
  });

  it('shows the at-risk "?" glyphs when showAtRiskStatuses is on', async () => {
    renderCousinView(true);
    await selectCondition('AR Disease');
    await waitFor(() =>
      expect(viewMarker('[data-notation-status]')).toBeTruthy(),
    );

    expect(
      member('cousin1').querySelector('[data-notation-status="atRiskCarrier"]'),
    ).toBeTruthy();
  });

  it('drops the at-risk rows from the key panel when showAtRiskStatuses is off', async () => {
    renderCousinView(false);
    await waitForFamily();

    expect(screen.queryByText('May develop this condition')).toBeNull();
    expect(screen.queryByText('May carry this condition')).toBeNull();
  });

  it('lists the at-risk rows in the key panel when showAtRiskStatuses is on', async () => {
    renderCousinView(true);
    await waitForFamily();

    expect(screen.getByText('May develop this condition')).toBeTruthy();
    expect(screen.getByText('May carry this condition')).toBeTruthy();
  });

  it('omits the at-risk status from the accessible description when off', async () => {
    renderCousinView(false);

    await selectCondition('AR Disease');
    await waitFor(() =>
      expect(viewMarker('[data-notation-status]')).toBeTruthy(),
    );

    // cousin1 is atRiskCarrier per the engine; with the option off it must be
    // announced as status-unknown, never "At risk".
    expect(member('cousin1')).toHaveAccessibleDescription(/Status unknown/);
    expect(member('cousin1')).not.toHaveAccessibleDescription(/At risk/i);
  });
});

// ---------------------------------------------------------------------------
// Per-person disease-status summary exposed to assistive technology.
//
// The visual status markers (stickers / classic notation) are aria-hidden, so
// the only way a screen-reader user can learn who is affected/carrier/at-risk
// is the visually-hidden summary referenced by the person's aria-describedby.
// These tests assert that accessibility outcome directly via the computed
// accessible name/description rather than DOM attributes.
// ---------------------------------------------------------------------------
describe('NarrativePedigreeView — per-person status summary (a11y)', () => {
  it("exposes each member's disease status via their accessible description", async () => {
    renderView();
    await waitForFamily();

    // The name conveys the focal action + person; the description conveys the
    // disease status. Mother has Disease A (autosomal dominant) → affected.
    expect(member('mother')).toHaveAccessibleName('Focus on Mother');
    expect(member('mother')).toHaveAccessibleDescription(/Disease A: Affected/);
  });

  it('summarises every condition in the default view (before one is selected)', async () => {
    renderView();
    await waitForFamily();

    expect(member('mother')).toHaveAccessibleDescription(/Disease A:/);
    expect(member('mother')).toHaveAccessibleDescription(/Disease B:/);
  });

  it('narrows the summary to the selected condition', async () => {
    renderView();
    await waitForFamily();

    await selectCondition('Disease A');
    await waitFor(() =>
      expect(viewMarker('[data-notation-status]')).toBeTruthy(),
    );

    expect(member('mother')).toHaveAccessibleDescription('Disease A: Affected');
  });

  it('references the summary via a non-aria-hidden, reachable element', async () => {
    renderView();
    await waitForFamily();

    const summaryId = member('mother').getAttribute('aria-describedby');
    expect(summaryId).toBeTruthy();

    const summary = summaryId ? document.getElementById(summaryId) : null;
    expect(summary).toBeInTheDocument();

    // Walk every ancestor to confirm the summary is not suppressed by an
    // aria-hidden subtree (the regression these tests guard against).
    let el: Element | null = summary;
    while (el) {
      expect(el.getAttribute('aria-hidden')).not.toBe('true');
      el = el.parentElement;
    }
  });
});

// ---------------------------------------------------------------------------
// Sex assigned at birth. The genetics engine reads it from the source stage's
// attribute; anyone recorded intersex, unknown or not at all is still drawn
// and described, and is never inferred to have an X-linked condition.
// ---------------------------------------------------------------------------
describe('NarrativePedigreeView — sex assigned at birth', () => {
  it('draws and describes people whose sex assigned at birth is intersex, unknown or missing', async () => {
    renderView({
      narrativeStage: {
        ...makeNarrativeStage(),
        diseases: [
          {
            id: 'xl',
            label: { en: 'X-linked' },
            color: 'node-color-seq-2',
            attribute: asEntityAttributeReference(DISEASE_A_VAR),
            inheritancePattern: 'xLinkedRecessive',
          },
        ],
      },
      network: {
        nodes: [
          ...nodes,
          person('sib1', 'intersex', { [NAME_VAR]: 'Sam' }),
          person('sib2', 'unknown', { [NAME_VAR]: 'Alex' }),
          person('sib3', undefined, { [NAME_VAR]: 'Kim' }),
        ],
        edges: [
          ...edges,
          ...['sib1', 'sib2', 'sib3'].flatMap((id) => [
            link('mother', id),
            link('father', id),
          ]),
        ],
      },
    });
    await waitForFamily();
    for (const name of ['Sam', 'Alex', 'Kim']) {
      const sibling = screen.getByRole('button', { name: `Focus on ${name}` });
      expect(sibling).toHaveAccessibleDescription(/^X-linked: /);
      expect(sibling).not.toHaveAccessibleDescription(/Affected/);
    }
  });
});

// ---------------------------------------------------------------------------
// No-focal dimming. When no focal person is selected, NOTHING should be dimmed —
// including a couple connector where one partner is a SOCIAL parent (no
// genetic edge). The view passes no highlight sets when there is no focal
// person.
// ---------------------------------------------------------------------------
describe('NarrativePedigreeView — no dimming without a focal person', () => {
  it('does not dim a social parent’s couple connector when nothing is focused', async () => {
    renderView({
      network: {
        nodes: [
          person('socialMum', 'female', { [NAME_VAR]: 'Mum' }),
          person('bioDad', 'male', { [NAME_VAR]: 'Dad' }),
          person('kid', 'male', { [NAME_VAR]: 'Kid', [EGO_VAR]: true }),
        ],
        edges: [
          link('socialMum', 'bioDad', 'partner'),
          link('socialMum', 'kid', 'social'),
          link('bioDad', 'kid'),
        ],
      },
    });
    await waitForFamily();

    const view = document.querySelector('[data-narrative-pedigree-view]');
    expect(view?.querySelectorAll('[data-edge-dimmed]').length).toBe(0);
  });
});

describe('NarrativePedigreeView — localized condition labels', () => {
  it('shows a condition label in the participant language with no language of its own', async () => {
    const arabicLabel = 'داء هنتنغتون';
    const stage = makeNarrativeStage();
    const firstDisease = stage.diseases[0];
    if (!firstDisease) throw new Error('The condition fixture is missing');
    firstDisease.label = { en: 'Huntington disease', ar: arabicLabel };

    render(
      <Provider store={makeStore({ narrativeStage: stage })}>
        <CurrentStepProvider currentStep={1} onStepChange={() => undefined}>
          <TestProtocolLocalization
            localization={{ defaultLocale: 'en', locales: ['en', 'ar'] }}
            locale="ar"
          >
            <NarrativePedigreeView stage={stage} />
          </TestProtocolLocalization>
        </CurrentStepProvider>
      </Provider>,
    );

    const conditionButton = await screen.findByRole('button', {
      name: arabicLabel,
    });
    expect(conditionButton.closest('[lang], [dir]')).toBeNull();
    expect(conditionButton.querySelector('[lang], [dir]')).toBeNull();
  });
});
