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

// Likewise the rich text fields, so a test can supply the required prompt
// text without driving TipTap's contenteditable through jsdom.
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

vi.mock('~/components/NewVariableWindow', () => ({
  default: () => null,
  useNewVariableWindowState: (initial: unknown) => [initial, () => undefined],
}));

// Isolates this suite from ValidationSection's own dependency chain, owned
// by a different batch. The real component commits rule changes straight to
// `variableId`'s codebook entry via `updateVariableAsync`, so which variable
// it is mounted for — surfaced here as `data-variable-id` — is the whole
// safety property.
vi.mock('~/components/sections/CodebookVariableValidationSection', () => ({
  default: ({ variableId }: { variableId?: string }) => (
    <div data-testid="validation-section" data-variable-id={variableId} />
  ),
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
        // A categorical variable whose codebook options are already too few
        // for the schema — picking it seeds the draft with exactly one.
        sparse: {
          name: 'Sparse',
          type: 'categorical',
          options: [{ label: 'Only', value: 'only' }],
        },
        // A form elsewhere collects this one (a VALIDATED use), so the bin's
        // own picker — an UNVALIDATED writer — must not offer it.
        validated_elsewhere: {
          name: 'Validated Elsewhere',
          type: 'categorical',
          options: [
            { label: 'A', value: 'a' },
            { label: 'B', value: 'b' },
          ],
        },
        free_text: { name: 'Free Text', type: 'text' },
        // FamilyPedigree writes this one without validation, so the "other"
        // picker — a VALIDATED writer — must not offer it.
        unvalidated_elsewhere: { name: 'Unvalidated Elsewhere', type: 'text' },
      },
    },
  },
};

const PROTOCOL = {
  schemaVersion: 8,
  codebook: CODEBOOK,
  stages: [
    {
      id: 'form-stage',
      type: 'AlterForm',
      label: 'F',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'T', text: 'X' },
      form: { fields: [{ variable: 'validated_elsewhere', prompt: 'P' }] },
    },
    {
      id: 'pedigree-stage',
      type: 'FamilyPedigree',
      label: 'P',
      nodeConfig: {
        type: 'person',
        relationshipVariable: 'unvalidated_elsewhere',
      },
    },
  ],
};

const asStage = (values: Record<string, unknown>) => values as unknown as Stage;

const optionValues = (label: string) =>
  Array.from(
    screen.getByLabelText(label).querySelectorAll<HTMLOptionElement>('option'),
    (option) => option.value,
  );

const renderSection = (committedStage: Record<string, unknown>) => {
  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: PROTOCOL }) => state,
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

/**
 * Waits for a row editor's save to COMMIT, not merely to start.
 *
 * `SubmitButton` keeps its accessible name while the form is submitting, so
 * the control disappears only when the dialog itself unmounts — which happens
 * downstream of `DialogArrayField`'s `onSave`. Reading the committed array
 * before this resolves would read the pre-edit row.
 *
 * The generous budget is deliberate: the commit runs an async codebook write,
 * and this suite's slowest CI runs are ~20x a developer machine. It cannot
 * mask a wrong result — the condition is unreachable until the row commits, so
 * a broken save times out here rather than passing on stale state.
 */
