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

// The picker is stubbed to a plain select so a test can choose a variable
// without depending on VariableSpotlight's own UI.
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

// Isolates this suite from ValidationSection's own dependency chain, owned
// by a different batch.
vi.mock('~/components/sections/CodebookVariableValidationSection', () => ({
  default: () => <div data-testid="validation-section" />,
}));

import CategoricalBinPrompts from '../CategoricalBinPrompts';

const CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'c',
      variables: {
        group: {
          name: 'Group',
          type: 'categorical',
          options: [
            { label: 'Family', value: 'family' },
            { label: 'Friends', value: 'friends' },
          ],
        },
      },
    },
  },
};

const asStage = (values: Record<string, unknown>) => values as unknown as Stage;

const renderSection = (committedStage: Record<string, unknown>) => {
  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: { codebook: CODEBOOK } }) => state,
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
          <CategoricalBinPrompts
            stagePath="stages[0]"
            stagePosition={0}
            interfaceType="CategoricalBin"
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

describe('CategoricalBinPrompts', () => {
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

  it('saves a new prompt with a picked categorical variable', async () => {
    renderSection({ subject: { entity: 'node', type: 'person' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create new' }));
    fireEvent.change(await screen.findByLabelText('variable'), {
      target: { value: 'group' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Add' }),
      ).not.toBeInTheDocument();
    });
  });

  // The "Other" section is toggleable and starts collapsed for a prompt with
  // no otherVariable — its fields must not register (and so must not appear
  // in the saved prompt) while collapsed, matching the categorical-bin e2e
  // spec's `expect(prompt).not.toHaveProperty('otherVariable')`.
  it('keeps the collapsed "Other" section out of the prompt preview text', () => {
    renderSection({
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'Group these', variable: 'group' }],
    });
    expect(screen.queryByLabelText('otherVariable')).not.toBeInTheDocument();
  });

  // Regression: DialogArrayField's handleSave merges this session's
  // submitted values OVER the row's pre-edit ones (to preserve properties
  // the editor never renders), so an existing row's committed
  // otherVariable/otherOptionLabel/otherVariablePrompt do not simply vanish
  // when the researcher collapses "Other" and re-saves — they must be
  // actively stripped (`useOnBeforeSavePrompt`'s `hasOtherVariable` signal).
  it('clears an existing otherVariable trio from the saved prompt after "Other" is toggled off', async () => {
    const { getPrompts } = renderSection({
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'Group these',
          variable: 'group',
          otherVariable: 'other',
          otherOptionLabel: 'Other',
          otherVariablePrompt: 'Please specify',
        },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit prompt' }));
    // The "Other" section starts expanded (startExpanded={!!otherVariable}) —
    // its toggle is the only one of the dialog's several toggleable Sections
    // (Bin/BucketSortOrderSection are the others) that starts checked.
    await screen.findByLabelText('otherVariable');
    const [otherToggle] = screen
      .getAllByRole('switch')
      .filter((toggle) => toggle.getAttribute('aria-checked') === 'true');
    if (!otherToggle) throw new Error('expected the "Other" toggle to be on');
    fireEvent.click(otherToggle);
    // `Section`'s toggle handler is async (`await handleToggleChange(...)`
    // before `setInternalOpen`), so the collapse — and the "Other" fields'
    // unmount — lands a microtask after the click itself.
    await waitFor(() => {
      expect(screen.queryByLabelText('otherVariable')).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Save' }),
      ).not.toBeInTheDocument();
    });

    const [prompt] = getPrompts() as Record<string, unknown>[];
    expect(prompt).not.toHaveProperty('otherVariable');
    expect(prompt).not.toHaveProperty('otherOptionLabel');
    expect(prompt).not.toHaveProperty('otherVariablePrompt');
    expect(prompt).not.toHaveProperty('hasOtherVariable');
    expect(prompt).toMatchObject({ id: 'p1', variable: 'group' });
  });
});
