import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MouseEventHandler, ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { entityAttributesProperty } from '@codaco/shared-consts';
import type { NcEdge, NcNode } from '@codaco/shared-consts';
import { FamilyPedigreeContext } from '~/interfaces/FamilyPedigree/FamilyPedigreeContext';
import {
  createFamilyPedigreeStore,
  type VariableConfig,
} from '~/interfaces/FamilyPedigree/store';

// -----------------------------------------------------------------------
// ResizeObserver stub — jsdom lacks it; useNodeMeasurement needs it.
// -----------------------------------------------------------------------
type StubEntry = Pick<ResizeObserverEntry, 'target' | 'contentRect'>;
type StubCallback = (
  entries: StubEntry[],
  observer: StubResizeObserver,
) => void;

const MEASURED_SIZE = 96;
class StubResizeObserver {
  callback: StubCallback;
  constructor(callback: StubCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: {
            width: MEASURED_SIZE,
            height: MEASURED_SIZE,
            top: 0,
            left: 0,
            bottom: MEASURED_SIZE,
            right: MEASURED_SIZE,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          },
        },
      ],
      this,
    );
  }
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
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

// -----------------------------------------------------------------------
// Module mocks
// -----------------------------------------------------------------------

const mockOpenDialog =
  vi.fn<(args: unknown) => Promise<Record<string, unknown> | null>>();

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ openDialog: mockOpenDialog }),
}));

// nodeUtils and edgeUtils export RTK createSelector chains that depend on Redux
// slice selectors. Mock them entirely so no Redux store context is needed.
vi.mock('~/interfaces/FamilyPedigree/utils/nodeUtils', () => ({
  getNodeTypeKey: () => 'person',
  getNodeType: () => 'person',
  getNodeLabelVariable: () => 'label',
  getEgoVariable: () => 'isEgo',
  getRelationshipVariable: () => 'relationship',
  getBiologicalSexVariable: () => 'biologicalSex',
  getResolvedNodeFormFields: () => [],
  getNodeShapeDefinition: () => null,
  getNodeForm: () => null,
  getNodeColorSelector: () => 'node-color-seq-1',
}));

vi.mock('~/interfaces/FamilyPedigree/utils/edgeUtils', () => ({
  getEdgeTypeKey: () => 'family',
  getRelationshipTypeVariable: () => 'relationshipType',
  getIsActiveVariable: () => 'isActive',
  getIsGestationalCarrierVariable: () => 'isGestationalCarrier',
  getGameteRoleVariable: () => 'gameteRole',
  getEdgeRelationshipType: (
    edge: { attributes: Record<string, unknown> },
    varKey: string,
  ) => {
    const v = edge.attributes[varKey];
    return Array.isArray(v) ? v[0] : undefined;
  },
}));

// useStageSelector wraps useSelector + useCurrentStep; stub it to call the
// mocked selector functions (which return constant strings, not RTK state).
vi.mock('~/hooks/useStageSelector', () => ({
  useStageSelector: (selector: () => unknown) => selector(),
}));

// Stub fresco-ui/Node to a plain button so NodeContextMenu's DropdownMenuTrigger
// has a DOM element to attach to and the node is clickable.
vi.mock('@codaco/fresco-ui/Node', () => ({
  default: function NodeStub(props: {
    label?: string;
    ariaLabel?: string;
    onClick?: MouseEventHandler<HTMLButtonElement>;
    children?: ReactNode;
  }) {
    return (
      <button
        type="button"
        aria-label={props.ariaLabel}
        onClick={props.onClick}
      >
        {props.label}
        {props.children}
      </button>
    );
  },
}));

// Stub AddPersonFields — dialog content is irrelevant to the routing test.
vi.mock('~/interfaces/FamilyPedigree/components/AddPersonForm', () => ({
  default: () => null,
}));

// Stub wizard openers — they pull in wizard step components with Redux selectors.
vi.mock(
  '~/interfaces/FamilyPedigree/components/wizards/AddChildWizard',
  () => ({
    openAddChildWizard: vi.fn(),
  }),
);
vi.mock(
  '~/interfaces/FamilyPedigree/components/wizards/AddParentWizard',
  () => ({ openAddParentWizard: vi.fn() }),
);
vi.mock(
  '~/interfaces/FamilyPedigree/components/wizards/AddSiblingWizard',
  () => ({ openAddSiblingWizard: vi.fn() }),
);
vi.mock(
  '~/interfaces/FamilyPedigree/components/wizards/DefineParentsWizard',
  () => ({ openDefineParentsWizard: vi.fn() }),
);
vi.mock(
  '~/interfaces/FamilyPedigree/components/wizards/parentTypeOptions',
  () => ({
    addableParentTypeOptions: () => [],
    countGeneticParents: () => 0,
  }),
);

// PersonFields also pulls in Redux via useStageSelector; stub it.
vi.mock(
  '~/interfaces/FamilyPedigree/components/quickStartWizard/PersonFields',
  () => ({ default: () => null }),
);

// The store modules (protocol, session) export RTK slice selectors that call
// selectSlice at runtime. Mock the whole modules with stub selectors so
// anything imported transitively (selectors/session, selectors/protocol, etc.)
// doesn't trigger "selectSlice returned undefined".
vi.mock('~/store/modules/protocol', () => ({
  getCodebook: () => ({}),
  getProtocol: () => ({}),
  getShouldEncryptNames: () => false,
  getStages: () => [],
  getAssetManifest: () => ({}),
  default: (state = {}) => state,
}));