const waitForSave = (submitLabel: string) =>
  waitFor(
    () => {
      expect(
        screen.queryByRole('button', { name: submitLabel }),
      ).not.toBeInTheDocument();
    },
    { timeout: 5000 },
  );

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
      screen.getByRole('button', { name: 'Create new prompt' }),
    ).toBeInTheDocument();
  });

  it('saves a new prompt with a picked categorical variable', async () => {
    const { getPrompts } = renderSection({
      subject: { entity: 'node', type: 'person' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create new prompt' }));
    fireEvent.change(await screen.findByLabelText('variable'), {
      target: { value: 'group' },
    });
    // `text` is required, so a prompt with none never leaves the dialog.
    fireEvent.change(screen.getByLabelText('text'), {
      target: { value: 'Group these' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitForSave('Add');

    expect(getPrompts()).toMatchObject([
      { text: 'Group these', variable: 'group' },
    ]);
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

  // Regression: DialogArrayField's handleSave merges this session's submitted
  // values OVER the row's pre-edit ones (to preserve properties the editor
  // never renders), so an existing row's committed
  // otherVariable/otherOptionLabel/otherVariablePrompt would survive a
  // toggle-off on that merge alone. `mergeEditedRow` reads the cleared
  // fields' dormant entries and deletes those keys instead.
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

    await waitForSave('Save');

    const [prompt] = getPrompts() as Record<string, unknown>[];
    expect(prompt).not.toHaveProperty('otherVariable');
    expect(prompt).not.toHaveProperty('otherOptionLabel');
    expect(prompt).not.toHaveProperty('otherVariablePrompt');
    expect(prompt).toMatchObject({ id: 'p1', variable: 'group' });
  });

  // The baseline the two regressions below must not break: a prompt that
  // really does carry an other variable opens with that variable in the
  // picker AND its codebook validation section mounted for it.
  it('shows the validation section for a prompt that has an other variable', async () => {
    renderSection({
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'Group these',
          variable: 'group',
          otherVariable: 'free_text',
          otherOptionLabel: 'Other',
          otherVariablePrompt: 'Please specify',
        },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit prompt' }));

    expect(await screen.findByLabelText('otherVariable')).toHaveValue(
      'free_text',
    );
    expect(screen.getByTestId('validation-section')).toHaveAttribute(
      'data-variable-id',
      'free_text',
    );
  });

  // Regression: toggling "Other" off CLEARS the trio, and the cleared value
  // survives the collapse as a dormant entry holding `undefined` — so the
  // picker remounts blank when the section is turned back on. Deriving the
  // variable as "live value, or else the row's pre-edit prop" revived the
  // removed variable there, mounting a fully populated Validation section
  // under a blank, required picker. `CodebookVariableValidationSection`
  // commits through `updateVariableAsync` the moment a rule is touched, so
  // that mount is a live write path onto a codebook variable this prompt no
  // longer references — and which another stage may still collect.
  it('does not remount the validation section for a removed other variable', async () => {
    renderSection({
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'Group these',
          variable: 'group',
          otherVariable: 'free_text',
          otherOptionLabel: 'Other',
          otherVariablePrompt: 'Please specify',
        },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit prompt' }));
    await screen.findByLabelText('otherVariable');
    expect(screen.getByTestId('validation-section')).toHaveAttribute(
      'data-variable-id',
      'free_text',
    );

    const [otherToggle] = screen
      .getAllByRole('switch')
      .filter((toggle) => toggle.getAttribute('aria-checked') === 'true');
    if (!otherToggle) throw new Error('expected the "Other" toggle to be on');

    // `Section`'s toggle handler is async, so the collapse lands a microtask
    // after the click.
    fireEvent.click(otherToggle);
    await waitFor(() => {
      expect(screen.queryByLabelText('otherVariable')).not.toBeInTheDocument();
    });

    fireEvent.click(otherToggle);
    const picker = await screen.findByLabelText('otherVariable');

    // The picker comes back blank, because the clear is what the save reads…
    expect(picker).toHaveValue('');
    // …so nothing beneath it may still be pointed at the removed variable.
    expect(screen.queryByTestId('validation-section')).not.toBeInTheDocument();
  });

  // The other half of that derivation: clearing the categorical variable
  // disables this section, which unmounts its children WITHOUT clearing them.
  // That parks `otherVariable` dormant holding its REAL value, so treating a
  // dormant entry's mere existence as "removed" would drop a variable the
  // researcher never touched — the loss `mergeEditedRow` exists to prevent.
  it('keeps the other variable across a disabled-parent unmount', async () => {
    renderSection({
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'Group these',
          variable: 'group',
          otherVariable: 'free_text',
          otherOptionLabel: 'Other',
          otherVariablePrompt: 'Please specify',
        },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit prompt' }));
    await screen.findByLabelText('otherVariable');

    fireEvent.change(screen.getByLabelText('variable'), {
      target: { value: '' },
    });
    await waitFor(() => {
      expect(screen.queryByLabelText('otherVariable')).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('variable'), {
      target: { value: 'group' },
    });
    expect(await screen.findByLabelText('otherVariable')).toHaveValue(
      'free_text',
    );
    expect(screen.getByTestId('validation-section')).toHaveAttribute(
      'data-variable-id',
      'free_text',
    );
  });

  // Regression: `Options` no longer owns `minTwoOptions`/`completeOptions`, so
  // an array field that omits them lets the dialog save an option list the
  // categorical variable schema rejects — which `useOnBeforeSavePrompt` then
  // writes straight into the codebook.
  it('refuses to save a variable option list with fewer than two options', async () => {
    const { getPrompts } = renderSection({
      subject: { entity: 'node', type: 'person' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create new prompt' }));
    fireEvent.change(await screen.findByLabelText('variable'), {
      target: { value: 'sparse' },
    });
    fireEvent.change(screen.getByLabelText('text'), {
      target: { value: 'Group these' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText(/minimum of two options/i),
    ).toBeInTheDocument();
    expect(getPrompts()).toBeUndefined();
  });

  // The invariant this file already states in prose: the main picker is an
  // UNVALIDATED writer and the "other" picker a VALIDATED one, so each must
  // drop the opposite class's existing uses up front rather than leaving the
  // researcher to complete a row the save-time backstop then rejects.
  it('keeps opposite-class writers out of both variable pickers', async () => {
    renderSection({
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'Group these',
          variable: 'group',
          otherVariable: 'free_text',
          otherOptionLabel: 'Other',
          otherVariablePrompt: 'Please specify',
        },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit prompt' }));
    await screen.findByLabelText('otherVariable');

    expect(optionValues('variable')).toContain('group');
    expect(optionValues('variable')).not.toContain('validated_elsewhere');
    // The current pick always escapes its own exclusion.
    expect(optionValues('otherVariable')).toContain('free_text');
    expect(optionValues('otherVariable')).not.toContain(
      'unvalidated_elsewhere',
    );
  });

  /**
   * The unchanged-pick escape, end to end through the real
   * `DialogArrayField` → `editorValidate(values, {initialValues})` path that
   * replaced the row's `_originalVariable`/`_originalOtherVariable` marker
   * fields.
   *
   * BOTH picks here are pre-existing cross-class conflicts, the shape an
   * imported protocol arrives with: `validated_elsewhere` is collected by
   * `form-stage`, and `unvalidated_elsewhere` is written by `pedigree-stage`.
   * Neither picker offers them any more, so the researcher cannot repair the
   * row from inside this dialog — editing the prompt's text has to remain
   * possible, or the timeline alert that reports such a protocol would be
   * pointing at a dialog that refuses to close.
   */
  it('re-saves a prompt whose existing picks both conflict, when this edit did not touch them', async () => {
    const { getPrompts } = renderSection({
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'Group these',
          variable: 'validated_elsewhere',
          otherVariable: 'unvalidated_elsewhere',
          otherOptionLabel: 'Other',
          otherVariablePrompt: 'Please specify',
        },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit prompt' }));
    fireEvent.change(await screen.findByLabelText('text'), {
      target: { value: 'Sort these' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitForSave('Save');

    expect(getPrompts()).toMatchObject([
      {
        text: 'Sort these',
        variable: 'validated_elsewhere',
        otherVariable: 'unvalidated_elsewhere',
      },
    ]);
  });

  // The marker fields the escape used to travel on were stripped by the
  // commit; nothing may put an editor-only key back on a saved prompt.
  it('saves no editor-only bookkeeping keys on the row', async () => {
    const { getPrompts } = renderSection({
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'Group these', variable: 'group' }],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit prompt' }));
    fireEvent.change(await screen.findByLabelText('text'), {
      target: { value: 'Sort these' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitForSave('Save');

    const prompts = getPrompts() as Record<string, unknown>[];
    expect(prompts).toHaveLength(1);
    const [prompt] = prompts;
    expect(prompt).toBeDefined();
    expect(
      Object.keys(prompt ?? {}).filter((key) => key.startsWith('_')),
    ).toEqual([]);
    expect(prompt).not.toHaveProperty('variableOptions');
  });
});
