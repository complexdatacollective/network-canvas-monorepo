import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

type Saved = { negativeLabel?: string; prompt?: string };

/**
 * Two paragraphs on the clipboard. jsdom implements no `DataTransfer`, and the
 * editor's paste handler only ever asks one for the flavours it was given.
 */
const TWO_PARAGRAPHS = {
  getData: (type: string) =>
    type === 'text/html' ? '<p>Never met</p><p>in person</p>' : '',
  types: ['text/html'],
  files: [],
  items: [],
} as unknown as DataTransfer;

/**
 * Renders one field and answers with whatever the form was last asked to save,
 * so each test below states the markdown the researcher's editing produced
 * rather than reading the editor's document back.
 */
function renderField(props: { singleLine?: boolean; initialValue?: string }) {
  const user = userEvent.setup();
  const saved: { current: Saved | undefined } = { current: undefined };
  const name = props.singleLine === true ? 'negativeLabel' : 'prompt';

  render(
    <Form
      onSubmit={(values) => {
        saved.current = values as Saved;
        return { success: true };
      }}
    >
      <Field
        name={name}
        label="Answer"
        component={RichTextField}
        initialValue={props.initialValue ?? ''}
        {...(props.singleLine === true ? { singleLine: true } : {})}
      />
      <button type="submit">Save</button>
    </Form>,
  );

  return {
    user,
    saved,
    editor: () => screen.findByRole('textbox', { name: 'Answer' }),
    paragraphs: (editor: HTMLElement) => editor.querySelectorAll('p'),
    save: async () => {
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(saved.current).not.toBeUndefined());
      return saved.current;
    },
  };
}

/**
 * A single-line field holds ONE line, and the schema is what holds it there.
 *
 * The restriction used to live only in the markdown conversion, which meant
 * the editor was free to hold a document the conversion had no way to express
 * and the conversion had to invent a join for it. Two paragraphs became one
 * line separated by a space, so a field whose first paragraph the researcher
 * had just emptied saved "Never met" as " Never met" — a leading space in a
 * label a participant reads.
 */
describe('a single-line rich text field', () => {
  it('saves exactly what was typed after the field is cleared', async () => {
    const field = renderField({ singleLine: true, initialValue: 'No' });
    const editor = await field.editor();

    await field.user.clear(editor);
    await field.user.type(editor, 'Never met');

    expect(field.paragraphs(editor)).toHaveLength(1);
    expect(await field.save()).toEqual({ negativeLabel: 'Never met' });
  });

  it('does not open a second paragraph when Enter is pressed', async () => {
    const field = renderField({ singleLine: true });
    const editor = await field.editor();

    await field.user.click(editor);
    await field.user.type(editor, 'Never met');
    await field.user.keyboard('{Enter}');
    await field.user.type(editor, ' in person');

    expect(field.paragraphs(editor)).toHaveLength(1);
    expect(await field.save()).toEqual({
      negativeLabel: 'Never met in person',
    });
  });

  it('joins the lines of a pasted passage with spaces', async () => {
    const field = renderField({ singleLine: true });
    const editor = await field.editor();

    fireEvent.focus(editor);
    fireEvent.paste(editor, { clipboardData: TWO_PARAGRAPHS });

    expect(field.paragraphs(editor)).toHaveLength(1);
    expect(await field.save()).toEqual({
      negativeLabel: 'Never met in person',
    });
  });

  it('offers no control that would need a second block', async () => {
    const field = renderField({ singleLine: true });
    await field.editor();

    expect(
      screen.queryByRole('button', { name: 'Heading 1' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Bullet list' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Thematic break' }),
    ).not.toBeInTheDocument();
  });
});

/** The restriction is the single-line field's, and nothing else's. */
describe('a multi-line rich text field', () => {
  it('starts a new paragraph when Enter is pressed', async () => {
    const field = renderField({});
    const editor = await field.editor();

    await field.user.click(editor);
    await field.user.type(editor, 'Who do you trust?');
    await field.user.keyboard('{Enter}');
    await field.user.type(editor, 'Name up to five people.');

    expect(field.paragraphs(editor)).toHaveLength(2);
    expect(await field.save()).toEqual({
      prompt: 'Who do you trust?\n\nName up to five people.',
    });
  });
});