vi.mock('~/store/modules/session', () => ({
  addNode: vi.fn(),
  addEdge: vi.fn(),
  deleteNode: vi.fn(),
  updateStageMetadata: vi.fn(),
  default: (state = {}) => state,
}));

// PedigreeNode uses Redux selectors (getNodeColorSelector, getNodeShapeDefinition)
// via useStageSelector. Stub it with a button that forwards all props so
// BaseUI's DropdownMenuTrigger (render=) can inject its click handler.
vi.mock(
  '~/interfaces/FamilyPedigree/pedigree-layout/components/PedigreeNode',
  () => ({
    default: function PedigreeNodeStub({
      node,
      ...rest
    }: {
      node: { id: string };
      displayLabel: string;
      [key: string]: unknown;
    }) {
      return (
        <button type="button" data-node-id={node.id} {...rest}>
          {node.id}
        </button>
      );
    },
    // Return id → id labels so PedigreeView passes the node id as displayLabel.
    computeNodeDisplayLabels: (nodes: Map<string, unknown>) =>
      new Map([...nodes.keys()].map((id) => [id, id])),
    AdoptionBrackets: ({ children }: { children: ReactNode }) => (
      <>{children}</>
    ),
    EgoIcon: () => null,
  }),
);

// -----------------------------------------------------------------------
// Import component under test (after all mocks are registered)
// -----------------------------------------------------------------------
import PedigreeView from '../PedigreeView';

// -----------------------------------------------------------------------
// Fixture helpers
// -----------------------------------------------------------------------
const VAR_CONFIG: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'label',
  egoVariable: 'isEgo',
  relationshipVariable: 'relationship',
  relationshipTypeVariable: 'relationshipType',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGestationalCarrier',
  gameteRoleVariable: 'gameteRole',
  biologicalSexVariable: 'biologicalSex',
};

function makeNode(id: string, isEgo = false): NcNode {
  return {
    _uid: id,
    type: 'person',
    [entityAttributesProperty]: { label: id, isEgo },
  };
}

function makeStore(
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge> = new Map(),
) {
  return createFamilyPedigreeStore(
    nodes,
    edges,
    new Map(),
    VAR_CONFIG,
    undefined,
    undefined,
    undefined,
    undefined,
    'gamete',
  );
}

function Wrapper({
  store,
  children,
}: {
  store: ReturnType<typeof createFamilyPedigreeStore>;
  children: ReactNode;
}) {
  return (
    <FamilyPedigreeContext.Provider value={store}>
      {children}
    </FamilyPedigreeContext.Provider>
  );
}

afterEach(() => {
  mockOpenDialog.mockReset();
});

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('PedigreeView — handleAddPerson routing', () => {
  it('existing-partner path: calls addEdge once and never addNode', async () => {
    const nodes = new Map([
      ['ego', makeNode('ego', true)],
      ['cousin', makeNode('cousin')],
    ]);
    const store = makeStore(nodes);

    const addNodeSpy = vi.spyOn(store.getState(), 'addNode');
    const addEdgeSpy = vi.spyOn(store.getState(), 'addEdge');

    mockOpenDialog.mockResolvedValueOnce({
      partnerType: 'existing',
      existingPartnerId: 'cousin',
      current: 'current',
    });

    render(
      <Wrapper store={store}>
        <PedigreeView overrideNodes={nodes} overrideEdges={new Map()} />
      </Wrapper>,
    );

    // Open the context menu for the ego node and trigger "Add partner".
    // PedigreeNodeStub renders <button data-node-id="ego">ego</button>.
    // NodeContextMenu wraps it with a DropdownMenuTrigger; clicking opens
    // the menu and exposes the "Add partner" item.
    const egoButton = await screen.findByText('ego');
    await userEvent.click(egoButton);

    const addPartnerItem = await screen.findByText('Add partner');
    await act(async () => {
      await userEvent.click(addPartnerItem);
    });

    expect(addNodeSpy).not.toHaveBeenCalled();
    expect(addEdgeSpy).toHaveBeenCalledTimes(1);

    const call = addEdgeSpy.mock.calls[0];
    if (!call) throw new Error('expected addEdge to have been called');
    const [callArg] = call;
    expect(callArg.from).toBe('ego');
    expect(callArg.to).toBe('cousin');
    expect(callArg.attributes[VAR_CONFIG.relationshipTypeVariable]).toEqual([
      'partner',
    ]);
    expect(callArg.attributes[VAR_CONFIG.isActiveVariable]).toBe(true);
  });

  it('new-partner path: calls addNode then addEdge (existing behaviour preserved)', async () => {
    const nodes = new Map([['ego', makeNode('ego', true)]]);
    const store = makeStore(nodes);

    const addNodeSpy = vi.spyOn(store.getState(), 'addNode');
    const addEdgeSpy = vi.spyOn(store.getState(), 'addEdge');

    mockOpenDialog.mockResolvedValueOnce({
      partnerType: 'new',
      name: 'New Partner',
      current: 'current',
    });

    render(
      <Wrapper store={store}>
        <PedigreeView overrideNodes={nodes} overrideEdges={new Map()} />
      </Wrapper>,
    );

    const egoButton = await screen.findByText('ego');
    await userEvent.click(egoButton);

    const addPartnerItem = await screen.findByText('Add partner');
    await act(async () => {
      await userEvent.click(addPartnerItem);
    });

    expect(addNodeSpy).toHaveBeenCalledTimes(1);
    expect(addEdgeSpy).toHaveBeenCalledTimes(1);
  });
});
