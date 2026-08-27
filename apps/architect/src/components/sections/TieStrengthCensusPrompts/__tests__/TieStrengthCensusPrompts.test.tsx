import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider, {
  FormStoreContext,
} from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  VariablePickerControl: ({
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

// The rich text fields, so a test can supply the required prompt text and
// negative label without driving TipTap's contenteditable through jsdom.
vi.mock('~/components/Form/Fields/RichText/Field', () => ({
  default: ({
    name,
    value,
    onChange,
  }: {
    name?: string;
    value?: unknown;
    onChange?: (value: string) => void;
  }) => (
    <input
      aria-label={name}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

import TieStrengthCensusPrompts from '../TieStrengthCensusPrompts';

const asStage = (values: Record<string, unknown>) => values as unknown as Stage;

const EMPTY_PROTOCOL = { codebook: { edge: {}, node: {} } };

// `strength` is collected by an AlterEdgeForm (a VALIDATED use) on the very
// edge type the census prompt names, so a census prompt already bound to it
// is the pre-existing cross-class conflict an imported protocol carries.
const PROTOCOL_WITH_FORM_CONFLICT = {
  schemaVersion: 8,
  codebook: {
    node: { person: { name: 'Person', color: 'c', variables: {} } },
    edge: {
      friend: {
        name: 'Friend',
        color: 'c',
        variables: {
          strength: {
            name: 'Strength',
            type: 'ordinal',
            options: [
              { label: 'Weak', value: 'weak' },
              { label: 'Strong', value: 'strong' },
            ],
          },
        },
      },
    },
  },
  stages: [
    {
      id: 'form-stage',
      type: 'AlterEdgeForm',
      label: 'F',
      subject: { entity: 'edge', type: 'friend' },
      introductionPanel: { title: 'T', text: 'X' },
      form: { fields: [{ variable: 'strength', prompt: 'P' }] },
    },
  ],
};

const renderSection = (
  committedStage: Record<string, unknown>,
  protocol: unknown = EMPTY_PROTOCOL,
) => {
  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: protocol }) => state,
      stageEditorDraft,
    },
  });

  type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;
  let storeApi: StoreApi | null = null;
  const CaptureStore = () => {
    storeApi = useContext(FormStoreContext) ?? null;
    return null;
  };

  const view = render(
    <Provider store={store}>
      <FormStoreProvider>
        <StageFormBridge
          committedStage={asStage(committedStage)}
          stageId="stage-1"
          formId="edit-stage"
        >
          <CaptureStore />
          <TieStrengthCensusPrompts
            stagePath="stages[0]"
            stagePosition={0}
            interfaceType="TieStrengthCensus"
          />
        </StageFormBridge>
      </FormStoreProvider>
    </Provider>,
  );

  return {
    ...view,
    getPrompts: () => {
      if (!storeApi) throw new Error('stage form store was not captured');
      return storeApi.getState().getFormValues().prompts;
    },
  };
};

describe('TieStrengthCensusPrompts', () => {
  it('disables the section when the stage has no subject type', () => {
    renderSection({ subject: { entity: 'node' } });
    expect(
      screen
        .getByRole('heading', { name: 'Prompt collection' })
        .closest('section'),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByRole('button', { name: 'Create new prompt' }),
    ).toBeDisabled();
  });

  it('renders the prompts array field for a node subject', () => {
    renderSection({ subject: { entity: 'node', type: 'person' } });
    expect(screen.getAllByText('Prompts').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: 'Create new prompt' }),
    ).toBeInTheDocument();
  });

  it('shows the ordinal variable picker only once an edge type is chosen', async () => {
    renderSection({ subject: { entity: 'node', type: 'person' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create new prompt' }));
    expect(screen.queryByLabelText('edgeVariable')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(
        document.querySelector('[data-field-name="createEdge"]'),
      ).not.toBeNull();
    });
  });

  /**
   * The unchanged-pick escape, end to end through the real
   * `DialogArrayField` -> `editorValidate(values, {initialValues})` path that
   * replaced this editor's `_originalEdgeVariable` marker field.
   *
   * Tie-Strength Census is the case whose subject the ROW chooses: the gate
   * scopes `edgeVariable` by the prompt's own `createEdge`, so this also
   * proves that field reaches the validator. The picker no longer offers
   * `strength`, so editing the prompt's text has to stay possible or the
   * researcher is trapped in a dialog that will not close.
   */
  it('re-saves a prompt whose existing edge variable conflicts, when this edit did not touch it', async () => {
    const { getPrompts } = renderSection(
      {
        subject: { entity: 'node', type: 'person' },
        prompts: [
          {
            id: 'p1',
            text: 'Rate this tie',
            createEdge: 'friend',
            edgeVariable: 'strength',
            negativeLabel: 'None',
          },
        ],
      },
      PROTOCOL_WITH_FORM_CONFLICT,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit prompt' }));
    fireEvent.change(await screen.findByLabelText('text'), {
      target: { value: 'Rate this relationship' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(
      () => {
        expect(
          screen.queryByRole('button', { name: 'Save' }),
        ).not.toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    expect(getPrompts()).toMatchObject([
      {
        text: 'Rate this relationship',
        createEdge: 'friend',
        edgeVariable: 'strength',
      },
    ]);
  });

  it('cancels without saving a prompt', async () => {
    renderSection({ subject: { entity: 'node', type: 'person' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create new prompt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Cancel' }),
      ).not.toBeInTheDocument();
    });
  });
});
