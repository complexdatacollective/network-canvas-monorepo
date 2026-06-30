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
    showAtRiskStatuses: false,
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

// Drives the Base-UI condition Select: open the combobox, then pick the option
// whose accessible name matches. Used by the node-mode-selection tests since the
// disease filter is now a Select rather than a row of buttons.
async function selectCondition(optionName: string) {
  await userEvent.click(screen.getByRole('combobox'));
  const option = await screen.findByRole('option', { name: optionName });
  await userEvent.click(option);
}

// Node-mode markers must be queried inside the pedigree view, not the whole
// document: the always-present ConditionPanel legend also renders Sticker
// glyphs (with [data-sticker-status]) as a sibling overlay, so a document-wide
// query would always match those and never report the node-rendering mode.
function viewMarker(selector: string): Element | null {
  return (
    document
      .querySelector('[data-narrative-pedigree-view]')
      ?.querySelector(selector) ?? null
  );
}

describe('NarrativePedigreeView — node mode selection', () => {
  it('renders sticker nodes by default (multiple diseases)', async () => {
    renderView();

    await waitFor(() =>
      expect(viewMarker('[data-sticker-status]')).toBeTruthy(),
    );
    expect(viewMarker('[data-notation-status]')).toBeNull();
  });

  it('renders classic-notation nodes when a single disease is selected via the condition Select', async () => {
    renderView();

    await waitFor(() =>
      expect(viewMarker('[data-sticker-status]')).toBeTruthy(),
    );

    // Select Disease A via the condition Select.
    await selectCondition('Disease A');

    await waitFor(() =>
      expect(viewMarker('[data-notation-status]')).toBeTruthy(),
    );
    expect(viewMarker('[data-sticker-status]')).toBeNull();
  });

  it('returns to sticker mode when "All conditions" is selected after selecting a disease', async () => {
    renderView();

    await waitFor(() =>
      expect(viewMarker('[data-sticker-status]')).toBeTruthy(),
    );

    await selectCondition('Disease A');
    await waitFor(() =>
      expect(viewMarker('[data-notation-status]')).toBeTruthy(),
    );

    await selectCondition('All conditions');
    await waitFor(() =>
      expect(viewMarker('[data-sticker-status]')).toBeTruthy(),
    );
    expect(viewMarker('[data-notation-status]')).toBeNull();
  });
});

