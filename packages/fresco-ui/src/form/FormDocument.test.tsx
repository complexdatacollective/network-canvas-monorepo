import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import Field from './Field/Field';
import type { FieldValue } from './Field/types';
import InputField from './fields/InputField';
import { FieldsDisabled } from './FieldsDisabled';
import Form from './Form';
import SubmitButton from './SubmitButton';

/** Records the values the form actually submitted. */
const submitted = () =>
  vi.fn<(values: Record<string, FieldValue>) => Promise<{ success: true }>>(
    async () => ({ success: true }),
  );

describe('a form that is handed the document it edits', () => {
  it('starts every field holding what the document has at its own name', () => {
    render(
      <Form onSubmit={submitted()} initialValues={{ title: 'Household' }}>
        <Field name="title" label="Title" component={InputField} />
      </Form>,
    );

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue(
      'Household',
    );
  });

  it('reads a nested path, and submits it back where it came from', async () => {
    const user = userEvent.setup();
    const onSubmit = submitted();
    render(
      <Form
        onSubmit={onSubmit}
        initialValues={{ skipLogic: { action: 'SHOW' } }}
      >
        <Field name="skipLogic.action" label="Action" component={InputField} />
        <SubmitButton>Save</SubmitButton>
      </Form>,
    );

    const action = screen.getByRole('textbox', { name: 'Action' });
    expect(action).toHaveValue('SHOW');
    await user.clear(action);
    await user.type(action, 'SKIP');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      skipLogic: { action: 'SKIP' },
    });
  });

  it('lets a field name its own starting value instead', () => {
    render(
      <Form onSubmit={submitted()} initialValues={{ title: 'Household' }}>
        <Field
          name="title"
          label="Title"
          component={InputField}
          initialValue="Something else"
        />
      </Form>,
    );

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue(
      'Something else',
    );
  });

  it('seeds a field revealed later from the document as it stands then', async () => {
    const user = userEvent.setup();

    function AdvancingDocument() {
      const [document, setDocument] = useState<Record<string, FieldValue>>({
        title: 'Household',
      });
      const [revealed, setRevealed] = useState(false);
      return (
        <Form onSubmit={submitted()} initialValues={document}>
          <Field name="title" label="Title" component={InputField} />
          <button
            type="button"
            onClick={() => {
              setDocument({ title: 'Household', note: 'Written since' });
              setRevealed(true);
            }}
          >
            reveal
          </button>
          {revealed && (
            <Field name="note" label="Note" component={InputField} />
          )}
        </Form>
      );
    }

    render(<AdvancingDocument />);
    await user.click(screen.getByRole('button', { name: 'reveal' }));

    // The document the form opened on had no note at all. A field seeded from
    // that opening reading would arrive empty and write its emptiness back.
    expect(await screen.findByRole('textbox', { name: 'Note' })).toHaveValue(
      'Written since',
    );
  });

  it('does not put back what a mounted container has been emptied of', async () => {
    const user = userEvent.setup();

    function CollapsibleDetail() {
      const [open, setOpen] = useState(false);
      return (
        <Form
          onSubmit={submitted()}
          initialValues={{ contact: { email: 'saved@example.com' } }}
        >
          <Field name="contact" label="Contact" component={ContactField} />
          <button type="button" onClick={() => setOpen(true)}>
            open
          </button>
          {open && (
            <Field name="contact.email" label="Email" component={InputField} />
          )}
        </Form>
      );
    }

    render(<CollapsibleDetail />);
    await user.click(screen.getByRole('button', { name: 'empty it' }));
    await user.click(screen.getByRole('button', { name: 'open' }));

    expect(await screen.findByRole('textbox', { name: 'Email' })).toHaveValue(
      '',
    );
  });
});

/** A control that owns a whole object, and can be told to hold nothing. */
function ContactField({
  onChange,
}: {
  value?: FieldValue;
  onChange?: (value: FieldValue) => void;
}) {
  return (
    <button type="button" onClick={() => onChange?.({})}>
      empty it
    </button>
  );
}

describe('a form nothing in may be edited', () => {
  it('disables every field inside it, however deep', () => {
    render(
      <Form onSubmit={submitted()}>
        <FieldsDisabled disabled>
          <div>
            <Field name="title" label="Title" component={InputField} />
          </div>
        </FieldsDisabled>
      </Form>,
    );

    expect(screen.getByRole('textbox', { name: 'Title' })).toBeDisabled();
  });

  it('leaves a field alone when it says nothing', () => {
    render(
      <Form onSubmit={submitted()}>
        <FieldsDisabled disabled={false}>
          <Field name="title" label="Title" component={InputField} />
        </FieldsDisabled>
      </Form>,
    );

    expect(screen.getByRole('textbox', { name: 'Title' })).toBeEnabled();
  });
});
