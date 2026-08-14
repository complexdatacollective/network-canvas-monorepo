import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';

// The picker's own rendering is covered by VariablePicker's tests and by
// DiseaseFields.test.tsx; what matters here is WHICH options reach it, so the
// control is stubbed with one that reports them.
vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  VariablePickerControl: ({ options }: { options?: { value: string }[] }) => (
    <div
      data-testid="variable-picker-options"
      data-options={(options ?? []).map((option) => option.value).join(',')}
    />
  ),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock call above
import DiseaseFields from '../DiseaseFields';

const CODEBOOK = {
  node: {
    'node-type-1': {
      name: 'Person',
      color: 'c',
      variables: {
        'var-1': { name: 'Affected', type: 'boolean' },
        'var-2': { name: 'Carrier', type: 'boolean' },
        'var-3': { name: 'Age', type: 'number' },
      },
    },
  },
};

type RenderOptions = {
  siblingDiseases?: unknown;
  editIndex?: number;
  /**
   * When set, the store carries a FamilyPedigree over the same node type whose
   * ego slot claims this variable — the shape that makes a disease mapping
   * paint the participant as affected on every seed.
   */
  pedigreeEgoVariable?: string;
  item?: Record<string, unknown>;
};

const pedigreeStage = (egoVariable: string) => ({
  id: 'fp1',
  type: 'FamilyPedigree',
  label: 'Family Pedigree',
  nodeConfig: {
    type: 'node-type-1',
    nodeLabelVariable: 'var-3',
    egoVariable,
    relationshipVariable: 'var-3',
    biologicalSexVariable: 'var-3',
  },
  edgeConfig: {
    type: 'edge-type-1',
    relationshipTypeVariable: 'e1',
    isActiveVariable: 'e2',
    isGestationalCarrierVariable: 'e3',
    gameteRoleVariable: 'e4',
  },
  censusPrompt: 'Build your family',
  framing: { mode: 'fixed', value: 'gamete' },
  boundaries: {
    requireGrandparents: 'off',
    requireChildrenContributors: 'off',
  },
});

const renderFields = ({
  siblingDiseases,
  editIndex,
  pedigreeEgoVariable,
  item,
}: RenderOptions = {}) => {
  const stages = pedigreeEgoVariable
    ? [pedigreeStage(pedigreeEgoVariable)]
    : [];
  const store = configureStore({
    reducer: {
      activeProtocol: (
        state = { present: { schemaVersion: 8, codebook: CODEBOOK, stages } },
      ) => state,
      stageEditorDraft: (state = { ui: { liveValues: null } }) => state,
    },
  });
  return render(
    <Provider store={store}>
      <FormStoreProvider>
        <DiseaseFields
          nodeType="node-type-1"
          siblingDiseases={siblingDiseases}
          editIndex={editIndex}
          item={item}
        />
      </FormStoreProvider>
    </Provider>,
  );
};

const offeredVariables = (): string[] =>
  (
    screen
      .getByTestId('variable-picker-options')
      .getAttribute('data-options') ?? ''
  )
    .split(',')
    .filter(Boolean);

describe('DiseaseFields variable picker exclusions', () => {
  it('offers every boolean node variable when nothing claims one', () => {
    renderFields();
    expect(offeredVariables()).toEqual(['var-1', 'var-2']);
  });

  it('drops a variable another disease row already maps', () => {
    renderFields({
      siblingDiseases: [{ variable: 'var-1' }, { variable: 'var-2' }],
      editIndex: 1,
    });
    expect(offeredVariables()).toEqual(['var-2']);
  });

  it('keeps the row’s own committed pick offered, so an imported protocol never renders blank', () => {
    renderFields({
      siblingDiseases: [{ variable: 'var-1' }, { variable: 'var-2' }],
      editIndex: 1,
      item: { variable: 'var-1' },
    });
    expect(offeredVariables()).toEqual(['var-1', 'var-2']);
  });

  it('drops a variable the source pedigree derives structurally', () => {
    renderFields({ pedigreeEgoVariable: 'var-1' });
    expect(offeredVariables()).toEqual(['var-2']);
  });

  it('keeps a structural variable offered when the row already names it', () => {
    renderFields({
      pedigreeEgoVariable: 'var-1',
      item: { variable: 'var-1' },
    });
    expect(offeredVariables()).toEqual(['var-1', 'var-2']);
  });
});
