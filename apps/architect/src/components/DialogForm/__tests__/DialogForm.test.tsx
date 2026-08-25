import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { Stage } from '@codaco/protocol-validation';
import app, { setProtocolLockState } from '~/ducks/modules/app';
import stageEditorDraft, {
  draftTimelineActions,
} from '~/ducks/modules/stageEditorDraft';

import DialogForm from '../DialogForm';
import { hasDirtyNestedDraft } from '../nestedDraftRegistry';

const stage = { id: 'stage-1', type: 'Information', label: 'A' } as Stage;

// `FormWithoutProvider` hardcodes `onSubmitInvalid: focusFirstError`
// (fresco-ui's Form.tsx), so DialogForm relies on it rather than
// reimplementing scroll-to-first-invalid. Spy on it (without calling
// through) to prove the wiring reaches fresco-ui's default instead of
// asserting real DOM focus, which depends on Base UI's dialog focus-trap
// settling — not something this component controls or should be pinned to.
const focusFirstErrorSpy = vi.hoisted(() => vi.fn());

vi.mock('@codaco/fresco-ui/form/utils/focusFirstError', () => ({
  focusFirstError: focusFirstErrorSpy,
}));

describe('DialogForm', () => {
  it('renders Fields inside the form store provider, with the dialog title', () => {
    render(
      <DialogForm
        open
        onClose={vi.fn()}
        title="Edit Label"
        formId="render-form"
        submitLabel="Save"
        onSubmit={vi.fn()}
      >
        <Field
          name="label"
          label="Label"
          component={InputField}
          initialValue="Alice"
        />
      </DialogForm>,
    );

    expect(
      screen.getByRole('heading', { name: 'Edit Label' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Label' })).toHaveValue('Alice');
  });

  it('starts workspace dialogs at an even split and resizes them from the keyboard', () => {
    render(
      <DialogForm
        open
        onClose={vi.fn()}
        title="Edit field"
        formId="resizable-workspace-form"
        submitLabel="Save"
        onSubmit={vi.fn()}
        aside={<div>Participant preview</div>}
      >
        <Field name="label" label="Label" component={InputField} />
      </DialogForm>,
    );

    const resizeHandle = screen.getByRole('slider', {
      name: 'Resize form and preview panes',
    });
    expect(resizeHandle).toHaveAttribute('aria-valuenow', '50');
    expect(
      screen.getByText('Participant preview').closest('aside'),
    ).toHaveClass('z-10');

    fireEvent.keyDown(resizeHandle, { key: 'ArrowRight' });
    expect(resizeHandle).toHaveAttribute('aria-valuenow', '52');
  });

  it('submits via the footer button’s form= association, not DOM nesting', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: true });

    render(
      <DialogForm
        open
        onClose={vi.fn()}
        formId="assoc-form"
        submitLabel="Save"
        onSubmit={onSubmit}
      >
        <Field name="label" label="Label" component={InputField} />
      </DialogForm>,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Label' }), {
      target: { value: 'Alice' },
    });

    const submitButton = screen.getByRole('button', { name: 'Save' });
    // The footer (and its SubmitButton) is rendered outside the <form>
    // element — association happens purely via the native `form=` attribute.
    expect(submitButton.closest('form')).toBeNull();
    // The caller's `formId` is only the stem of the real DOM id (a per-mount
    // suffix keeps it unique), so assert the association resolves to THIS
    // dialog's form rather than pinning the literal id.
    const associatedId = submitButton.getAttribute('form');
    expect(associatedId).toMatch(/^assoc-form-/);
    expect(document.getElementById(associatedId!)).toBe(
      document.querySelector('form'),
    );

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'Alice' }),
      );
    });
  });

  it('gives two dialogs sharing a formId distinct form ids, so each Submit drives its own form', async () => {
    // A dialog stays mounted while it animates closed, so a second dialog of
    // the same kind opened in that window briefly coexists with the first.
    // `form=` resolves by id and takes the first match in document order — if
    // both forms carried the caller's `formId`, the new dialog's Submit would
    // silently drive the old, closing form and do nothing at all.
    const onSubmitClosing = vi.fn().mockResolvedValue({ success: true });
    const onSubmitOpening = vi.fn().mockResolvedValue({ success: true });

    render(
      <>
        <DialogForm
          open
          onClose={vi.fn()}
          title="Closing"
          formId="shared-form"
          submitLabel="Save closing"
          onSubmit={onSubmitClosing}
        >
          <Field
            name="label"
            label="Closing label"
            component={InputField}
            initialValue="old"
          />
        </DialogForm>
        <DialogForm
          open
          onClose={vi.fn()}
          title="Opening"
          formId="shared-form"
          submitLabel="Save opening"
          onSubmit={onSubmitOpening}
        >
          <Field
            name="label"
            label="Opening label"
            component={InputField}
            initialValue="new"
          />
        </DialogForm>
      </>,
    );

    const forms = document.querySelectorAll('form');
    expect(forms).toHaveLength(2);
    expect(forms[0]!.id).not.toBe(forms[1]!.id);

    // Query the DOM rather than the accessibility tree: two simultaneously
    // open modals leave the lower one aria-hidden, which is exactly the
    // transient state under test.
    const submitButtons =
      document.querySelectorAll<HTMLButtonElement>('button[form]');
    expect(submitButtons).toHaveLength(2);
    // Each Submit points at its OWN dialog's form, not the first one in the
    // document.
    expect(submitButtons[0]!.getAttribute('form')).toBe(forms[0]!.id);
    expect(submitButtons[1]!.getAttribute('form')).toBe(forms[1]!.id);

    fireEvent.click(submitButtons[1]!);

    await waitFor(() => {
      expect(onSubmitOpening).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'new' }),
      );
    });
    expect(onSubmitClosing).not.toHaveBeenCalled();
  });

  it('blocks submit on a form-level validate result, renders the field error, and invokes fresco-ui’s focusFirstError', async () => {
    const onSubmit = vi.fn();
    const validate = vi.fn(() => ({ label: 'Name already used' }));

    render(
      <DialogForm
        open
        onClose={vi.fn()}
        formId="validate-form"
        submitLabel="Save"
        onSubmit={onSubmit}
        validate={validate}
      >
        <Field
          name="label"
          label="Label"
          component={InputField}
          initialValue="Bob"
        />
      </DialogForm>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Name already used')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(focusFirstErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldErrors: { label: ['Name already used'] },
        }),
        // The form element the search is scoped to.
        expect.anything(),
      );
    });
  });

  it('passes editIndex through to validate as context', async () => {
    const validate = vi.fn(() => undefined);

    render(
      <DialogForm
        open
        onClose={vi.fn()}
        formId="edit-index-form"
        submitLabel="Save"
        onSubmit={vi.fn().mockResolvedValue({ success: true })}
        validate={validate}
        editIndex={2}
      >
        <Field
          name="label"
          label="Label"
          component={InputField}
          initialValue="Alice"
        />
      </DialogForm>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(validate).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'Alice' }),
        { editIndex: 2 },
      );
    });
  });

  it('surfaces fieldErrors returned by an async onSubmit (e.g. onBeforeSave-style handlers)', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      success: false,
      fieldErrors: { label: ['Server: name already taken'] },
    });

    render(
      <DialogForm
        open
        onClose={vi.fn()}
        formId="async-error-form"
        submitLabel="Save"
        onSubmit={onSubmit}
      >
        <Field
          name="label"
          label="Label"
          component={InputField}
          initialValue="Alice"
        />
      </DialogForm>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Server: name already taken'),
    ).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Alice' }),
    );
  });

  it('treats a void onSubmit result as success', async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn(() => undefined);

    render(
      <DialogForm
        open
        onClose={onClose}
        formId="void-success-form"
        submitLabel="Save"
        onSubmit={onSubmit}
      >
        <Field name="label" label="Label" component={InputField} />
      </DialogForm>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    // A void return is treated as success: no field/form errors renders.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('disables Cancel and Submit and makes the dialog non-dismissible while submitting', async () => {
    let resolveSubmit: (value: { success: true }) => void = () => undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<{ success: true }>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    const onClose = vi.fn();

    render(
      <DialogForm
        open
        onClose={onClose}
        formId="busy-form"
        submitLabel="Save"
        onSubmit={onSubmit}
      >
        <Field
          name="label"
          label="Label"
          component={InputField}
          initialValue="Alice"
        />
      </DialogForm>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    // The submit control keeps its name while busy — it reports the busy
    // state instead — so "Save is gone" still means "the dialog closed".
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    // Non-dismissible: neither Escape nor the (disabled) Cancel button close it.
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    resolveSubmit({ success: true });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    });
  });
});

