/**
 * The person editor rendered for real, in the nesting the app actually uses.
 *
 * `openDialog` is imperative: DialogProvider stores the element and renders it
 * from its OWN subtree, a sibling of the stage tree — and DialogProvider is
 * mounted above the stage (Shell.tsx), so `FamilyPedigreeProvider` is its
 * descendant and the pedigree store context does not reach dialog content.
 * That is issue #1390: `handleEdit` shipped its `PersonFields` without the
 * bridge every other pedigree dialog carries, and `PersonNameField`'s
 * `useFamilyPedigreeStore` threw straight past the stage error boundary.
 *
 * The sibling PedigreeView.test.tsx cannot catch this: its `useDialog` mock is
 * file-scoped and hoisted (no per-test opt-out), and it stubs `PersonFields` to
 * `() => null`, so the provider crossing never happens. Hence this separate
 * file, which builds the real stack — react-redux Provider, then
 * DialogProvider, then the pedigree store — and renders the real fields.
 */
import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MouseEventHandler, ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { entityAttributesProperty } from '@codaco/shared-consts';
import type { NcNode } from '@codaco/shared-consts';

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
//
// NOTE what is deliberately NOT mocked: `useDialog`/DialogProvider (the whole
// point is the real dialog subtree) and `PersonFields`/`PersonNameField` (the
// components that read the pedigree store). Only the Redux-backed selector
// modules are stubbed, exactly as PersonNameField.test.tsx stubs them.
// -----------------------------------------------------------------------
const fixtures = vi.hoisted(() => {
  const codebook = {
    ego: { variables: {} },
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: {
          label: {
            name: 'label',
            type: 'text' as const,
            component: 'Text' as const,
            validation: { unique: true },
          },
        },
      },
    },
    edge: {},
  };

  return {
    codebook,
    validationContext: {
      codebook,
      network: {
        ego: { attributes: {} },
        nodes: [] as NcNode[],
        edges: [],
      },
      stageSubject: null,
    },
  };
});

vi.mock('../../../utils/nodeUtils', () => ({
  getNodeTypeKey: () => 'person',
  getNodeType: () => 'person',
  getNodeLabelVariable: () => 'label',
  getEgoVariable: () => 'isEgo',
  getRelationshipVariable: () => 'relationship',
  getBiologicalSexVariable: () => 'biologicalSex',
  getResolvedNodeFormFields: () => [],
  getNodeForm: () => null,
  getNodeShapeDefinition: () => null,
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

vi.mock('../../../../../hooks/useStageSelector', () => ({
  useStageSelector: (selector: () => unknown) => selector(),
}));

vi.mock('../../../../../store/modules/protocol', () => ({
  getCodebook: () => fixtures.codebook,
  getProtocol: () => ({}),
  getShouldEncryptNames: () => false,
  getStages: () => [],
  getAssetManifest: () => ({}),
  default: (state = {}) => state,
}));

vi.mock('../../../../../selectors/protocol', () => ({
  getCodebookVariablesForSubjectType: () => ({}),
}));

// `getValidationContext` is an RTK selector chain; replace it with a plain
// getter the stubbed `useStageSelector` can call. `selectFieldMetadataWithSubject`
// would read real Redux state, so it returns null and the caller falls back to
// its no-fields path. Everything else — including the validation-rule
// resolution PersonNameField depends on — stays real.
vi.mock('../../../../../selectors/forms', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../../selectors/forms')>();
  return {
    ...actual,
    getValidationContext: () => fixtures.validationContext,
    selectFieldMetadataWithSubject: () => null,
  };
});

// Stub fresco-ui/Node to a plain button so useNodeMeasurement has something to
// measure and NodeContextMenu's trigger has a DOM element to attach to.
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
  computeNodeDisplayLabels: (nodes: Map<string, unknown>) =>
    new Map([...nodes.keys()].map((id) => [id, id])),
  AdoptionBrackets: ({ children }: { children: ReactNode }) => <>{children}</>,
  EgoIcon: () => null,
}));

import PedigreeView from '../PedigreeView';

// -----------------------------------------------------------------------
// Fixtures
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

const reduxStore = configureStore({ reducer: () => ({}) });

function renderPedigree() {
  const nodes = new Map([
    ['ego', makeNode('ego', true)],
    ['person', makeNode('person')],
  ]);
  const pedigreeStore = createFamilyPedigreeStore(
    nodes,
    new Map(),
    new Map(),
    VAR_CONFIG,
    undefined,
    undefined,
    undefined,
    undefined,
    'gamete',
  );

  render(
    // The nesting under test: DialogProvider OUTSIDE the pedigree store, the
    // way Shell.tsx mounts them.
    <Provider store={reduxStore}>
      <DialogProvider>
        <FamilyPedigreeContext.Provider value={pedigreeStore}>
          <PedigreeView />
        </FamilyPedigreeContext.Provider>
      </DialogProvider>
    </Provider>,
  );

  return { pedigreeStore };
}

async function openEditDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByText('person'));
  await user.click(await screen.findByTestId('pedigree-menu-edit'));
}

describe('PedigreeView — person editor dialog', () => {
  it('renders the real person fields inside the dialog (issue #1390)', async () => {
    const user = userEvent.setup();
    renderPedigree();

    await openEditDialog(user);

    // Reaching this at all means PersonNameField resolved the pedigree store
    // from inside DialogProvider's subtree.
    expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue(
      'person',
    );
  });

  it('validates the name against the in-progress pedigree, not just the interview network', async () => {
    const user = userEvent.setup();
    renderPedigree();

    await openEditDialog(user);

    const nameField = await screen.findByRole('textbox', { name: 'Name' });
    await user.clear(nameField);
    // 'ego' exists only in the pedigree's own store — the interview network in
    // the validation context is empty — so a uniqueness complaint proves the
    // bridged store is the one the field is reading.
    await user.type(nameField, 'ego');
    await user.click(screen.getByTestId('dialog-submit'));

    expect(await screen.findByTestId('name-field-error')).toHaveTextContent(
      /must be unique/i,
    );
  });

  it('saves the edited person and announces the change', async () => {
    const user = userEvent.setup();
    const { pedigreeStore } = renderPedigree();

    await openEditDialog(user);

    const nameField = await screen.findByRole('textbox', { name: 'Name' });
    await user.clear(nameField);
    await user.type(nameField, 'Edited Person');
    await user.click(screen.getByTestId('dialog-submit'));

    await vi.waitFor(() => {
      expect(
        pedigreeStore.getState().network.nodes.get('person')?.[
          entityAttributesProperty
        ].label,
      ).toBe('Edited Person');
    });

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Details updated for Edited Person.',
    );
  });
});
