import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MouseEventHandler, ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { entityAttributesProperty } from '@codaco/shared-consts';
import type { NcEdge, NcNode } from '@codaco/shared-consts';

import { FamilyPedigreeContext } from '../../../FamilyPedigreeContext';
import { createFamilyPedigreeStore, type VariableConfig } from '../../../store';

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
type ConfirmOptions = {
  onConfirm: (signal: AbortSignal) => void | Promise<void>;
};
const mockConfirm = vi.fn<(args: ConfirmOptions) => Promise<boolean | null>>();

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ confirm: mockConfirm, openDialog: mockOpenDialog }),
}));

// nodeUtils and edgeUtils export RTK createSelector chains that depend on Redux
// slice selectors. Mock them entirely so no Redux store context is needed.
vi.mock('../../../utils/nodeUtils', () => ({
  getNodeTypeKey: () => 'person',
  getNodeType: () => 'person',
  getNodeLabelVariable: () => 'label',
  getEgoVariable: () => 'isEgo',
  getRelationshipVariable: () => 'relationship',
  getBiologicalSexVariable: () => 'biologicalSex',
  getResolvedNodeFormFields: () => [
    { variableId: 'partnerships' },
    { variableId: 'emptyText' },
    { variableId: 'emptySelection' },
  ],
  getNodeShapeDefinition: () => null,
  getNodeForm: () => null,
  getNodeColorSelector: () => 'node-color-seq-1',
}));

