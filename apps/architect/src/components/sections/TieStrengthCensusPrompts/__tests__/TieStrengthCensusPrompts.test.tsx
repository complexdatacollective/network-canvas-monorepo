import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  default: ({
    name,
    value,
    onChange,
    options = [],
  }: {
    name?: string;
    value?: unknown;
    onChange?: (value: string) => void;
    options?: { value: string; label: string }[];
  }) => (
    <select
      aria-label={name}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange?.(event.target.value)}
    >
      <option value="">-- select --</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('~/components/NewVariableWindow', () => ({
  default: () => null,
  useNewVariableWindowState: (initial: unknown) => [initial, () => undefined],
}));

import TieStrengthCensusPrompts from '../TieStrengthCensusPrompts';

const asStage = (values: Record<string, unknown>) => values as unknown as Stage;

const renderSection = (committedStage: Record<string, unknown>) => {
  const store = configureStore({
    reducer: {
      activeProtocol: (
        state = { present: { codebook: { edge: {}, node: {} } } },
      ) => state,
      stageEditorDraft,
    },
  });

  return render(
    <Provider store={store}>
      <FormStoreProvider>
        <StageFormBridge
          committedStage={asStage(committedStage)}
          stageId="stage-1"
          formId="edit-stage"
        >
          <TieStrengthCensusPrompts
            stagePath="stages[0]"
            stagePosition={0}
            interfaceType="TieStrengthCensus"
          />
        </StageFormBridge>
      </FormStoreProvider>
    </Provider>,
  );
};

describe('TieStrengthCensusPrompts', () => {
  it('disables the section when the stage has no subject type', () => {
    renderSection({ subject: { entity: 'node' } });
    expect(
      screen.getByText(/select a node type above to configure this section/i),
    ).toBeInTheDocument();
  });

  it('renders the prompts array field for a node subject', () => {
    renderSection({ subject: { entity: 'node', type: 'person' } });
    expect(screen.getAllByText('Prompts').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: 'Create new' }),
    ).toBeInTheDocument();
  });

  it('shows the ordinal variable picker only once an edge type is chosen', async () => {
    renderSection({ subject: { entity: 'node', type: 'person' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create new' }));
    expect(screen.queryByLabelText('edgeVariable')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(
        document.querySelector('[data-field-name="createEdge"]'),
      ).not.toBeNull();
    });
  });

  it('cancels without saving a prompt', async () => {
    renderSection({ subject: { entity: 'node', type: 'person' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create new' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Cancel' }),
      ).not.toBeInTheDocument();
    });
  });
});
