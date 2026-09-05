import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DialogModule from '@codaco/fresco-ui/dialogs/Dialog';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';

import DialogForm, {
  type DialogFormErrors,
  DialogFormField,
  type DialogFormProps,
} from '../DialogForm.tsx';

/**
 * `layoutId` is a Motion prop, so it leaves no trace in the DOM: what a
 * consumer needs to know is that the dialog RECEIVED it, which is what this
 * records. Fresco's own `Dialog` is still the thing that renders — the mock is
 * a passthrough, so every test in this file exercises the real component.
 */
const dialogRenders = vi.hoisted(() =>
  vi.fn<(props: { layoutId?: string }) => void>(),
);

vi.mock('@codaco/fresco-ui/dialogs/Dialog', async (importOriginal) => {
  const actual = await importOriginal<typeof DialogModule>();
  const RealDialog = actual.default;
  return {
    ...actual,
    default: (props: DialogModule.DialogProps) => {
      dialogRenders(props);
      return createElement(RealDialog, props);
    },
  };
});

beforeEach(() => {
  dialogRenders.mockClear();
});

type EditorOptions = Partial<Omit<DialogFormProps, 'open'>>;

/**
 * The dialog stays mounted once it closes, exactly as a host would leave it
 * while it animates away — so a test can tell "closed" from "unmounted".
 */
function Editor({ onClose, children, onSubmit, ...props }: EditorOptions) {
  const [open, setOpen] = useState(true);

  return (
    <DialogForm
      open={open}
      onClose={() => {
        setOpen(false);
        onClose?.();
      }}
      title="Edit rule"
      formId="rule-editor"
      submitLabel="Save"
      onSubmit={onSubmit ?? (() => undefined)}
      {...props}
    >
      {children ?? (
        <DialogFormField
          name="label"
          label="Rule label"
          component={InputField}
        />
      )}
    </DialogForm>
  );
}

function renderEditor(options: EditorOptions = {}) {
  return render(
    <DialogProvider>
      <Editor {...options} />
    </DialogProvider>,
  );
}

const ruleLabel = () => screen.getByRole('textbox', { name: 'Rule label' });

