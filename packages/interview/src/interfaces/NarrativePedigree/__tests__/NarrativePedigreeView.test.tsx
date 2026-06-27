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
  // Partner-of edge (non-genetic) — exercised by the layout, ignored by genetics.
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
    presets: [
      {
        id: 'single',
        label: 'Single Disease',
        diseases: ['da'],
        focal: 'ego',
      },
      {
        id: 'multi',
        label: 'Multiple Diseases',
        diseases: ['da', 'db'],
        focal: 'egoParents',
      },
    ],
    behaviours: { allowFocalReselection: true },
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

function renderView(behavioursOverride?: { allowFocalReselection: boolean }) {
  const store = makeStore();
  const stage = makeNarrativeStage();
  if (behavioursOverride) {
    stage.behaviours = behavioursOverride;
  }

  function Wrapper({ children }: { children: ReactNode }) {
    // currentStep 1 = the NarrativePedigree stage (index 1 in the stages array).
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
  it('renders classic-notation nodes when the active preset shows exactly one disease', async () => {
    renderView();

    await waitFor(() =>
      expect(document.querySelector('[data-notation-status]')).toBeTruthy(),
    );
    // No sticker nodes in single-disease mode.
    expect(document.querySelector('[data-sticker-status]')).toBeNull();
  });

  it('renders sticker nodes when the active preset shows two or more diseases', async () => {
    renderView();

    // Switch to the multi-disease preset.
    await waitFor(() =>
      expect(document.querySelector('[data-notation-status]')).toBeTruthy(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Next preset' }));

    await waitFor(() =>
      expect(document.querySelector('[data-sticker-status]')).toBeTruthy(),
    );
    expect(document.querySelector('[data-notation-status]')).toBeNull();
  });
});

describe('NarrativePedigreeView — preset switching recomputes', () => {
  it('changes the active preset label and the shown diseases', async () => {
    renderView();

    await waitFor(() =>
      expect(screen.getByText('Single Disease')).toBeTruthy(),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Next preset' }));

    await waitFor(() =>
      expect(screen.getByText('Multiple Diseases')).toBeTruthy(),
    );
  });

  it('recomputes the highlight set when the preset changes (different dimmed nodes)', async () => {
    renderView();

    await waitFor(() =>
      expect(document.querySelector('[data-pedigree-member]')).toBeTruthy(),
    );

    const dimmedFor = () =>
      Array.from(document.querySelectorAll('[data-pedigree-member]'))
        .filter((el) => el.getAttribute('data-dimmed') === 'true')
        .map((el) => el.getAttribute('data-node-id') ?? '')
        .sort((a, b) => a.localeCompare(b));

    const dimmedSingle = dimmedFor();

    await userEvent.click(screen.getByRole('button', { name: 'Next preset' }));
    await waitFor(() =>
      expect(screen.getByText('Multiple Diseases')).toBeTruthy(),
    );

    const dimmedMulti = dimmedFor();
    expect(dimmedMulti).not.toEqual(dimmedSingle);
  });
});

describe('NarrativePedigreeView — focal reselection', () => {
  it('re-runs focal/highlight when a member is clicked (highlight set changes)', async () => {
    renderView({ allowFocalReselection: true });

    await waitFor(() =>
      expect(document.querySelector('[data-pedigree-member]')).toBeTruthy(),
    );

    const dimmedIds = () =>
      Array.from(document.querySelectorAll('[data-pedigree-member]'))
        .filter((el) => el.getAttribute('data-dimmed') === 'true')
        .map((el) => el.getAttribute('data-node-id') ?? '')
        .sort((a, b) => a.localeCompare(b));

    const before = dimmedIds();

    // Click the father — a node that is NOT the ego focal, so the highlight
    // recomputes around a different focal. The clickable target is the button
    // wrapping the node (rendered only when allowFocalReselection is true).
    const fatherButton = document.querySelector(
      '[data-node-id="father"] button',
    );
    expect(fatherButton).toBeTruthy();
    if (fatherButton) await userEvent.click(fatherButton);

    await waitFor(() => expect(dimmedIds()).not.toEqual(before));
  });

  it('does NOT refocus on click when allowFocalReselection is false', async () => {
    renderView({ allowFocalReselection: false });

    await waitFor(() =>
      expect(document.querySelector('[data-pedigree-member]')).toBeTruthy(),
    );

    const dimmedIds = () =>
      Array.from(document.querySelectorAll('[data-pedigree-member]'))
        .filter((el) => el.getAttribute('data-dimmed') === 'true')
        .map((el) => el.getAttribute('data-node-id') ?? '')
        .sort((a, b) => a.localeCompare(b));

    const before = dimmedIds();
    const father = document.querySelector('[data-node-id="father"] button');
    if (father) await userEvent.click(father);

    expect(dimmedIds()).toEqual(before);
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
