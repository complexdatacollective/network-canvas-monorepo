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

  it('closes an open link popover when the field stops being editable', async () => {
    // The trigger is disabled with the rest of the toolbar, but the popover it
    // opened is a portal of its own: its URL box and its Apply and Remove
    // buttons went on running editor commands against a field the host had
    // just made read-only, and the change was reported back as if a
    // researcher had made it.
    const onChange = vi.fn();
    const user = userEvent.setup();
    const field = (readOnly: boolean) => (
      <RichTextEditorField
        id="bio"
        name="bio"
        aria-describedby="bio-hint"
        aria-label="Biography"
        changeMode="input"
        toolbarOptions={{ links: true }}
        value={documentWithText}
        onChange={onChange}
        readOnly={readOnly}
      />
    );
    const { rerender } = render(field(false));
    await screen.findByRole('textbox', { name: 'Biography' });

    await user.click(screen.getByRole('button', { name: 'Add link' }));
    const url = await screen.findByLabelText('Link URL');
    await user.type(url, 'https://example.com');

    rerender(field(true));

    // Gone, rather than merely dimmed: the panel is what could still reach the
    // editor, and with Apply on screen a click on it inserted the link and
    // reported the document back as an edit.
    await waitFor(() => {
      expect(screen.queryByLabelText('Link URL')).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: 'Apply link' }),
    ).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
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

/** The same passage as a stored value, which is the other way in. */
const TWO_PARAGRAPH_DOCUMENT = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Never met' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'in person' }] },
  ],
};

/**
 * The same passage stored as blocks a single-line field has no schema for at
 * all. A value like this is what an author's markdown becomes the moment the
 * field it was written in is turned into a single-line one.
 */
const HEADING_DOCUMENT = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Never met' }],
    },
    { type: 'paragraph', content: [{ type: 'text', text: 'in person' }] },
  ],
};

const LIST_DOCUMENT = {
  type: 'doc',
  content: [
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Never met' }],
            },
          ],
        },
      ],
    },
    { type: 'horizontalRule' },
    { type: 'paragraph', content: [{ type: 'text', text: 'in person' }] },
  ],
};

/**
 * The same passage carrying a mark rather than a block: a phrase the author
 * linked. Whether the schema has a `link` mark is a toolbar option, and by
 * default it does not.
 */
