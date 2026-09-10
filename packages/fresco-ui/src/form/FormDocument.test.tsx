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

  it('keeps a document key no field inside the container renders', async () => {
    const user = userEvent.setup();
    const onSubmit = submitted();
    render(
      <Form
        onSubmit={onSubmit}
        initialValues={{ behaviours: { minNodes: 1, maxNodes: 8 } }}
      >
        {/* Declared before the container, so it registers first: the
            container then mounts over a leaf already on screen. */}
        <Field
          name="behaviours.minNodes"
          label="Minimum"
          component={InputField}
        />
        <Field name="behaviours" label="Behaviours" component={ContactField} />
        <SubmitButton>Save</SubmitButton>
      </Form>,
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    // The container is the only field standing at `behaviours`, so whatever it
    // was seeded with is what the form saves there. Seeded from the mounted
    // leaf alone it answers for the whole key, and `maxNodes` — which no field
    // renders — is saved away.
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      behaviours: { minNodes: 1, maxNodes: 8 },
    });
  });

  it('shows a container mounting later the edit made inside it, and the keys beside it', async () => {
    const user = userEvent.setup();

    function RevealedContainer() {
      const [open, setOpen] = useState(false);
      return (
        <Form
          onSubmit={submitted()}
          initialValues={{ settings: { min: 1, max: 2 } }}
        >
          <Field name="settings.min" label="Minimum" component={InputField} />
          <button type="button" onClick={() => setOpen(true)}>
            open
          </button>
          {open && (
            <Field name="settings" label="Settings" component={ShowsValue} />
          )}
        </Form>
      );
    }

    render(<RevealedContainer />);
    const minimum = screen.getByRole('textbox', { name: 'Minimum' });
    await user.clear(minimum);
    await user.type(minimum, '9');
    await user.click(screen.getByRole('button', { name: 'open' }));

    // Both halves at once: the edit the researcher has just made to the leaf,
    // and the key beside it that only the document knows about. Seeded from
    // the document alone the control would show the 1 they replaced; seeded
    // from the mounted leaf alone it would have lost `max`.
    expect(await screen.findByTestId('shown-value')).toHaveTextContent(
      '{"min":"9","max":2}',
    );
  });

  it('gives a container nothing when there is no document to give it', async () => {
    const user = userEvent.setup();
    const onSubmit = submitted();
    render(
      // No document at all: Architect's stage forms register a compound
      // control at `mapOptions` alongside the `mapOptions.*` leaves beside it,
      // and hand the store nothing.
      <Form onSubmit={onSubmit}>
        <Field name="settings.style" label="Style" component={InputField} />
        <Field name="settings" label="View" component={ViewField} />
        <SubmitButton>Save</SubmitButton>
      </Form>,
    );

    await user.type(screen.getByRole('textbox', { name: 'Style' }), 'streets');
    await user.click(screen.getByRole('button', { name: 'set the view' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    // The compound control contributes `zoom` and nothing else. Started on the
    // partial object its leaf sibling had assembled, it would answer for
    // `style` as well — carrying a copy of a key it does not own, and putting
    // it back in an order its caller never wrote.
    expect(Object.keys(submittedSettings(onSubmit))).toEqual(['zoom', 'style']);
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      settings: { zoom: 2, style: 'streets' },
    });
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

/** A control that shows the object it is given, so a test can read it. */
function ShowsValue({ value }: { value?: FieldValue }) {
  return <span data-testid="shown-value">{JSON.stringify(value)}</span>;
}

/** What the form put at `settings`, for a test reading its key order. */
function submittedSettings(
  onSubmit: ReturnType<typeof submitted>,
): Record<string, FieldValue> {
  const settings = onSubmit.mock.calls[0]?.[0].settings;
  if (settings === null || typeof settings !== 'object') {
    throw new Error('the form submitted no settings object');
  }
  return settings as Record<string, FieldValue>;
}

/** A compound control that owns two keys of the object it is given. */
function ViewField({
  value,
  onChange,
}: {
  value?: FieldValue;
  onChange?: (value: FieldValue) => void;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        onChange?.({
          ...(value !== null && typeof value === 'object' ? value : {}),
          zoom: 2,
        })
      }
    >
      set the view
    </button>
  );
}

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