describe('NarrativePedigreeView — focal selection', () => {
  it('sets focus when a member node is clicked', async () => {
    renderView();

    await waitFor(() =>
      expect(document.querySelector('[data-pedigree-member]')).toBeTruthy(),
    );

    // Focusing is only enabled once a single condition is shown.
    await selectCondition('Disease A');

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

    // Focusing is only enabled once a single condition is shown.
    await selectCondition('Disease A');

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

    // Focusing is only enabled once a single condition is shown.
    await selectCondition('Disease A');

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

function makeCousinNarrativeStage(
  mode: 'classic' | 'sticker',
  showAtRiskStatuses = true,
): NarrativeStage {
  return {
    id: 'np-cousin',
    type: 'NarrativePedigree',
    label: 'Cousin Union Disease Pedigree',
    sourceStageId: SOURCE_STAGE_ID_COUSIN,
    showAtRiskStatuses,
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

function renderCousinView(
  mode: 'classic' | 'sticker',
  showAtRiskStatuses = true,
) {
  const stage = makeCousinNarrativeStage(mode, showAtRiskStatuses);
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

describe('NarrativePedigreeView — at-risk-homozygous threading (single-condition mode)', () => {
  it('shows the at-risk-homozygous marker on the flagged shared child and not on an unflagged node', async () => {
    renderCousinView('classic');

    // The single-condition node only appears once a condition is explicitly
    // selected; the default view is stickers (all conditions).
    await selectCondition('AR Disease');

    await waitFor(() =>
      expect(viewMarker('[data-notation-status]')).toBeTruthy(),
    );

    const sharedChildMember = document.querySelector(
      '[data-node-id="sharedChild"]',
    );
    expect(sharedChildMember).toBeTruthy();
    expect(
      sharedChildMember?.querySelector('[data-status="atRiskHomozygous"]'),
    ).toBeTruthy();

    const unrelatedMember = document.querySelector(
      '[data-node-id="unrelated"]',
    );
    expect(unrelatedMember).toBeTruthy();
    expect(
      unrelatedMember?.querySelector('[data-status="atRiskHomozygous"]'),
    ).toBeNull();
  });
});

describe('NarrativePedigreeView — at-risk-homozygous threading (sticker mode)', () => {
  it('shows the at-risk-homozygous marker on the flagged shared child and not on an unflagged node', async () => {
    renderCousinView('sticker');

    await waitFor(() =>
      expect(viewMarker('[data-sticker-status]')).toBeTruthy(),
    );

    const sharedChildMember = document.querySelector(
      '[data-node-id="sharedChild"]',
    );
    expect(sharedChildMember).toBeTruthy();
    expect(
      sharedChildMember?.querySelector('[data-status="atRiskHomozygous"]'),
    ).toBeTruthy();

    const unrelatedMember = document.querySelector(
      '[data-node-id="unrelated"]',
    );
    expect(unrelatedMember).toBeTruthy();
    expect(
      unrelatedMember?.querySelector('[data-status="atRiskHomozygous"]'),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// At-risk display gate (stage.showAtRiskStatuses).
//
// The genetics engine always emits the at-risk statuses + homozygous flag; the
// stage option decides whether they are drawn. When off (the default), no "?"
// glyphs appear (the homozygous override included) and the key panel drops the
// at-risk rows; when on, both reappear.
// ---------------------------------------------------------------------------
describe('NarrativePedigreeView — at-risk display gate', () => {
  it('hides the at-risk-homozygous glyph when showAtRiskStatuses is off', async () => {
    renderCousinView('sticker', false);

    await waitFor(() =>
      expect(viewMarker('[data-sticker-status]')).toBeTruthy(),
    );

    const sharedChildMember = document.querySelector(
      '[data-node-id="sharedChild"]',
    );
    expect(sharedChildMember).toBeTruthy();
    // Engine flags sharedChild atRiskHomozygous, but with the option off the
    // override glyph must not be drawn.
    expect(
      sharedChildMember?.querySelector('[data-status="atRiskHomozygous"]'),
    ).toBeNull();
  });

  it('shows the at-risk-homozygous glyph when showAtRiskStatuses is on', async () => {
    renderCousinView('sticker', true);

    await waitFor(() =>
      expect(viewMarker('[data-sticker-status]')).toBeTruthy(),
    );

    const sharedChildMember = document.querySelector(
      '[data-node-id="sharedChild"]',
    );
    expect(
      sharedChildMember?.querySelector('[data-status="atRiskHomozygous"]'),
    ).toBeTruthy();
  });

  it('drops the at-risk rows from the key panel when showAtRiskStatuses is off', async () => {
    renderCousinView('sticker', false);

    await waitFor(() =>
      expect(viewMarker('[data-sticker-status]')).toBeTruthy(),
    );

    expect(screen.queryByText('May develop this condition')).toBeNull();
    expect(screen.queryByText('May carry this condition')).toBeNull();
    expect(
      screen.queryByText(/More seriously affected|two copies/i),
    ).toBeNull();
  });

  it('lists the at-risk rows in the key panel when showAtRiskStatuses is on', async () => {
    renderCousinView('sticker', true);

    await waitFor(() =>
      expect(viewMarker('[data-sticker-status]')).toBeTruthy(),
    );

    expect(screen.getByText('May develop this condition')).toBeTruthy();
    expect(screen.getByText('May carry this condition')).toBeTruthy();
    expect(screen.getByText(/two copies/i)).toBeTruthy();
  });

  it('omits the at-risk status from the accessible description when off', async () => {
    renderCousinView('classic', false);

    await selectCondition('AR Disease');
    await waitFor(() =>
      expect(viewMarker('[data-notation-status]')).toBeTruthy(),
    );

    // cousin1 is atRiskCarrier per the engine; with the option off it must be
    // announced as status-unknown, never "At risk", and never homozygous.
    const cousin1 = focalMember('cousin1');
    expect(cousin1).toHaveAccessibleDescription(/Status unknown/);
    expect(cousin1).not.toHaveAccessibleDescription(/At risk/i);

    const sharedChild = focalMember('sharedChild');
    expect(sharedChild).not.toHaveAccessibleDescription(/homozygous/i);
  });
});

// ---------------------------------------------------------------------------
// Per-node disease-status summary exposed to assistive technology.
//
// The visual status markers (stickers / classic notation) are aria-hidden, so
// the only way a screen-reader user can learn who is affected/carrier/at-risk
// is the visually-hidden summary referenced by the focal container's
// aria-describedby. These tests assert that accessibility outcome directly via
// the computed accessible name/description rather than DOM attributes.
// ---------------------------------------------------------------------------

function focalMember(nodeId: string): HTMLElement {
  const el = document.querySelector(`[data-node-id="${nodeId}"]`);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`No focal member for node "${nodeId}"`);
  }
  return el;
}

describe('NarrativePedigreeView — per-node status summary (a11y)', () => {
  it("exposes each member's disease status via the focal container's accessible description", async () => {
    renderView();

    await waitFor(() =>
      expect(document.querySelector('[data-node-id="mother"]')).toBeTruthy(),
    );

    const mother = focalMember('mother');
    // The name conveys the focal action + person; the description conveys the
    // disease status. Mother has Disease A (autosomal dominant) → affected.
    expect(mother).toHaveAccessibleName(/^Focus on /);
    expect(mother).toHaveAccessibleDescription(/Disease A: Affected/);
  });

  it('summarises every shown disease in sticker (all-diseases) mode', async () => {
    renderView();

    await waitFor(() =>
      expect(viewMarker('[data-sticker-status]')).toBeTruthy(),
    );

    const mother = focalMember('mother');
    expect(mother).toHaveAccessibleDescription(/Disease A:/);
    expect(mother).toHaveAccessibleDescription(/Disease B:/);
  });

  it('narrows the summary to the selected disease in classic mode', async () => {
    renderView();

    await waitFor(() =>
      expect(viewMarker('[data-sticker-status]')).toBeTruthy(),
    );

    await selectCondition('Disease A');
    await waitFor(() =>
      expect(viewMarker('[data-notation-status]')).toBeTruthy(),
    );

    const mother = focalMember('mother');
    expect(mother).toHaveAccessibleDescription('Disease A: Affected');
  });

  it('references the summary via a non-aria-hidden, reachable element', async () => {
    renderView();

    await waitFor(() =>
      expect(document.querySelector('[data-node-id="mother"]')).toBeTruthy(),
    );

    const mother = focalMember('mother');
    const summaryId = mother.getAttribute('aria-describedby');
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

describe('NarrativePedigreeView — at-risk-homozygous reaches the description (a11y)', () => {
  it("includes the at-risk-homozygous note in the flagged member's accessible description", async () => {
    renderCousinView('classic');

    // Select the condition to enter classic single-disease mode.
    await selectCondition('AR Disease');

    await waitFor(() =>
      expect(viewMarker('[data-notation-status]')).toBeTruthy(),
    );

    const sharedChild = focalMember('sharedChild');
    expect(sharedChild).toHaveAccessibleDescription(
      /At risk of being affected \(homozygous\)/,
    );

    const unrelated = focalMember('unrelated');
    expect(unrelated).not.toHaveAccessibleDescription(
      /At risk of being affected \(homozygous\)/,
    );
  });
});

// An affected recessive individual trivially has two carrier parents, so
// computeAtRiskHomozygous flags them too. The visual still draws the homozygous
// override glyph, but the spoken summary must not say "Affected, at risk of
// being affected".
describe('NarrativePedigreeView — affected nodes omit the contradictory homozygous note (a11y)', () => {
  const AR2_VAR = 'ar2';
  const SRC_TRIO = 'source-fp-trio';

  function renderAffectedTrioView() {
    const trioSource = { ...sourceStage, id: SRC_TRIO };
    const trioNodes: NcNode[] = [
      makeNode('p1', { [NAME_VAR]: 'Pat', [BIO_SEX_VAR]: 'female' }),
      makeNode('p2', { [NAME_VAR]: 'Sam', [BIO_SEX_VAR]: 'male' }),
      makeNode('kid', {
        [NAME_VAR]: 'Kit',
        [BIO_SEX_VAR]: 'male',
        [AR2_VAR]: true,
      }),
    ];
    const trioEdges: NcEdge[] = [
      makeEdge('p1', 'kid'),
      makeEdge('p2', 'kid'),
      {
        [entityPrimaryKeyProperty]: 'p1-p2',
        type: EDGE_TYPE,
        from: 'p1',
        to: 'p2',
        [entityAttributesProperty]: {
          [REL_TYPE_VAR]: ['partner'],
          [IS_ACTIVE_VAR]: true,
        },
      },
    ];
    const stage: NarrativeStage = {
      id: 'np-trio',
      type: 'NarrativePedigree',
      label: 'Recessive Trio Pedigree',
      sourceStageId: SRC_TRIO,
      // The override glyph is only drawn when at-risk display is on; this test
      // exercises the a11y guard against the glyph + a contradictory spoken note.
      showAtRiskStatuses: true,
      diseases: [
        {
          id: 'ar2',
          label: 'Recessive Disease',
          color: '#ff0000',
          variable: asEntityAttributeReference(AR2_VAR),
          inheritancePattern: 'autosomalRecessive',
        },
      ],
    };
    const store = configureStore({
      reducer: { protocol, session },
      preloadedState: {
        protocol: {
          codebook,
          stages: [trioSource, stage],
          assets: [],
        } as never,
        session: {
          id: 'trio-session',
          network: {
            nodes: trioNodes,
            edges: trioEdges,
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
    return render(<NarrativePedigreeView stage={stage} />, {
      wrapper: Wrapper,
    });
  }

  it('does not append the homozygous note to an already-affected member', async () => {
    renderAffectedTrioView();

    await waitFor(() =>
      expect(document.querySelector('[data-node-id="kid"]')).toBeTruthy(),
    );

    // The single-condition node only renders once a condition is selected.
    await selectCondition('Recessive Disease');
    await waitFor(() =>
      expect(viewMarker('[data-notation-status]')).toBeTruthy(),
    );

    const kid = focalMember('kid');
    // The homozygous flag IS set (the override glyph renders) — without it this
    // test would not exercise the guard.
    expect(kid.querySelector('[data-status="atRiskHomozygous"]')).toBeTruthy();
    // ...but the spoken summary must stay coherent: affected, full stop.
    expect(kid).toHaveAccessibleDescription('Recessive Disease: Affected');
    expect(kid).not.toHaveAccessibleDescription(/homozygous/i);
  });
});
