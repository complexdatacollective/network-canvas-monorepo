import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { JSONContent } from '@tiptap/react';
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
          readOnly
        />
      </>,
    );

    const editor = await screen.findByRole('textbox', { name: 'Biography' });
    expect(editor).toHaveAccessibleDescription('Tell us about yourself');
    expect(editor).toHaveAttribute('aria-readonly', 'true');
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
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
