import { configureStore } from '@reduxjs/toolkit';
import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

vi.mock('~/components/Form/Fields/RichText/Field', () => ({
  default: ({
    id,
    value,
    onChange,
  }: {
    id?: string;
    value?: string;
    onChange?: (value: string) => void;
  }) => (
    <textarea
      id={id}
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  VariablePickerControl: ({
    id,
    value,
    onChange,
  }: {
    id?: string;
    value?: string;
    onChange?: (value: string) => void;
  }) => (
    <select
      id={id}
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    >
      <option value="">Select an attribute</option>
      <option value="has_condition">Has condition</option>
    </select>
  ),
}));

vi.mock('~/components/NewVariableWindow', () => ({
  default: () => null,
  useNewVariableWindowState: () => [{}, () => undefined],
}));

// eslint-disable-next-line import/first -- must follow the component mocks
import NominationPromptFields from '../NominationPromptFields';

const renderFields = () => {
  const store = configureStore({
    reducer: {
      activeProtocol: (
        state = {
          present: {
            codebook: {
              node: {
                person: {
                  variables: {
                    has_condition: {
                      name: 'Has condition',
                      type: 'boolean',
                    },
                  },
                },
              },
            },
          },
        },
      ) => state,
      stageEditorDraft,
    },
  });

  render(
    <Provider store={store}>
      <FormStoreProvider>
        <NominationPromptFields
          nodeType="person"
          item={{
            text: 'Who has this condition?',
            variable: 'has_condition',
          }}
        />
      </FormStoreProvider>
    </Provider>,
  );
};

describe('NominationPromptFields', () => {
  it('groups the prompt and attribute as nomination details', () => {
    renderFields();

    const details = screen.getByRole('region', { name: 'Nomination details' });
    expect(details).toHaveTextContent(
      'Write the question participants will answer and choose the boolean attribute that records who they nominate.',
    );
    expect(
      within(details).getByRole('textbox', { name: 'Prompt text' }),
    ).toHaveValue('Who has this condition?');
    expect(
      within(details).getByRole('combobox', { name: 'Attribute' }),
    ).toHaveValue('has_condition');
  });
});
