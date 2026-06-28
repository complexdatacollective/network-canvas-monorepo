import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { asEntityAttributeReference } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';
import { CurrentStepProvider } from '~/contexts/CurrentStepContext';
import protocol from '~/store/modules/protocol';
import session from '~/store/modules/session';
import type { StageProps } from '~/types';

const exportSnapshotMock =
  vi.fn<(element: HTMLElement, filename: string) => Promise<void>>();
exportSnapshotMock.mockResolvedValue(undefined);
vi.mock('../export/snapshot', () => ({
  exportSnapshot: (element: HTMLElement, filename: string) =>
    exportSnapshotMock(element, filename),
}));

import NarrativePedigreeView from '../components/NarrativePedigreeView';

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

// --- Variable + type identifiers shared by the codebook + the network ---
const NODE_TYPE = 'person';
const EDGE_TYPE = 'family';
const NAME_VAR = 'name';
const EGO_VAR = 'isEgo';
const REL_TYPE_VAR = 'relationshipType';
const GAMETE_VAR = 'gameteRole';
const BIO_SEX_VAR = 'biologicalSex';
const REL_VAR = 'relationshipToEgo';
const IS_ACTIVE_VAR = 'isActive';
const IS_GEST_VAR = 'isGestationalCarrier';
const DISEASE_A_VAR = 'diseaseA';
const DISEASE_B_VAR = 'diseaseB';

const SOURCE_STAGE_ID = 'source-fp';

type Attrs = Record<string, VariableValue>;

function makeNode(id: string, attributes: Attrs): NcNode {
  return {
    [entityPrimaryKeyProperty]: id,
    type: NODE_TYPE,
    [entityAttributesProperty]: attributes,
  };
}

function makeEdge(from: string, to: string): NcEdge {
  return {
    [entityPrimaryKeyProperty]: `${from}->${to}`,
    type: EDGE_TYPE,
    from,
    to,
    [entityAttributesProperty]: {
      [REL_TYPE_VAR]: ['biological'],
      [IS_ACTIVE_VAR]: true,
    },
  };
}

/**
 * Fixture pedigree:
 *   mother (affected disease A) --- father
 *                 |
 *                ego --- partner
 *                 |
 *               child
 */
const nodes: NcNode[] = [
  makeNode('mother', {
    [NAME_VAR]: 'Mother',
    [BIO_SEX_VAR]: 'female',
    [DISEASE_A_VAR]: true,
  }),
  makeNode('father', { [NAME_VAR]: 'Father', [BIO_SEX_VAR]: 'male' }),
  makeNode('ego', {
    [NAME_VAR]: 'Ego',
    [EGO_VAR]: true,
    [BIO_SEX_VAR]: 'male',
  }),
  makeNode('partner', { [NAME_VAR]: 'Partner', [BIO_SEX_VAR]: 'female' }),
  makeNode('child', { [NAME_VAR]: 'Child', [BIO_SEX_VAR]: 'female' }),
];

const edges: NcEdge[] = [
  makeEdge('mother', 'ego'),
  makeEdge('father', 'ego'),
  makeEdge('ego', 'child'),
  makeEdge('partner', 'child'),
  {
    [entityPrimaryKeyProperty]: 'partner-ego',
    type: EDGE_TYPE,
    from: 'mother',
    to: 'father',
    [entityAttributesProperty]: {
      [REL_TYPE_VAR]: ['partner'],
      [IS_ACTIVE_VAR]: true,
    },
  },
];

const sourceStage = {
  id: SOURCE_STAGE_ID,
  type: 'FamilyPedigree' as const,
  label: 'Family Pedigree',
  subject: { entity: 'node' as const, type: NODE_TYPE },
  nodeConfig: {
    type: NODE_TYPE,
    nodeLabelVariable: NAME_VAR,
    egoVariable: EGO_VAR,
    relationshipVariable: REL_VAR,
    biologicalSexVariable: BIO_SEX_VAR,
  },
  edgeConfig: {
    type: EDGE_TYPE,
    relationshipTypeVariable: REL_TYPE_VAR,
    isActiveVariable: IS_ACTIVE_VAR,
    isGestationalCarrierVariable: IS_GEST_VAR,
    gameteRoleVariable: GAMETE_VAR,
  },
  censusPrompt: 'Build your pedigree.',
};