const LINKED_DOCUMENT = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Never met ' },
        {
          type: 'text',
          marks: [{ type: 'link', attrs: { href: 'https://example.com/' } }],
          text: 'in person',
        },
      ],
    },
  ],
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
  type SingleLineProps = Pick<
    ComponentProps<typeof RichTextEditorField>,
    'toolbarOptions' | 'value'
  >;

  const renderSingleLine = (props?: SingleLineProps) => {
    const user = userEvent.setup();

    const singleLineField = (overrides?: SingleLineProps) => (
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
        {...overrides}
      />
    );

    const { rerender } = render(singleLineField());

    return {
      user,
      editor: () => screen.findByRole('textbox', { name: 'Answer' }),
      setValue: (value: JSONContent) => rerender(singleLineField({ value })),
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

  it('spells one boundary per pasted line however deeply it is nested', async () => {
    const field = renderSingleLine();
    const editor = await field.editor();

    fireEvent.focus(editor);
    fireEvent.paste(editor, {
      clipboardData: clipboardOf({
        'text/html': '<ul><li>Never met</li><li>in person</li></ul>',
      }),
    });

    // A list item wraps a paragraph, so counting every block as a boundary
    // spelled this one twice and saved "Never met  in person". Read through
    // `textContent`: `toHaveTextContent` collapses runs of whitespace, and so
    // cannot see the difference at all.
    expect(editor.querySelectorAll('p')).toHaveLength(1);
    expect(editor.textContent).toBe('Never met in person');
  });

  it('drops a pasted paragraph that says nothing rather than spelling it', async () => {
    const field = renderSingleLine();
    const editor = await field.editor();

    fireEvent.focus(editor);
    fireEvent.paste(editor, {
      clipboardData: clipboardOf({
        'text/html': '<p>Never met</p><p></p><p>in person</p><p></p>',
      }),
    });

    // Nothing sits on the other side of an empty paragraph, so there is
    // nothing to separate from: the one in the middle used to double the
    // space, and the one at the end used to leave the line ending in one.
    expect(editor.textContent).toBe('Never met in person');
  });

  /**
   * The schema is not consulted on the way IN: a value is read with
   * `Node.fromJSON`, which builds what it is told to build. Every document
   * that arrives is therefore flattened by the rule a paste uses, so the
   * field cannot be handed a line it has promised it cannot show.
   */
  it('flattens a two-paragraph value it is mounted with', async () => {
    const field = renderSingleLine({ value: TWO_PARAGRAPH_DOCUMENT });
    const editor = await field.editor();

    expect(editor.querySelectorAll('p')).toHaveLength(1);
    expect(editor.textContent).toBe('Never met in person');
  });

  it('flattens a two-paragraph value that arrives later', async () => {
    const field = renderSingleLine();
    const editor = await field.editor();

    field.setValue(TWO_PARAGRAPH_DOCUMENT);

    await waitFor(() => {
      expect(editor.textContent).toBe('Never met in person');
    });
    expect(editor.querySelectorAll('p')).toHaveLength(1);
  });

  it('spells a hard break in an incoming value as a space', async () => {
    // A hard break sits INSIDE the paragraph, so a document holding one is a
    // document the single-line schema was never going to refuse.
    const field = renderSingleLine({
      value: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Never met' },
              { type: 'hardBreak' },
              { type: 'text', text: 'in person' },
            ],
          },
        ],
      },
    });
    const editor = await field.editor();

    expect(editor.querySelector('br:not(.ProseMirror-trailingBreak)')).toBe(
      null,
    );
    expect(editor.textContent).toBe('Never met in person');
  });

  /**
   * A block this schema does not have at all, which is the harder half of the
   * same problem: the flattening cannot ask the editor to read the value
   * first, because reading it is what fails.
   */
  it('flattens a heading it is mounted with', async () => {
    const field = renderSingleLine({ value: HEADING_DOCUMENT });
    const editor = await field.editor();

    expect(editor.querySelectorAll('p')).toHaveLength(1);
    expect(editor.textContent).toBe('Never met in person');
  });

  it('flattens a list and a rule that arrive later', async () => {
    const field = renderSingleLine();
    const editor = await field.editor();

    field.setValue(LIST_DOCUMENT);

    await waitFor(() => {
      expect(editor.textContent).toBe('Never met in person');
    });
    expect(editor.querySelectorAll('p')).toHaveLength(1);
  });

  it('keeps what a field held when it becomes single-line', async () => {
    // Changing the restriction rebuilds the editor around the new schema, and
    // the value it is rebuilt from is the one the host is still holding: the
    // blocks it had a moment ago.
    const multiLineField = (singleLine: boolean) => (
      <RichTextEditorField
        id="label"
        name="label"
        aria-describedby="label-hint"
        aria-label="Answer"
        changeMode="input"
        value={HEADING_DOCUMENT}
        onChange={() => undefined}
        {...(singleLine ? { singleLine: true } : {})}
      />
    );
    const { rerender } = render(multiLineField(false));
    const before = await screen.findByRole('textbox', { name: 'Answer' });
    expect(before.textContent).toBe('Never metin person');

    rerender(multiLineField(true));

    const after = await screen.findByRole('textbox', { name: 'Answer' });
    await waitFor(() => {
      expect(after.textContent).toBe('Never met in person');
    });
  });

  it('keeps typing the host has not been told about when it becomes single-line', async () => {
    // `changeMode="blur"` is the default, and it means the host's `value` is
    // deliberately BEHIND what the field holds for as long as the caret is in
    // it. Changing the restriction rebuilds the editor around a new schema,
    // and rebuilding it from that stale value threw away everything typed
    // since the field was entered — silently, mid-sentence.
    const onChange = vi.fn();
    const user = userEvent.setup();
    const field = (singleLine: boolean) => (
      <RichTextEditorField
        id="label"
        name="label"
        aria-describedby="label-hint"
        aria-label="Answer"
        value={emptyDocument}
        onChange={onChange}
        {...(singleLine ? { singleLine: true } : {})}
      />
    );
    const { rerender } = render(field(false));
    const before = await screen.findByRole('textbox', { name: 'Answer' });

    await user.click(before);
    await user.type(before, 'Never met');
    expect(onChange).not.toHaveBeenCalled();

    rerender(field(true));

    const after = await screen.findByRole('textbox', { name: 'Answer' });
    await waitFor(() => {
      expect(after.textContent).toBe('Never met');
    });
    // And the host is told, because the document it holds is now one the
    // field's schema could not have made a moment ago.
    expect(onChange).toHaveBeenCalled();
  });

  it('flattens typing the host has not been told about', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const field = (singleLine: boolean) => (
      <RichTextEditorField
        id="label"
        name="label"
        aria-describedby="label-hint"
        aria-label="Answer"
        value={emptyDocument}
        onChange={onChange}
        {...(singleLine ? { singleLine: true } : {})}
      />
    );
    const { rerender } = render(field(false));
    const before = await screen.findByRole('textbox', { name: 'Answer' });

    await user.click(before);
    await user.type(before, 'Never met');
    await user.keyboard('{Enter}');
    await user.type(before, 'in person');
    expect(before.querySelectorAll('p')).toHaveLength(2);

    rerender(field(true));

    const after = await screen.findByRole('textbox', { name: 'Answer' });
    await waitFor(() => {
      expect(after.textContent).toBe('Never met in person');
    });
    expect(after.querySelectorAll('p')).toHaveLength(1);
  });

  it('spells a newline inside an incoming text node as a space', async () => {
    // Markdown's own line break: a paragraph holding one arrives as a single
    // text node with the newline still in it, which no schema is going to
    // refuse either. `white-space: pre-wrap` is what the editor renders with,
    // so the field showed the second line under `aria-multiline="false"`.
    const field = renderSingleLine({
      value: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Never met\r\nin person' }],
          },
        ],
      },
    });
    const editor = await field.editor();

    expect(editor.textContent).toBe('Never met in person');
  });

  it('keeps the words of a mark its schema has no room for', async () => {
    // A link is a MARK, and marks are the half of a document the flattener
    // carries through untouched. Turn links off — the default — and the
    // schema has no `link` mark at all, so reading the flattened value fails
    // on the mark instead of on a block, and the reader answers a failure the
    // only way it can: with an empty document. The value said something; the
    // field showed nothing, and the next edit saved the nothing.
    const field = renderSingleLine({ value: LINKED_DOCUMENT });
    const editor = await field.editor();

    expect(editor.textContent).toBe('Never met in person');
    expect(editor.querySelector('a')).toBe(null);
  });

  it('keeps a mark its schema does have', async () => {
    // The other side of the same rule: what is dropped is the mark this
    // schema cannot express, not formatting in general.
    const field = renderSingleLine({
      value: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Never met ' },
              {
                type: 'text',
                marks: [{ type: 'bold' }],
                text: 'in person',
              },
            ],
          },
        ],
      },
    });
    const editor = await field.editor();

    expect(editor.textContent).toBe('Never met in person');
    expect(editor.querySelector('strong')).toHaveTextContent('in person');
  });

  it('keeps a link when the field offers one', async () => {
    const field = renderSingleLine({
      toolbarOptions: { links: true },
      value: LINKED_DOCUMENT,
    });
    const editor = await field.editor();

    expect(editor.textContent).toBe('Never met in person');
    expect(editor.querySelector('a')).toHaveAttribute(
      'href',
      'https://example.com/',
    );
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
