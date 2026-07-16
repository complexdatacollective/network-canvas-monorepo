import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';

vi.mock('../../../../hooks/useStageSelector', () => ({
  useStageSelector: () => undefined,
}));

vi.mock('../../../../forms/useProtocolForm', () => ({
  default: () => ({ fieldComponents: null }),
}));

import { entityAttributesProperty } from '@codaco/shared-consts';
import type { NcEdge, NcNode } from '@codaco/shared-consts';

import { FamilyPedigreeContext } from '../../FamilyPedigreeContext';
import { createFamilyPedigreeStore, type VariableConfig } from '../../store';
import AddPersonFields from '../AddPersonForm';

const variableConfig: VariableConfig = {
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

function makeNode(id: string, label: string): NcNode {
  return {
    _uid: id,
    type: 'person',
    [entityAttributesProperty]: { label },
  };
}

function makeWrapper(nodes: Map<string, NcNode>, edges: Map<string, NcEdge>) {
  const store = createFamilyPedigreeStore(
    nodes,
    edges,
    new Map(),
    variableConfig,
    undefined,
    undefined,
    undefined,
    undefined,
    'gamete',
  );
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <FamilyPedigreeContext.Provider value={store}>
        {children}
      </FamilyPedigreeContext.Provider>
    );
  };
}

describe('AddPersonFields partner screening', () => {
  it('renders the screening RadioGroup asking if the person is already in the family tree', () => {
    // anchor: ego; cousin: exists but not first-degree relative of ego
    const nodes = new Map([
      ['ego', makeNode('ego', 'Ego')],
      ['parent1', makeNode('parent1', 'Parent One')],
      ['cousin', makeNode('cousin', 'Cousin')],
    ]);
    // ego's parent is parent1; cousin is child of parent1's sibling (no direct edge to ego)
    const edges = new Map<string, NcEdge>();

    const Wrapper = makeWrapper(nodes, edges);

    render(
      <Wrapper>
        <Form onSubmit={() => ({ success: true })}>
          <AddPersonFields
            anchorNodeId="ego"
            nodes={nodes}
            edges={edges}
            variableConfig={variableConfig}
          />
        </Form>
      </Wrapper>,
    );

    expect(
      screen.getByText(/Is this person already in your family tree/i),
    ).toBeTruthy();
  });

  it('selecting "existing" shows the person picker with the cousin and hides PersonFields', async () => {
    const nodes = new Map([
      ['ego', makeNode('ego', 'Ego')],
      ['cousin', makeNode('cousin', 'Cousin')],
    ]);
    const edges = new Map<string, NcEdge>();

    const Wrapper = makeWrapper(nodes, edges);

    render(
      <Wrapper>
        <Form onSubmit={() => ({ success: true })}>
          <AddPersonFields
            anchorNodeId="ego"
            nodes={nodes}
            edges={edges}
            variableConfig={variableConfig}
          />
        </Form>
      </Wrapper>,
    );

    // Initially "No — add a new person" is selected (default), so PersonFields name input is visible
    expect(screen.getByRole('textbox', { name: /name/i })).toBeTruthy();

    // Click the "existing" option
    const existingRadio = screen.getByRole('radio', {
      name: /Yes — already in the family tree/i,
    });
    fireEvent.click(existingRadio);

    // Wait for FieldGroup to show the existing picker
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Cousin' })).toBeTruthy();
    });

    // PersonFields (name input) should no longer be visible
    expect(screen.queryByRole('textbox', { name: /name/i })).toBeNull();
  });

  it('selecting "new" after "existing" hides the picker and shows PersonFields', async () => {
    const nodes = new Map([
      ['ego', makeNode('ego', 'Ego')],
      ['cousin', makeNode('cousin', 'Cousin')],
    ]);
    const edges = new Map<string, NcEdge>();

    const Wrapper = makeWrapper(nodes, edges);

    render(
      <Wrapper>
        <Form onSubmit={() => ({ success: true })}>
          <AddPersonFields
            anchorNodeId="ego"
            nodes={nodes}
            edges={edges}
            variableConfig={variableConfig}
          />
        </Form>
      </Wrapper>,
    );

    // Click "existing"
    fireEvent.click(
      screen.getByRole('radio', { name: /Yes — already in the family tree/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Cousin' })).toBeTruthy();
    });

    // Click "new" to switch back
    fireEvent.click(
      screen.getByRole('radio', { name: /No — add a new person/i }),
    );

    // PersonFields name input should be visible again
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /name/i })).toBeTruthy();
    });

    // Picker (Cousin radio) should be gone
    expect(screen.queryByRole('radio', { name: 'Cousin' })).toBeNull();
  });

  it('does not offer "existing" when there are no eligible candidates', () => {
    const nodes = new Map([['ego', makeNode('ego', 'Ego')]]);
    const edges = new Map<string, NcEdge>();

    const Wrapper = makeWrapper(nodes, edges);

    render(
      <Wrapper>
        <Form onSubmit={() => ({ success: true })}>
          <AddPersonFields
            anchorNodeId="ego"
            nodes={nodes}
            edges={edges}
            variableConfig={variableConfig}
          />
        </Form>
      </Wrapper>,
    );

    // With no candidates the "existing" option must not appear in the screening prompt
    expect(
      screen.queryByRole('radio', {
        name: /Yes — already in the family tree/i,
      }),
    ).toBeNull();
    // Only "new" is offered
    expect(
      screen.getByRole('radio', { name: /No — add a new person/i }),
    ).toBeTruthy();
  });

  it('keeps the current/ex field visible in the existing branch', async () => {
    const nodes = new Map([
      ['ego', makeNode('ego', 'Ego')],
      ['cousin', makeNode('cousin', 'Cousin')],
    ]);
    const edges = new Map<string, NcEdge>();

    const Wrapper = makeWrapper(nodes, edges);

    render(
      <Wrapper>
        <Form onSubmit={() => ({ success: true })}>
          <AddPersonFields
            anchorNodeId="ego"
            nodes={nodes}
            edges={edges}
            variableConfig={variableConfig}
          />
        </Form>
      </Wrapper>,
    );

    fireEvent.click(
      screen.getByRole('radio', { name: /Yes — already in the family tree/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Are they a current or ex partner/i),
      ).toBeTruthy();
    });
  });
});