type NarrativeStage = StageProps<'NarrativePedigree'>['stage'];

function makeNarrativeStage(): NarrativeStage {
  return {
    id: 'np-1',
    type: 'NarrativePedigree',
    label: 'Disease Pedigree',
    sourceStageId: SOURCE_STAGE_ID,
    diseases: [
      {
        id: 'da',
        label: 'Disease A',
        color: '#ff0000',
        variable: asEntityAttributeReference(DISEASE_A_VAR),
        inheritancePattern: 'autosomalDominant',
      },
      {
        id: 'db',
        label: 'Disease B',
        color: '#00ff00',
        variable: asEntityAttributeReference(DISEASE_B_VAR),
        inheritancePattern: 'autosomalRecessive',
      },
    ],
  };
}

const codebook = {
  node: {
    [NODE_TYPE]: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'square' },
      variables: {},
    },
  },
  edge: {
    [EDGE_TYPE]: { name: 'Family', color: 'edge-color-seq-1' },
  },
  ego: { variables: {} },
};

function makeStore() {
  const narrativeStage = makeNarrativeStage();
  return configureStore({
    reducer: { protocol, session },
    preloadedState: {
      protocol: {
        codebook,
        stages: [sourceStage, narrativeStage],
        assets: [],
      } as never,
      session: {
        id: 'test-session',
        network: { nodes, edges, ego: { [entityAttributesProperty]: {} } },
        stageMetadata: {},
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });
}

function renderView() {
  const store = makeStore();
  const stage = makeNarrativeStage();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <CurrentStepProvider currentStep={1} onStepChange={() => undefined}>
          {children}
        </CurrentStepProvider>
      </Provider>
    );
  }

  return render(<NarrativePedigreeView stage={stage} />, {
    wrapper: Wrapper,
  });
}