vi.mock('../../../utils/edgeUtils', () => ({
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
vi.mock('../../../../../hooks/useStageSelector', () => ({
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
vi.mock('../../../components/AddPersonForm', () => ({
  default: () => null,
}));

// Stub wizard openers — they pull in wizard step components with Redux selectors.
vi.mock('../../../components/wizards/AddChildWizard', () => ({
  openAddChildWizard: vi.fn(),
}));
vi.mock('../../../components/wizards/AddParentWizard', () => ({
  openAddParentWizard: vi.fn(),
}));
vi.mock('../../../components/wizards/AddSiblingWizard', () => ({
  openAddSiblingWizard: vi.fn(),
}));
vi.mock('../../../components/wizards/DefineParentsWizard', () => ({
  openDefineParentsWizard: vi.fn(),
}));
vi.mock('../../../components/wizards/parentTypeOptions', () => ({
  addableParentTypeOptions: () => [],
  countGeneticParents: () => 0,
}));

// PersonFields also pulls in Redux via useStageSelector; stub it.
vi.mock('../../../components/quickStartWizard/PersonFields', () => ({
  default: () => null,
}));

// The store modules (protocol, session) export RTK slice selectors that call
// selectSlice at runtime. Mock the whole modules with stub selectors so
// anything imported transitively (selectors/session, selectors/protocol, etc.)
// doesn't trigger "selectSlice returned undefined".
vi.mock('../../../../../store/modules/protocol', () => ({
  getCodebook: () => ({}),
  getProtocol: () => ({}),
  getShouldEncryptNames: () => false,
  getStages: () => [],
  getAssetManifest: () => ({}),
  default: (state = {}) => state,
}));

vi.mock('../../../../../store/modules/session', () => ({
  addNode: vi.fn(),
  addEdge: vi.fn(),
  deleteNode: vi.fn(),
  updateEdge: vi.fn(),
  updateStageMetadata: vi.fn(),
  default: (state = {}) => state,
}));

// PedigreeNode uses Redux selectors (getNodeColorSelector, getNodeShapeDefinition)
// via useStageSelector. Stub it with a button that forwards all props so
// BaseUI's DropdownMenuTrigger (render=) can inject its click handler.
vi.mock('../PedigreeNode', () => ({
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
  AdoptionBrackets: ({ children }: { children: ReactNode }) => <>{children}</>,
  EgoIcon: () => null,
}));

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

function makeEdge(
  id: string,
  from: string,
  to: string,
  isActive: boolean,
): NcEdge {
  return {
    _uid: id,
    type: 'family',
    from,
    to,
    [entityAttributesProperty]: {
      relationshipType: ['partner'],
      isActive,
    },
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
  mockConfirm.mockReset();
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

describe('PedigreeView — person menu actions', () => {
  it('asks for confirmation before deleting a person', async () => {
    const nodes = new Map([
      ['ego', makeNode('ego', true)],
      ['person', makeNode('person')],
    ]);
    const store = makeStore(nodes);
    const removeNodeSpy = vi.spyOn(store.getState(), 'removeNode');
    mockConfirm.mockResolvedValueOnce(false);

    render(
      <Wrapper store={store}>
        <PedigreeView overrideNodes={nodes} overrideEdges={new Map()} />
      </Wrapper>,
    );

    await userEvent.click(await screen.findByText('person'));
    await act(async () => {
      await userEvent.click(await screen.findByText('Delete'));
    });

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(removeNodeSpy).not.toHaveBeenCalled();
    expect(store.getState().network.nodes.has('person')).toBe(true);
  });

  it('deletes the person only after the confirmation is accepted', async () => {
    const nodes = new Map([
      ['ego', makeNode('ego', true)],
      ['person', makeNode('person')],
    ]);
    const store = makeStore(nodes);
    mockConfirm.mockImplementationOnce(async ({ onConfirm }) => {
      await onConfirm(new AbortController().signal);
      return true;
    });

    render(
      <Wrapper store={store}>
        <PedigreeView overrideNodes={nodes} overrideEdges={new Map()} />
      </Wrapper>,
    );

    await userEvent.click(await screen.findByText('person'));
    await act(async () => {
      await userEvent.click(await screen.findByText('Delete'));
    });

    expect(store.getState().network.nodes.has('person')).toBe(false);
  });

  it('updates biological sex and current/ex status from the edit dialog', async () => {
    const person = makeNode('person');
    person[entityAttributesProperty].biologicalSex = ['female'];
    const nodes = new Map([
      ['ego', makeNode('ego', true)],
      ['person', person],
    ]);
    const edges = new Map([
      ['partnership', makeEdge('partnership', 'ego', 'person', true)],
    ]);
    const store = makeStore(nodes, edges);
    mockOpenDialog.mockResolvedValueOnce({
      name: 'Edited Person',
      biologicalSex: 'male',
      partnerships: ['participant-answer'],
      __familyPedigreeEdit: {
        partnerships: [{ id: 'partnership', value: 'ex' }],
      },
    });

    render(
      <Wrapper store={store}>
        <PedigreeView overrideNodes={nodes} overrideEdges={edges} />
      </Wrapper>,
    );

    await userEvent.click(await screen.findByText('person'));
    await act(async () => {
      await userEvent.click(await screen.findByText('Edit'));
    });

    expect(
      store.getState().network.nodes.get('person')?.[entityAttributesProperty]
        .biologicalSex,
    ).toEqual(['male']);
    expect(
      store.getState().network.nodes.get('person')?.[entityAttributesProperty]
        .partnerships,
    ).toEqual(['participant-answer']);
    expect(
      store.getState().network.edges.get('partnership')?.[
        entityAttributesProperty
      ].isActive,
    ).toBe(false);
  });

  it('clears mounted custom fields while preserving unrelated and defined empty attributes', async () => {
    const person = makeNode('person');
    person[entityAttributesProperty] = {
      ...person[entityAttributesProperty],
      biologicalSex: ['female'],
      partnerships: ['old-answer'],
      outsideForm: 'keep me',
    };
    const nodes = new Map([
      ['ego', makeNode('ego', true)],
      ['person', person],
    ]);
    const store = makeStore(nodes);
    mockOpenDialog.mockResolvedValueOnce({
      name: 'Edited Person',
      biologicalSex: undefined,
      partnerships: undefined,
      emptyText: '',
      emptySelection: [],
    });

    render(
      <Wrapper store={store}>
        <PedigreeView overrideNodes={nodes} overrideEdges={new Map()} />
      </Wrapper>,
    );

    await userEvent.click(await screen.findByText('person'));
    await act(async () => {
      await userEvent.click(await screen.findByText('Edit'));
    });

    const attributes = store.getState().network.nodes.get('person')?.[
      entityAttributesProperty
    ];
    expect(attributes).not.toHaveProperty('partnerships');
    expect(attributes).not.toHaveProperty('biologicalSex');
    expect(attributes?.outsideForm).toBe('keep me');
    expect(attributes?.emptyText).toBe('');
    expect(attributes?.emptySelection).toEqual([]);
  });

  it('rejects invalid defined custom values without partially mutating the person or partnerships', async () => {
    const person = makeNode('person');
    person[entityAttributesProperty] = {
      ...person[entityAttributesProperty],
      biologicalSex: ['female'],
      partnerships: ['old-answer'],
      outsideForm: 'keep me',
    };
    const nodes = new Map([
      ['ego', makeNode('ego', true)],
      ['person', person],
    ]);
    const edges = new Map([
      ['partnership', makeEdge('partnership', 'ego', 'person', true)],
    ]);
    const store = makeStore(nodes, edges);
    const updateNodeSpy = vi.spyOn(store.getState(), 'updateNode');
    const updateEdgeSpy = vi.spyOn(store.getState(), 'updateEdge');
    mockOpenDialog.mockResolvedValueOnce({
      name: 'Edited Person',
      biologicalSex: 'male',
      partnerships: { invalid: true },
      emptyText: 'new value',
      __familyPedigreeEdit: {
        partnerships: [{ id: 'partnership', value: 'ex' }],
      },
    });

    render(
      <Wrapper store={store}>
        <PedigreeView overrideNodes={nodes} overrideEdges={edges} />
      </Wrapper>,
    );

    await userEvent.click(await screen.findByText('person'));
    await act(async () => {
      await userEvent.click(await screen.findByText('Edit'));
    });

    expect(updateNodeSpy).not.toHaveBeenCalled();
    expect(updateEdgeSpy).not.toHaveBeenCalled();
    expect(
      store.getState().network.nodes.get('person')?.[entityAttributesProperty],
    ).toEqual({
      label: 'person',
      isEgo: false,
      biologicalSex: ['female'],
      partnerships: ['old-answer'],
      outsideForm: 'keep me',
    });
    expect(
      store.getState().network.edges.get('partnership')?.[
        entityAttributesProperty
      ].isActive,
    ).toBe(true);
  });

  it('shows each partnership with its current status in the edit dialog', async () => {
    const nodes = new Map([
      ['ego', makeNode('ego', true)],
      ['person', makeNode('person')],
      ['current-partner', makeNode('current-partner')],
      ['ex-partner', makeNode('ex-partner')],
    ]);
    const edges = new Map([
      [
        'current-partnership',
        makeEdge('current-partnership', 'person', 'current-partner', true),
      ],
      [
        'ex-partnership',
        makeEdge('ex-partnership', 'ex-partner', 'person', false),
      ],
    ]);
    const store = makeStore(nodes, edges);
    let dialogChildren: ReactNode = null;
    mockOpenDialog.mockImplementationOnce(async (args) => {
      dialogChildren = (args as { children: ReactNode }).children;
      return null;
    });

    render(
      <Wrapper store={store}>
        <PedigreeView overrideNodes={nodes} overrideEdges={edges} />
      </Wrapper>,
    );

    await userEvent.click(await screen.findByText('person'));
    await act(async () => {
      await userEvent.click(await screen.findByText('Edit'));
    });

    render(<Form onSubmit={() => ({ success: true })}>{dialogChildren}</Form>);

    const currentOptions = screen.getAllByRole('radio', {
      name: 'Current partner',
    });
    const exOptions = screen.getAllByRole('radio', { name: 'Ex-partner' });
    expect(currentOptions).toHaveLength(2);
    expect(exOptions).toHaveLength(2);
    expect(currentOptions[0]).toBeChecked();
    expect(exOptions[0]).not.toBeChecked();
    expect(currentOptions[1]).not.toBeChecked();
    expect(exOptions[1]).toBeChecked();
  });
});