/**
 * Cancel, the close button, Escape and a backdrop click all reach `DialogForm`
 * through fresco-ui `Dialog`'s single `closeDialog` prop. Before this guard,
 * every one of them discarded a half-typed nested editor with no warning, and
 * the guard that did exist was opt-in per caller — which the array-row editor
 * (the one in the bug report) never opted into.
 */
describe('DialogForm unsaved-changes guard', () => {
  const openDialogSpy = globalThis.__architectDialogMocks.openDialog;

  const renderForm = (onClose: () => void, unregisteredDraft?: () => boolean) =>
    render(
      <DialogForm
        open
        onClose={onClose}
        title="Edit Field"
        formId="guard-form"
        submitLabel="Save"
        onSubmit={vi.fn()}
        {...(unregisteredDraft ? { unregisteredDraft } : {})}
      >
        <Field
          name="hint"
          label="Hint"
          component={InputField}
          initialValue="Committed"
        />
      </DialogForm>,
    );

  const cancel = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  it('closes immediately when nothing has been changed', () => {
    const onClose = vi.fn();
    renderForm(onClose);

    cancel();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(openDialogSpy).not.toHaveBeenCalled();
  });

  it('asks before discarding an edit, and only closes on confirm', async () => {
    let resolveDialog: ((value: boolean) => void) | undefined;
    openDialogSpy.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveDialog = resolve;
      }),
    );
    const onClose = vi.fn();
    renderForm(onClose);

    fireEvent.change(screen.getByRole('textbox', { name: 'Hint' }), {
      target: { value: 'DRAFT-HINT' },
    });
    cancel();

    expect(onClose).not.toHaveBeenCalled();
    expect(openDialogSpy).toHaveBeenCalledTimes(1);

    resolveDialog!(true);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('keeps the editor and its values when the discard is declined', async () => {
    openDialogSpy.mockResolvedValueOnce(false);
    const onClose = vi.fn();
    renderForm(onClose);

    const hint = screen.getByRole('textbox', { name: 'Hint' });
    fireEvent.change(hint, { target: { value: 'DRAFT-HINT' } });
    cancel();

    await waitFor(() => expect(openDialogSpy).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    expect(hint).toHaveValue('DRAFT-HINT');
  });

  it('asks about work the registered fields cannot report', () => {
    // A dialog whose editor writes into state BESIDE the form — an opaque
    // value with no control of its own to register, like a variable's
    // synthetic block — is dirty in a way `selectIsFormDirty` cannot see.
    // Opened with its fields already filled in, it reported "nothing to lose"
    // for an edit that was about to be lost.
    const onClose = vi.fn();
    renderForm(onClose, () => true);

    cancel();

    expect(onClose).not.toHaveBeenCalled();
    expect(openDialogSpy).toHaveBeenCalledTimes(1);
  });

  it('still closes immediately when that work has not been started', () => {
    const onClose = vi.fn();
    renderForm(onClose, () => false);

    cancel();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(openDialogSpy).not.toHaveBeenCalled();
  });

  it('does not nag once an edit has been undone by hand', async () => {
    // The form store's own `isDirty` is sticky — set by any `setFieldValue` and
    // cleared only by `reset` — so guarding on it would keep asking about a form
    // the researcher had already put back. The stage editor's guard rejected it
    // for the same reason.
    const onClose = vi.fn();
    renderForm(onClose);

    const hint = screen.getByRole('textbox', { name: 'Hint' });
    fireEvent.change(hint, { target: { value: 'Changed' } });
    fireEvent.change(hint, { target: { value: 'Committed' } });
    cancel();

    expect(openDialogSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('registers its draft with the navigation guards while it is dirty', async () => {
    const { unmount } = renderForm(vi.fn());

    expect(hasDirtyNestedDraft()).toBe(false);

    fireEvent.change(screen.getByRole('textbox', { name: 'Hint' }), {
      target: { value: 'DRAFT-HINT' },
    });
    expect(hasDirtyNestedDraft()).toBe(true);

    unmount();
    expect(hasDirtyNestedDraft()).toBe(false);
  });
});

/**
 * A demoted tab keeps its editors mounted rather than tearing them away
 * (`held-nested-editor`), so a Finish can be pressed in a tab whose writes can
 * never reach disk. Outside a stage editor that commit writes the canonical
 * protocol, and the reclaim's re-read of the saved row would replace it without
 * a word — the silent discard, one step further along.
 */
describe('DialogForm in a tab that cannot save', () => {
  const createTestStore = () =>
    configureStore({
      reducer: combineReducers({ app, stageEditorDraft }),
    });

  const renderForm = (
    store: ReturnType<typeof createTestStore>,
    onSubmit: () => void,
  ) =>
    render(
      <Provider store={store}>
        <DialogForm
          open
          onClose={vi.fn()}
          title="Edit Field"
          formId="lock-form"
          submitLabel="Save"
          onSubmit={onSubmit}
        >
          <Field
            name="hint"
            label="Hint"
            component={InputField}
            initialValue="Committed"
          />
        </DialogForm>
      </Provider>,
    );

  const save = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  it('refuses the commit, and says why, while another tab holds the protocol', async () => {
    const store = createTestStore();
    store.dispatch(setProtocolLockState('open-elsewhere'));
    const onSubmit = vi.fn();

    renderForm(store, onSubmit);
    save();

    await waitFor(() => {
      expect(
        screen.getByText(
          'This protocol is open in another tab, which holds the saved copy. Close the other tab to save these changes here.',
        ),
      ).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // Inside a stage editor the commit lands in that editor's own draft
  // transaction, not the protocol — and it is the only way to move an inner
  // editor's work somewhere the blocked-reclaim choice can rescue it.
  it('accepts the commit inside an open stage editor transaction', async () => {
    const store = createTestStore();
    store.dispatch(setProtocolLockState('reclaim-blocked'));
    store.dispatch(draftTimelineActions.reset({ stage, codebook: {} }));
    const onSubmit = vi.fn();

    renderForm(store, onSubmit);
    save();

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  it('accepts the commit normally when this tab owns the protocol', async () => {
    const store = createTestStore();
    const onSubmit = vi.fn();

    renderForm(store, onSubmit);
    save();

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });
});