describe('NarrativePedigreeView — node mode selection', () => {
  it('renders sticker nodes by default (multiple diseases)', async () => {
    renderView();

    await waitFor(() =>
      expect(document.querySelector('[data-sticker-status]')).toBeTruthy(),
    );
    expect(document.querySelector('[data-notation-status]')).toBeNull();
  });

  it('renders classic-notation nodes when a single disease is selected via the legend', async () => {
    renderView();

    await waitFor(() =>
      expect(document.querySelector('[data-sticker-status]')).toBeTruthy(),
    );

    // Select Disease A via the legend button.
    await userEvent.click(screen.getByRole('button', { name: 'Disease A' }));

    await waitFor(() =>
      expect(document.querySelector('[data-notation-status]')).toBeTruthy(),
    );
    expect(document.querySelector('[data-sticker-status]')).toBeNull();
  });

  it('returns to sticker mode when "All diseases" is clicked after selecting a disease', async () => {
    renderView();

    await waitFor(() =>
      expect(document.querySelector('[data-sticker-status]')).toBeTruthy(),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Disease A' }));
    await waitFor(() =>
      expect(document.querySelector('[data-notation-status]')).toBeTruthy(),
    );

    await userEvent.click(screen.getByRole('button', { name: 'All diseases' }));
    await waitFor(() =>
      expect(document.querySelector('[data-sticker-status]')).toBeTruthy(),
    );
    expect(document.querySelector('[data-notation-status]')).toBeNull();
  });
});

describe('NarrativePedigreeView — focal selection', () => {
  it('sets focus when a member node is clicked', async () => {
    renderView();

    await waitFor(() =>
      expect(document.querySelector('[data-pedigree-member]')).toBeTruthy(),
    );

    const dimmedIds = () =>
      Array.from(document.querySelectorAll('[data-pedigree-member]'))
        .filter((el) => el.getAttribute('data-dimmed') === 'true')
        .map((el) => el.getAttribute('data-node-id') ?? '')
        .sort((a, b) => a.localeCompare(b));

    const before = dimmedIds();

    // The focal container is the [data-pedigree-member] div itself — it carries
    // role="button" directly (no wrapping button inside it).
    const motherContainer = document.querySelector('[data-node-id="mother"]');
    if (motherContainer instanceof HTMLElement) {
      await userEvent.click(motherContainer);
    }

    await waitFor(() => expect(dimmedIds()).not.toEqual(before));
  });

  it('shows "Clear focus" button after a member is clicked', async () => {
    renderView();

    await waitFor(() =>
      expect(document.querySelector('[data-pedigree-member]')).toBeTruthy(),
    );

    // Click any member to set focus.
    const memberContainer = document.querySelector('[data-pedigree-member]');
    if (memberContainer instanceof HTMLElement) {
      await userEvent.click(memberContainer);
    }

    await screen.findByRole('button', { name: 'Clear focus' });
  });

  it('clears dimming when "Clear focus" is clicked', async () => {
    renderView();

    await waitFor(() =>
      expect(document.querySelector('[data-pedigree-member]')).toBeTruthy(),
    );

    const memberContainer = document.querySelector('[data-pedigree-member]');
    if (memberContainer instanceof HTMLElement) {
      await userEvent.click(memberContainer);
    }

    const clearBtn = await screen.findByRole('button', { name: 'Clear focus' });
    await userEvent.click(clearBtn);

    const allMembers = document.querySelectorAll('[data-pedigree-member]');
    for (const member of allMembers) {
      expect(member.getAttribute('data-dimmed')).toBe('false');
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
});

describe('NarrativePedigreeView — within Provider smoke', () => {
  it('renders the pedigree members for every network node', async () => {
    renderView();
    await waitFor(() =>
      expect(
        within(document.body).getAllByText(
          (_content, el) => el?.getAttribute('data-pedigree-member') === 'true',
          { exact: false },
        ).length,
      ).toBeGreaterThan(0),
    );
  });
});

// --- Cousin-union pedigree fixture for at-risk-homozygous threading ---
//
// Topology (AR disease seeded on GGP):
//   ggp (affected) + ggpPartner → childA, childB
//   childA + partnerA → cousin1
//   childB + partnerB → cousin2
//   cousin1 + cousin2 → sharedChild   ← the at-risk-homozygous node
//
// AR engine marks childA/childB as obligateCarrier, cousin1/cousin2 as
// atRiskCarrier (1 carrier parent each). sharedChild has 2 atRiskCarrier
// parents → computeAtRiskHomozygous flags it true.
const AR_DISEASE_VAR = 'arDisease';
const AR_DISEASE_ID = 'ar';

const SOURCE_STAGE_ID_COUSIN = 'source-fp-cousin';

function makeCNode(id: string, attributes: Attrs): NcNode {
  return {
    [entityPrimaryKeyProperty]: id,
    type: NODE_TYPE,
    [entityAttributesProperty]: attributes,
  };
}

function makeCEdge(
  from: string,
  to: string,
  relType: string[] = ['biological'],
): NcEdge {
  return {
    [entityPrimaryKeyProperty]: `${from}->${to}-${relType[0] ?? 'bio'}`,
    type: EDGE_TYPE,
    from,
    to,
    [entityAttributesProperty]: {
      [REL_TYPE_VAR]: relType,
      [IS_ACTIVE_VAR]: true,
    },
  };
}

const cousinNodes: NcNode[] = [
  makeCNode('ggp', { [BIO_SEX_VAR]: 'male', [AR_DISEASE_VAR]: true }),
  makeCNode('ggpPartner', { [BIO_SEX_VAR]: 'female' }),
  makeCNode('childA', { [BIO_SEX_VAR]: 'male' }),
  makeCNode('partnerA', { [BIO_SEX_VAR]: 'female' }),
  makeCNode('childB', { [BIO_SEX_VAR]: 'female' }),
  makeCNode('partnerB', { [BIO_SEX_VAR]: 'male' }),
  makeCNode('cousin1', { [BIO_SEX_VAR]: 'male', [EGO_VAR]: true }),
  makeCNode('cousin2', { [BIO_SEX_VAR]: 'female' }),
  makeCNode('sharedChild', { [BIO_SEX_VAR]: 'male' }),
  makeCNode('unrelated', { [BIO_SEX_VAR]: 'female' }),
];

const cousinEdges: NcEdge[] = [
  // GGP + ggpPartner → childA, childB
  makeCEdge('ggp', 'childA'),
  makeCEdge('ggpPartner', 'childA'),
  makeCEdge('ggp', 'childB'),
  makeCEdge('ggpPartner', 'childB'),
  makeCEdge('ggp', 'ggpPartner', ['partner']),
  // childA + partnerA → cousin1
  makeCEdge('childA', 'cousin1'),
  makeCEdge('partnerA', 'cousin1'),
  makeCEdge('childA', 'partnerA', ['partner']),
  // childB + partnerB → cousin2
  makeCEdge('childB', 'cousin2'),
  makeCEdge('partnerB', 'cousin2'),
  makeCEdge('childB', 'partnerB', ['partner']),
  // cousin1 + cousin2 → sharedChild
  makeCEdge('cousin1', 'sharedChild'),
  makeCEdge('cousin2', 'sharedChild'),
  makeCEdge('cousin1', 'cousin2', ['partner']),
];

const cousinSourceStage = {
  ...sourceStage,
  id: SOURCE_STAGE_ID_COUSIN,
};

function makeCousinNarrativeStage(mode: 'classic' | 'sticker'): NarrativeStage {
  return {
    id: 'np-cousin',
    type: 'NarrativePedigree',
    label: 'Cousin Union Disease Pedigree',
    sourceStageId: SOURCE_STAGE_ID_COUSIN,
    diseases: [
      {
        id: AR_DISEASE_ID,
        label: 'AR Disease',
        color: '#ff0000',
        variable: asEntityAttributeReference(AR_DISEASE_VAR),
        inheritancePattern: 'autosomalRecessive',
      },
      ...(mode === 'sticker'
        ? [
            {
              id: 'db2',
              label: 'Disease B2',
              color: '#00ff00',
              variable: asEntityAttributeReference(DISEASE_B_VAR),
              inheritancePattern: 'autosomalDominant' as const,
            },
          ]
        : []),
    ],
  };
}

function renderCousinView(mode: 'classic' | 'sticker') {
  const stage = makeCousinNarrativeStage(mode);
  const store = configureStore({
    reducer: { protocol, session },
    preloadedState: {
      protocol: {
        codebook,
        stages: [cousinSourceStage, stage],
        assets: [],
      } as never,
      session: {
        id: 'cousin-session',
        network: {
          nodes: cousinNodes,
          edges: cousinEdges,
          ego: { [entityAttributesProperty]: {} },
        },
        stageMetadata: {},
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <CurrentStepProvider currentStep={1} onStepChange={() => undefined}>
          {children}
        </CurrentStepProvider>
      </Provider>
    );
  }

  return render(<NarrativePedigreeView stage={stage} />, { wrapper: Wrapper });
}

describe('NarrativePedigreeView — at-risk-homozygous threading (classic mode)', () => {
  it('shows the at-risk-homozygous notation on the flagged shared child and not on an unflagged node', async () => {
    renderCousinView('classic');

    await waitFor(() =>
      expect(document.querySelector('[data-notation-status]')).toBeTruthy(),
    );

    const sharedChildMember = document.querySelector(
      '[data-node-id="sharedChild"]',
    );
    expect(sharedChildMember).toBeTruthy();
    expect(
      sharedChildMember?.querySelector('[data-atrisk-homozygous-notation]'),
    ).toBeTruthy();

    const unrelatedMember = document.querySelector(
      '[data-node-id="unrelated"]',
    );
    expect(unrelatedMember).toBeTruthy();
    expect(
      unrelatedMember?.querySelector('[data-atrisk-homozygous-notation]'),
    ).toBeNull();
  });
});

describe('NarrativePedigreeView — at-risk-homozygous threading (sticker mode)', () => {
  it('shows the at-risk-homozygous marker on the flagged shared child and not on an unflagged node', async () => {
    renderCousinView('sticker');

    await waitFor(() =>
      expect(document.querySelector('[data-sticker-status]')).toBeTruthy(),
    );

    const sharedChildMember = document.querySelector(
      '[data-node-id="sharedChild"]',
    );
    expect(sharedChildMember).toBeTruthy();
    expect(
      sharedChildMember?.querySelector('[data-atrisk-homozygous-marker]'),
    ).toBeTruthy();

    const unrelatedMember = document.querySelector(
      '[data-node-id="unrelated"]',
    );
    expect(unrelatedMember).toBeTruthy();
    expect(
      unrelatedMember?.querySelector('[data-atrisk-homozygous-marker]'),
    ).toBeNull();
  });
});