describe('DialogForm', () => {
  it('opens holding the values it was given', async () => {
    renderEditor({ initialValues: { label: 'Older than 65' } });

    await waitFor(() => expect(ruleLabel()).toHaveValue('Older than 65'));
  });

  it("prefers a field's own initial value to the dialog's", async () => {
    renderEditor({
      initialValues: { label: 'From the dialog', variable: 'age' },
      children: (
        <>
          <DialogFormField
            name="label"
            label="Rule label"
            component={InputField}
            initialValue="From the field"
          />
          <DialogFormField
            name="variable"
            label="Attribute"
            component={InputField}
          />
        </>
      ),
    });

    await waitFor(() => expect(ruleLabel()).toHaveValue('From the field'));
    // The sibling that states nothing of its own still opens on the dialog's
    // value, so the field above is winning a contest rather than the dialog's
    // values going unread.
    expect(screen.getByRole('textbox', { name: 'Attribute' })).toHaveValue(
      'age',
    );
  });

  it('hands the dialog the shared-element identity it was opened with', async () => {
    renderEditor({
      layoutId: 'rule-row-7',
      style: { borderRadius: 28 },
    });

    // `layoutId` pairs this dialog with the array row it morphs out of. It is
    // a Motion prop and reaches no DOM attribute, so the dialog's own record
    // of what it was handed is what there is to read; the inline geometry that
    // travels with the morph is asserted the way fresco-ui asserts its own.
    await waitFor(() =>
      expect(dialogRenders).toHaveBeenCalledWith(
        expect.objectContaining({ layoutId: 'rule-row-7' }),
      ),
    );
    expect(await screen.findByRole('dialog')).toHaveStyle({
      borderRadius: '28px',
    });
  });

  it('submits the draft once, with the values on screen', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    renderEditor({
      initialValues: { label: 'Older than' },
      onSubmit,
      onClose,
    });

    await waitFor(() => expect(ruleLabel()).toHaveValue('Older than'));
    await user.type(ruleLabel(), ' 65');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ label: 'Older than 65' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('submits when the form-level check answers with an empty object', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    renderEditor({ onSubmit, onClose, validate: () => ({}) });

    await user.type(ruleLabel(), 'Age');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ label: 'Age' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('submits when the form-level check answers with empty error lists', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    renderEditor({
      onSubmit,
      onClose,
      validate: () => ({ formErrors: [], fieldErrors: {} }),
    });

    await user.type(ruleLabel(), 'Age');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ label: 'Age' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed save on screen, says why, and takes a corrected retry', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSubmit = vi
      .fn<(values: Record<string, FieldValue>) => Promise<void>>()
      .mockRejectedValueOnce(new Error('Another rule already uses that name.'))
      .mockResolvedValue(undefined);
    renderEditor({ onSubmit, onClose });

    await user.type(ruleLabel(), 'Age');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Another rule already uses that name.'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(ruleLabel()).toHaveValue('Age');

    await user.type(ruleLabel(), ' band');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenLastCalledWith({ label: 'Age band' });
  });

  it('keeps a refused save on screen, says why, and takes a corrected retry', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSubmit = vi
      .fn<
        (values: Record<string, FieldValue>) => DialogFormErrors | undefined
      >()
      .mockReturnValueOnce({
        formErrors: ['That rule cannot be saved while the stage is locked.'],
      })
      .mockReturnValue(undefined);
    renderEditor({ onSubmit, onClose });

    await user.type(ruleLabel(), 'Age');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'That rule cannot be saved while the stage is locked.',
      ),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(ruleLabel()).toHaveValue('Age');

    await user.type(ruleLabel(), ' band');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenLastCalledWith({ label: 'Age band' });
  });

  it('attaches a refused save to the field it names, and focuses it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSubmit = vi.fn((): DialogFormErrors => ({
      fieldErrors: { variable: 'That attribute is used by another rule.' },
    }));
    // Two fields, and the refusal names the SECOND: focus landing there is the
    // error being attached to the control it belongs to, rather than the
    // dialog simply focusing whatever comes first.
    renderEditor({
      onSubmit,
      onClose,
      children: (
        <>
          <DialogFormField
            name="label"
            label="Rule label"
            component={InputField}
          />
          <DialogFormField
            name="variable"
            label="Attribute"
            component={InputField}
          />
        </>
      ),
    });

    await user.type(ruleLabel(), 'Age');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('That attribute is used by another rule.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Attribute' })).toHaveFocus(),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when a save answers with an empty result', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSubmit = vi.fn((): DialogFormErrors => ({}));
    renderEditor({ onSubmit, onClose });

    await user.type(ruleLabel(), 'Age');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ label: 'Age' });
  });

  it('closes when a save answers with empty error lists', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSubmit = vi.fn((): DialogFormErrors => ({
      formErrors: [],
      fieldErrors: {},
    }));
    renderEditor({ onSubmit, onClose });

    await user.type(ruleLabel(), 'Age');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ label: 'Age' });
  });

  it('falls back to a generic message when a failed save carries none', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSubmit = vi
      .fn<(values: Record<string, FieldValue>) => Promise<void>>()
      .mockRejectedValue(new Error(''));
    renderEditor({ onSubmit, onClose });

    await user.type(ruleLabel(), 'Age');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('An error occurred while submitting the form.'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reports a form-level problem instead of submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    renderEditor({
      onSubmit,
      onClose,
      validate: () => ({
        formErrors: ['Choose a variable before saving this rule.'],
      }),
    });

    await user.type(ruleLabel(), 'Anything');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Choose a variable before saving this rule.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('attaches a form-level problem to the field it names', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderEditor({
      onSubmit,
      validate: (values) =>
        values.label === 'Age'
          ? { fieldErrors: { label: 'Another rule already uses this name.' } }
          : undefined,
    });

    await user.type(ruleLabel(), 'Age');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Another rule already uses this name.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('asks before discarding a draft that has been edited', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderEditor({ onClose });

    await user.type(ruleLabel(), 'Half typed');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      await screen.findByText(
        'This editor holds changes that have not been saved. Closing it now discards them.',
      ),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('keeps the draft when the researcher decides not to discard it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderEditor({ onClose });

    await user.type(ruleLabel(), 'Half typed');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Keep editing' }),
      ).not.toBeInTheDocument(),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(ruleLabel()).toHaveValue('Half typed');
  });

  it('closes without asking when nothing has been typed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderEditor({ onClose, initialValues: { label: 'Older than 65' } });

    await waitFor(() => expect(ruleLabel()).toHaveValue('Older than 65'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole('button', { name: 'Discard changes' }),
    ).not.toBeInTheDocument();
  });

  it('closes without asking about a draft the researcher has put back by hand', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderEditor({ onClose, initialValues: { label: 'Older than 65' } });

    await waitFor(() => expect(ruleLabel()).toHaveValue('Older than 65'));
    await user.type(ruleLabel(), ' or so');
    // The edit really did register: what follows is a revert, not a no-op.
    expect(ruleLabel()).toHaveValue('Older than 65 or so');
    await user.keyboard('{Backspace>6/}');
    expect(ruleLabel()).toHaveValue('Older than 65');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole('button', { name: 'Keep editing' }),
    ).not.toBeInTheDocument();
  });

  it('ignores a second submit while the first is still saving', async () => {
    const user = userEvent.setup();
    const save = Promise.withResolvers<void>();
    const onSubmit = vi.fn(() => save.promise);
    const onClose = vi.fn();
    renderEditor({ onSubmit, onClose });

    await user.type(ruleLabel(), 'Age');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // The one save that did start still finishes, so the count above is a
    // rejected second submit rather than a broken first one.
    save.resolve();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('cannot be dismissed while a save is in flight', async () => {
    const user = userEvent.setup();
    const save = Promise.withResolvers<void>();
    const onSubmit = vi.fn(() => save.promise);
    const onClose = vi.fn();
    renderEditor({ onSubmit, onClose });

    await user.type(ruleLabel(), 'Age');
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    // Every dismissal is shut off for the duration: the close button is gone,
    // Cancel is disabled, and Escape — which reaches the dialog whether or not
    // a close button is on screen — is ignored.
    expect(
      screen.queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    await user.keyboard('{Escape}');

    expect(
      screen.queryByRole('button', { name: 'Keep editing' }),
    ).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(ruleLabel()).toHaveValue('Age');

    save.resolve();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('leaves a field of the same name in the enclosing form untouched', async () => {
    const user = userEvent.setup();
    const dialogSubmit = vi.fn();
    const stageSubmit = vi.fn((_values: Record<string, FieldValue>) => ({
      success: true as const,
    }));

    function StageWithEditor({ children }: { children: ReactNode }) {
      return (
        <DialogProvider>
          <Form onSubmit={stageSubmit}>
            <Field
              name="label"
              label="Stage label"
              component={InputField}
              initialValue="Name generator"
            />
            <SubmitButton>Save stage</SubmitButton>
            {children}
          </Form>
        </DialogProvider>
      );
    }

    render(
      <StageWithEditor>
        <Editor onSubmit={dialogSubmit} />
      </StageWithEditor>,
    );

    await user.type(ruleLabel(), 'Rule one');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(dialogSubmit).toHaveBeenCalledTimes(1));
    expect(dialogSubmit).toHaveBeenCalledWith({ label: 'Rule one' });

    // The enclosing form still holds — and still submits — its own value. It
    // is only reachable once the dialog has gone: an open modal makes the page
    // behind it inert.
    const stageLabel = await screen.findByRole('textbox', {
      name: 'Stage label',
    });
    expect(stageLabel).toHaveValue('Name generator');
    await user.click(screen.getByRole('button', { name: 'Save stage' }));
    await waitFor(() => expect(stageSubmit).toHaveBeenCalledTimes(1));
    expect(stageSubmit).toHaveBeenCalledWith({ label: 'Name generator' });
  });

  it('saves the draft of the dialog whose footer was pressed, not the one behind it', async () => {
    const user = userEvent.setup();
    const firstSubmit = vi.fn();
    const secondSubmit = vi.fn();

    // Two dialogs of the same kind — the same `formId` — mounted at once, as a
    // host leaves them when the next record is opened while the previous one
    // is still animating away. The footer submit control associates with its
    // form by DOM id, and an id shared between the two would resolve to the
    // FIRST form in document order for both dialogs.
    render(
      <DialogProvider>
        <Editor
          initialValues={{ label: 'First rule' }}
          onSubmit={firstSubmit}
        />
        <Editor
          initialValues={{ label: 'Second rule' }}
          onSubmit={secondSubmit}
        />
      </DialogProvider>,
    );

    // Every query here opts into hidden elements: each open modal takes the
    // rest of the page out of the accessibility tree, and two of them mounted
    // together therefore hide each other. A host only ever has one of the two
    // on screen — the other is mid-exit — so this is an artifact of holding
    // both open at once, not something a researcher would meet.
    const dialogs = await screen.findAllByRole('dialog', { hidden: true });
    const [secondDialog] = dialogs.filter(
      (dialog) => within(dialog).queryByDisplayValue('Second rule') !== null,
    );
    if (!secondDialog) throw new Error('The second editor never rendered.');

    await user.click(
      within(secondDialog).getByRole('button', { name: 'Save', hidden: true }),
    );

    await waitFor(() => expect(secondSubmit).toHaveBeenCalledTimes(1));
    expect(secondSubmit).toHaveBeenCalledWith({ label: 'Second rule' });
    expect(firstSubmit).not.toHaveBeenCalled();
  });
});
