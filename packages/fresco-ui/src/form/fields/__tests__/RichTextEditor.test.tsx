import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSONContent } from '@tiptap/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import Field from '../../Field/Field';
import Form from '../../Form';
import SubmitButton from '../../SubmitButton';
import RichTextEditorField from '../RichTextEditor';

const documentWithText = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Existing content' }],
    },
  ],
};

// What a host hands back for "there is nothing here" once its own value has
// been cleared: an adapter that parses stored text into a document returns an
// empty document, never `undefined`. The `value === undefined` branch is
// therefore unreachable from such a host, and this is the document that has to
// reach the editor.
const emptyDocument = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

const otherDocument = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Replacement content' }],
    },
  ],
};

describe('RichTextEditorField', () => {
  it('clears editor content when its controlled value becomes undefined', async () => {
    const { rerender } = render(
      <RichTextEditorField
        id="bio"
        name="bio"
        aria-describedby="bio-hint"
        aria-label="Biography"
        value={documentWithText}
        onChange={() => undefined}
      />,
    );

    const editor = await screen.findByRole('textbox', { name: 'Biography' });
    expect(editor).toHaveTextContent('Existing content');

    rerender(
      <RichTextEditorField
        id="bio"
        name="bio"
        aria-describedby="bio-hint"
        aria-label="Biography"
        value={undefined}
        onChange={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(editor).not.toHaveTextContent('Existing content');
    });
  });

  it('uses the visible field label and disables every editing control when readonly', async () => {
    render(
      <>
        <span id="bio-label">Biography</span>
        <span id="bio-hint">Tell us about yourself</span>
        <RichTextEditorField
          id="bio"
          name="bio"
          aria-labelledby="bio-label"
          aria-describedby="bio-hint"
          value={documentWithText}
          onChange={() => undefined}
          toolbarOptions={{ links: true, thematicBreak: true }}
          readOnly
        />
      </>,
    );

    const editor = await screen.findByRole('textbox', { name: 'Biography' });
    expect(editor).toHaveAccessibleDescription('Tell us about yourself');
    expect(editor).toHaveAttribute('aria-readonly', 'true');

    // EVERY button, asked for as a set rather than one at a time: the link
    // control is a disclosure whose trigger works out its own availability,
    // and it went on reporting itself available — undimmed, and ready to open
    // its popover — while all eleven of its siblings were unavailable.
    const buttons = within(screen.getByRole('toolbar')).getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(1);
    for (const button of buttons) {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-disabled', 'true');
    }
    expect(
      screen.getByRole('button', { name: 'Add link' }),
    ).toBeInTheDocument();

    // Still readable: unavailable to edit is not unavailable to read.
    expect(editor).toHaveTextContent('Existing content');
  });

  /**
   * A button unavailable because of where the caret is says so the way the
   * ARIA toolbar pattern asks: still focusable, marked `aria-disabled`. Only a
   * toolbar whose FIELD nobody can edit leaves the tab order, because there is
   * nothing in it left to go and read.
   */
  it('keeps a button the editor state disables reachable', async () => {
    render(
      <RichTextEditorField
        id="bio"
        name="bio"
        aria-describedby="bio-hint"
        aria-label="Biography"
        value={documentWithText}
        onChange={() => undefined}
      />,
    );

    await screen.findByRole('textbox', { name: 'Biography' });
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toHaveAttribute('aria-disabled', 'true');
    expect(undo).toBeEnabled();
  });

  it('forwards container class, focus, and blur callbacks', async () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const { container } = render(
      <RichTextEditorField
        id="bio"
        name="bio"
        aria-describedby="bio-description"
        aria-label="Biography"
        className="max-w-full"
        value={documentWithText}
        onChange={() => undefined}
        onFocus={onFocus}
        onBlur={onBlur}
      />,
    );

    const editor = await screen.findByRole('textbox', { name: 'Biography' });
    expect(container.querySelector('.max-w-full')).toBeInTheDocument();

    fireEvent.focus(editor);
    fireEvent.blur(editor, { relatedTarget: null });
    expect(onFocus).toHaveBeenCalled();
    expect(onBlur).toHaveBeenCalled();
  });

  // The editor used to keep showing a document its host had already replaced.
  // `setEditable` emits a TipTap update by default, and that emission set a
  // one-shot "ignore the next sync" flag — which then swallowed the host's
  // real change instead of the emission's own echo. In Architect's Information
  // stage that stale document was an image asset's id, and the next submit
  // wrote it back as the text a participant reads (#1393).
  it('applies a host value change to an empty document', async () => {
    const { rerender } = render(
      <RichTextEditorField
        id="bio"
        name="bio"
        aria-describedby="bio-hint"
        aria-label="Biography"
        changeMode="input"
        value={documentWithText}
        onChange={() => undefined}
      />,
    );

    const editor = await screen.findByRole('textbox', { name: 'Biography' });
    expect(editor).toHaveTextContent('Existing content');

    rerender(
      <RichTextEditorField
        id="bio"
        name="bio"
        aria-describedby="bio-hint"
        aria-label="Biography"
        changeMode="input"
        value={emptyDocument}
        onChange={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(editor).not.toHaveTextContent('Existing content');
    });
  });

  // Recognising the echo of the editor's own emission must not become a
  // standing refusal to ever apply that document again: undo followed by redo
  // hands back exactly the document the editor last emitted, and refusing it
  // leaves the editor showing the undone text while the form holds the redone
  // one — invisible, and overwritten by the next keystroke.
  it('applies a host value it previously emitted itself, after an intervening one', async () => {
    let emitted: unknown;
    const onChange = vi.fn((next: unknown) => {
      emitted = next;
    });
    const props = {
      'id': 'bio',
      'name': 'bio',
      'aria-describedby': 'bio-hint',
      'aria-label': 'Biography',
      'onChange': onChange,
    } as const;

    const { rerender } = render(
      <RichTextEditorField {...props} value={documentWithText} />,
    );
    const editor = await screen.findByRole('textbox', { name: 'Biography' });

    // The editor emits its own document (changeMode defaults to 'blur').
    fireEvent.focus(editor);
    fireEvent.blur(editor, { relatedTarget: null });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    // Undo: the host applies an earlier document.
    rerender(<RichTextEditorField {...props} value={otherDocument} />);
    await waitFor(() => {
      expect(editor).toHaveTextContent('Replacement content');
    });

    // Redo: the host applies the document the editor itself emitted.
    rerender(<RichTextEditorField {...props} value={emitted as JSONContent} />);
    await waitFor(() => {
      expect(editor).toHaveTextContent('Existing content');
    });
  });

  it('reports no change merely by mounting', async () => {
    const onChange = vi.fn();
    render(
      <RichTextEditorField
        id="bio"
        name="bio"
        aria-describedby="bio-hint"
        aria-label="Biography"
        changeMode="input"
        value={documentWithText}
        onChange={onChange}
      />,
    );

    await screen.findByRole('textbox', { name: 'Biography' });
    expect(onChange).not.toHaveBeenCalled();
  });

  // Every form disables its fields while it submits, so an emission here made
  // submitting a form a write of whatever the editor was showing.
  it('reports no change when the host disables or re-enables it', async () => {
    const onChange = vi.fn();
    const props = {
      'id': 'bio',
      'name': 'bio',
      'aria-describedby': 'bio-hint',
      'aria-label': 'Biography',
      'changeMode': 'input',
      'value': documentWithText,
      'onChange': onChange,
    } as const;

    const { rerender } = render(<RichTextEditorField {...props} />);
    await screen.findByRole('textbox', { name: 'Biography' });
    onChange.mockClear();

    rerender(<RichTextEditorField {...props} disabled />);
    rerender(<RichTextEditorField {...props} />);

    expect(onChange).not.toHaveBeenCalled();
  });

  // A blocked submit has to land on the control that blocked it. The editable
  // flag lives in the DOM as `contenteditable`, and a non-editable ProseMirror
  // node takes no focus at all, so this only holds while the editable state is
  // restored before the form's focus pass runs.
  it('takes focus when a submit is blocked by its own error', async () => {
    render(
      <Form onSubmit={() => ({ success: true })}>
        <Field
          name="bio"
          label="Biography"
          component={RichTextEditorField}
          changeMode="input"
          required="Biography is required."
        />
        <SubmitButton>Save</SubmitButton>
      </Form>,
    );

    const editor = await screen.findByRole('textbox', { name: 'Biography' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText('Biography is required.')).toBeInTheDocument();
    });
    expect(document.activeElement).toBe(editor);
    expect(editor).toHaveAccessibleDescription(/Biography is required\./);
  });

  it('mounts no toggle group on a links-only toolbar', async () => {
    render(
      <RichTextEditorField
        id="bio"
        name="bio"
        aria-describedby="bio-hint"
        aria-label="Biography"
        value={documentWithText}
        onChange={() => undefined}
        toolbarOptions={{
          bold: false,
          italic: false,
          links: true,
          headings: false,
          lists: false,
          thematicBreak: false,
          history: false,
        }}
      />,
    );

    await screen.findByRole('textbox', { name: 'Biography' });
    // The link control renders at toolbar level; with both formatting
    // toggles disabled there is no toggle set left to group, so an empty
    // `group` element must not be mounted around nothing.
    expect(
      screen.getByRole('button', { name: 'Add link' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('exposes exactly one group role per toolbar section', async () => {
    render(
      <RichTextEditorField
        id="bio"
        name="bio"
        aria-describedby="bio-hint"
        aria-label="Biography"
        value={documentWithText}
        onChange={() => undefined}
        toolbarOptions={{ links: true }}
      />,
    );

    await screen.findByRole('textbox', { name: 'Biography' });
    const groups = screen.getAllByRole('group');
    // A ToggleGroup nested inside a Toolbar.Group wrapper renders two nested
    // group roles announcing nothing new; the merged element must be flat.
    for (const group of groups) {
      expect(group.querySelector('[role="group"]')).toBeNull();
    }
  });
});

/**
 * `singleLine` is a promise about the VALUE — one line of text — so it is kept
 * in the schema rather than by whatever serialises the document afterwards. A
 * serialiser handed two paragraphs has to invent a join for them, and the join
 * shows up in what the researcher saved: Architect's markdown adapter turned a
 * label whose first paragraph had just been emptied into " Never met".
 */
const TWO_PARAGRAPHS = {
  'text/html': '<p>Never <strong>met</strong></p><p>in person</p>',
};

/**
 * A clipboard payload the editor's paste handler can read. jsdom implements no
 * `DataTransfer`, and the handler only ever asks one for the flavours it was
 * given.
 */
const clipboardOf = (data: Readonly<Record<string, string>>) =>
  ({
    getData: (type: string) => data[type] ?? '',
    types: Object.keys(data),
    files: [],
    items: [],
  }) as unknown as DataTransfer;

describe('a single-line RichTextEditorField', () => {
  const renderSingleLine = (
    props?: Pick<ComponentProps<typeof RichTextEditorField>, 'toolbarOptions'>,
  ) => {
    const user = userEvent.setup();

    render(
      <RichTextEditorField
        id="label"
        name="label"
        aria-describedby="label-hint"
        aria-label="Answer"
        singleLine
        changeMode="input"
        value={emptyDocument}
        onChange={() => undefined}
        {...props}
      />,
    );

    return {
      user,
      editor: () => screen.findByRole('textbox', { name: 'Answer' }),
    };
  };

  it('says it is not a multi-line box', async () => {
    const field = renderSingleLine();

    expect(await field.editor()).toHaveAttribute('aria-multiline', 'false');
  });

  it('keeps the document to one paragraph when Enter is pressed', async () => {
    const field = renderSingleLine();
    const editor = await field.editor();

    await field.user.click(editor);
    await field.user.type(editor, 'Never met');
    await field.user.keyboard('{Enter}');
    await field.user.type(editor, ' in person');

    // One paragraph and no hard break inside it. Both matter: the schema
    // refuses the split, and pressing Enter against a schema that refuses it
    // otherwise falls through to inserting a line break instead.
    expect(editor.querySelectorAll('p')).toHaveLength(1);
    expect(editor.querySelector('br:not(.ProseMirror-trailingBreak)')).toBe(
      null,
    );
    expect(editor).toHaveTextContent('Never met in person');
  });

  it('collapses the newlines of pasted plain text', async () => {
    const field = renderSingleLine();
    const editor = await field.editor();

    fireEvent.focus(editor);
    fireEvent.paste(editor, {
      clipboardData: clipboardOf({ 'text/plain': 'Never met\nin person' }),
    });

    expect(editor.querySelectorAll('p')).toHaveLength(1);
    expect(editor).toHaveTextContent('Never met in person');
  });

  it('joins the paragraphs of a pasted passage with spaces', async () => {
    const field = renderSingleLine();
    const editor = await field.editor();

    fireEvent.focus(editor);
    fireEvent.paste(editor, { clipboardData: clipboardOf(TWO_PARAGRAPHS) });

    // Joined rather than clipped: fitting a slice the schema will not hold
    // drops everything after the first block, and a researcher pasting two
    // lines of a question meant both. The line loses its breaks, not its
    // formatting.
    expect(editor.querySelectorAll('p')).toHaveLength(1);
    expect(editor).toHaveTextContent('Never met in person');
    expect(editor.querySelector('strong')).toHaveTextContent('met');
  });

  it('offers no control that would need a block it cannot hold', async () => {
    // Asked for explicitly, and still withheld: a heading, a list or a rule
    // cannot exist in this document, so the button would do nothing.
    const field = renderSingleLine({
      toolbarOptions: { headings: true, lists: true, thematicBreak: true },
    });
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
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
  });
});

/** The restriction belongs to the single-line field, and to nothing else. */
describe('a multi-line RichTextEditorField', () => {
  it('keeps the paragraphs of a pasted passage apart', async () => {
    render(
      <RichTextEditorField
        id="bio"
        name="bio"
        aria-describedby="bio-hint"
        aria-label="Biography"
        changeMode="input"
        value={emptyDocument}
        onChange={() => undefined}
      />,
    );

    const editor = await screen.findByRole('textbox', { name: 'Biography' });
    fireEvent.focus(editor);
    fireEvent.paste(editor, { clipboardData: clipboardOf(TWO_PARAGRAPHS) });

    expect(editor.querySelectorAll('p')).toHaveLength(2);
  });

  it('starts a second paragraph when Enter is pressed', async () => {
    const user = userEvent.setup();
    render(
      <RichTextEditorField
        id="bio"
        name="bio"
        aria-describedby="bio-hint"
        aria-label="Biography"
        changeMode="input"
        value={emptyDocument}
        onChange={() => undefined}
      />,
    );

    const editor = await screen.findByRole('textbox', { name: 'Biography' });
    await user.click(editor);
    await user.type(editor, 'Who do you trust?');
    await user.keyboard('{Enter}');
    await user.type(editor, 'Name up to five people.');

    expect(editor).toHaveAttribute('aria-multiline', 'true');
    expect(editor.querySelectorAll('p')).toHaveLength(2);
  });
});
