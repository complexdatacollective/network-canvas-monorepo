import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

// The spotlight picker is a whole search UI; these tests only need a control
// that can report a variable was chosen.
vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  VariablePickerControl: ({
    onChange,
  }: {
    onChange?: (value: string) => void;
  }) => (
    <button type="button" onClick={() => onChange?.('close')}>
      Select variable
    </button>
  ),
  default: () => null,
}));

// eslint-disable-next-line import/first -- must follow the vi.mock call above
import NameGeneratorPrompts from '../NameGeneratorPrompts';

const CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'c',
      variables: {
        close: { name: 'Close', type: 'boolean' },
      },
    },
  },
};

const asStage = (values: Record<string, unknown>) => values as unknown as Stage;

const INCOMPLETE_MESSAGE =
  'Every additional variable needs both a variable and a value.';

const openPromptEditor = () => {
  const store = configureStore({
    reducer: {
      activeProtocol: (
        state = { present: { codebook: CODEBOOK, stages: [] } },
      ) => state,
      stageEditorDraft,
    },
  });

  render(
    <Provider store={store}>
      <FormStoreProvider>
        <StageFormBridge
          committedStage={asStage({
            subject: { entity: 'node', type: 'person' },
            prompts: [{ id: 'p1', text: 'Who do you know?' }],
          })}
          stageId="stage-1"
          formId="edit-stage"
        >
          <NameGeneratorPrompts
            stagePath="stages[0]"
            stagePosition={0}
            interfaceType="NameGenerator"
          />
        </StageFormBridge>
      </FormStoreProvider>
    </Provider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Edit prompt' }));
};

const saveButton = () => screen.getByRole('button', { name: 'Save' });

/**
 * A half-finished "Assign Additional Variables" row is rejected by the protocol
 * schema, but the row's own `required` rules are display-only (see `RowField`),
 * so only an array-level rule on the owning field can refuse the save. Without
 * it the dialog closed happily and the damage surfaced far from the cause: a
 * permanently disabled Preview button, and an export that failed validation on
 * import.
 */
describe('Name Generator prompt: assigned additional variables', () => {
  it('refuses to save a row with no variable chosen', async () => {
    openPromptEditor();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Add new variable to assign' }),
    );
    fireEvent.click(saveButton());

    expect(await screen.findByText(INCOMPLETE_MESSAGE)).toBeInTheDocument();
    // Still in the editor, with the offending row pointed at rather than just
    // an array-level complaint.
    expect(saveButton()).toBeInTheDocument();
    expect(screen.getAllByText('Required').length).toBeGreaterThan(0);
  });

  it('refuses to save a row whose value was never chosen', async () => {
    openPromptEditor();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Add new variable to assign' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select variable' }));
    await screen.findByLabelText('Value to assign');
    fireEvent.click(saveButton());

    expect(await screen.findByText(INCOMPLETE_MESSAGE)).toBeInTheDocument();
  });

  it('saves a prompt that assigns nothing', async () => {
    openPromptEditor();

    await screen.findByRole('button', { name: 'Add new variable to assign' });
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull(),
    );
    expect(screen.queryByText(INCOMPLETE_MESSAGE)).toBeNull();
  });
});
