import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';

import DialogForm, {
  DialogFormField,
  type DialogFormProps,
} from '../DialogForm.tsx';

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
});
