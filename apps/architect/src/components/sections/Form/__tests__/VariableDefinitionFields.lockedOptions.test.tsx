import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { BIOLOGICAL_SEX_OPTIONS } from '@codaco/protocol-validation';

// Editor chrome only — `LockedOptions` stays REAL, because which option list
// it is handed is the whole point of this file.
vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  VariablePickerControl: () => <div data-testid="variable-picker" />,
}));
vi.mock('~/components/Parameters', () => ({
  default: () => <div data-testid="parameters" />,
}));
vi.mock('~/components/ExternalLink', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import ComposerAttributeFields from '../../../EditableAttributesList/ComposerAttributeFields';

// The pedigree binds `biologicalSex` to the slot whose OPTIONS it owns, while
// the codebook's own list has drifted from the canonical set — the shape an
// imported protocol arrives in before the import repair runs, and the only
// shape where "the variable's options" and "the interface's options" differ.
const DRIFTED_OPTIONS = [
  { label: 'Woman', value: 'female' },
  { label: 'Man', value: 'male' },
];

const PROTOCOL = {
  schemaVersion: 8,
  codebook: {
    node: {
      family_member: {
        name: 'Family member',
        color: 'c',
        variables: {
          fmName: { name: 'fm_name', type: 'text', component: 'Text' },
          isEgo: { name: 'is_ego', type: 'boolean' },
          relationshipToEgo: { name: 'fm_relationship_to_ego', type: 'text' },
          biologicalSex: {
            name: 'biologicalSex',
            type: 'categorical',
            component: 'RadioGroup',
            options: DRIFTED_OPTIONS,
          },
        },
      },
    },
  },
  stages: [
    {
      id: 'fp1',
      type: 'FamilyPedigree',
      label: 'Family Pedigree',
      nodeConfig: {
        type: 'family_member',
        nodeLabelVariable: 'fmName',
        egoVariable: 'isEgo',
        relationshipVariable: 'relationshipToEgo',
        biologicalSexVariable: 'biologicalSex',
      },
      edgeConfig: {
        type: 'family_edge',
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
    },
  ],
};

const renderEditor = () => {
  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: PROTOCOL }) => state,
      stageEditorDraft: (state = { ui: { liveValues: null } }) => state,
    },
  });
  return render(
    <Provider store={store}>
      <Form onSubmit={() => ({ success: true })}>
        <ComposerAttributeFields
          entity="node"
          type="family_member"
          item={{ variable: 'biologicalSex', component: 'RadioGroup' }}
        />
      </Form>
    </Provider>,
  );
};

describe('the field editors’ locked option list', () => {
  it('shows the canonical set the protocol rule enforces, not the codebook’s drifted copy', () => {
    renderEditor();

    for (const option of BIOLOGICAL_SEX_OPTIONS) {
      expect(screen.getByText(option.label)).toBeInTheDocument();
    }
    expect(screen.queryByText('Woman')).not.toBeInTheDocument();
    expect(screen.queryByText('Man')).not.toBeInTheDocument();
  });

  it('offers no editable option list for an interface-owned attribute', () => {
    renderEditor();

    expect(
      screen.queryByRole('button', { name: /create new option/i }),
    ).not.toBeInTheDocument();
  });
});
