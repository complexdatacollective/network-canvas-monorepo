import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import Form from '@codaco/fresco-ui/form/Form';

import RichTextField from '../RichTextField.tsx';

describe('RichTextField', () => {
  it('renders required semantics and the seeded markdown through the shared field', async () => {
    render(
      <Form onSubmit={() => ({ success: true })}>
        <Field
          name="prompt"
          label="Prompt text"
          component={RichTextField}
          initialValue="Who do you know?"
          required
        />
      </Form>,
    );

    const editor = await screen.findByRole('textbox', { name: 'Prompt text' });
    expect(editor).toHaveAttribute('aria-required', 'true');
    expect(editor).toHaveTextContent('Who do you know?');
  });

  /**
   * Typing, which is the whole point of the control and the one thing a test
   * environment can silently make impossible.
   *
   * The editor asks where the caret is after every document change, through
   * `Range.getClientRects` and `elementFromPoint` — neither of which jsdom
   * implements on its own. Unanswered, the question throws out of the editor's
   * own transaction, and a test watches the keystrokes land in the DOM while
   * the field's value never changes: a failure that reads as the field being
   * broken rather than as a missing shim. `src/__tests__/setup.ts` answers it.
   */
  it('writes what the researcher types back out as markdown', async () => {
    const user = userEvent.setup();
    let submitted: unknown;
    render(
      <Form
        onSubmit={(values) => {
          submitted = values;
          return { success: true };
        }}
      >
        <Field
          name="prompt"
          label="Prompt text"
          component={RichTextField}
          initialValue=""
        />
        <button type="submit">Save</button>
      </Form>,
    );

    const editor = await screen.findByRole('textbox', { name: 'Prompt text' });
    await user.click(editor);
    await user.type(editor, 'Who do you trust?');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(submitted).toEqual({ prompt: 'Who do you trust?' }),
    );
  });
});
