import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import type { JSONContent } from '@tiptap/react';
import { describe, expect, it, vi } from 'vitest';

import { inlineValuesFor } from '../../../testing/inlineValues';
import {
  copyAll,
  doc,
  field,
  json,
  paragraph,
  paste,
  press,
  renderSections,
  text,
  value,
} from './sectionEditor';

/** Puts the caret `offset` characters into the label or hint of a field. */
const caretIn = (
  editor: Awaited<ReturnType<ReturnType<typeof renderSections>['editor']>>,
  part: 'fieldLabel' | 'fieldHint',
  offset = 0,
  which = 0,
) => {
  const starts: number[] = [];
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === part) starts.push(position + 1);
  });
  const start = starts[which];
  if (start === undefined) throw new Error(`no ${part}`);
  act(() => {
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, start + offset),
      ),
    );
  });
};

const blockAt = (
  editor: Awaited<ReturnType<ReturnType<typeof renderSections>['editor']>>,
) => {
  const found: number[] = [];
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === 'fieldBlock') found.push(position);
  });
  return found;
};

describe('a field block', () => {
  it('draws its label and hint as text in the consumer’s view, with placeholders when empty', async () => {
    const view = renderSections({
      value: doc(field('f1', 'age', '', 'In years')),
    });
    const textbox = await view.textbox();

    const label = textbox.querySelector('[data-field-label]');
    const hint = textbox.querySelector('[data-field-hint]');
    expect(label).toHaveAttribute('data-placeholder', 'Type the question');
    expect(hint).not.toHaveAttribute('data-placeholder');
    expect(hint).toHaveTextContent('In years');
    // The label and hint are inside the view the consumer draws.
    const frame = textbox.querySelector('[data-field-id="f1"]');
    expect(frame?.querySelector('[data-testid="field-f1"]')).toContainElement(
      label as HTMLElement,
    );
    expect(frame?.querySelector('[data-drag-handle]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('draws a field with no attribute as indeterminate', async () => {
    const view = renderSections({ value: doc(field('f1', '')) });
    const textbox = await view.textbox();

    expect(textbox.querySelector('[data-field-id="f1"]')).toHaveAttribute(
      'data-indeterminate',
    );
  });

  it('moves from the label to the hint, and from the hint to a paragraph after the field, on Enter', async () => {
    const view = renderSections({
      value: doc(field('f1', 'age', 'How old?', 'In years')),
    });
    const editor = await view.editor();

    caretIn(editor, 'fieldLabel', 3);
    press(editor, 'Enter');
    expect(editor.state.selection.$from.parent.type.name).toBe('fieldHint');
    expect(editor.state.selection.$from.parentOffset).toBe(0);
    // The label keeps all its words: Enter does not split it.
    expect(json(editor)).toEqual(
      doc(field('f1', 'age', 'How old?', 'In years')),
    );

    press(editor, 'Enter');
    expect(json(editor)).toEqual(
      doc(field('f1', 'age', 'How old?', 'In years'), paragraph()),
    );
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
  });

  it('keeps the label and hint to one line each', async () => {
    const view = renderSections({
      value: doc(field('f1', 'age', 'How old?', 'In years')),
    });
    const editor = await view.editor();

    caretIn(editor, 'fieldLabel', 3);
    press(editor, 'Enter', { shift: true });
    press(editor, 'Enter', { mod: true });
    caretIn(editor, 'fieldHint', 2);
    press(editor, 'Enter', { shift: true });

    expect(json(editor)).toEqual(
      doc(field('f1', 'age', 'How old?', 'In years')),
    );
  });

  it('flattens text pasted into its label to one line', async () => {
    const view = renderSections({ value: doc(field('f1', 'age')) });
    const editor = await view.editor();

    caretIn(editor, 'fieldLabel');
    paste(
      editor,
      '<h1>How <a href="https://example.com">old</a></h1><ul><li><p>are you?</p></li></ul>',
    );

    expect(json(editor)).toEqual(doc(field('f1', 'age', 'How old are you?')));
  });

  it('moves from the start of the hint to the end of the label on Backspace', async () => {
    const view = renderSections({
      value: doc(field('f1', 'age', 'How old?', 'In years')),
    });
    const editor = await view.editor();

    caretIn(editor, 'fieldHint');
    press(editor, 'Backspace');

    const { $from } = editor.state.selection;
    expect($from.parent.type.name).toBe('fieldLabel');
    expect($from.parentOffset).toBe('How old?'.length);
    expect(json(editor)).toEqual(
      doc(field('f1', 'age', 'How old?', 'In years')),
    );
  });

  it('moves from the end of the label to the start of the hint on Delete, and leaves the hint as it is', async () => {
    const view = renderSections({
      value: doc(field('f1', 'age', 'How old?', 'In years.')),
    });
    const editor = await view.editor();

    caretIn(editor, 'fieldLabel', 'How old?'.length);
    press(editor, 'Delete');

    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    const { $from } = editor.state.selection;
    expect($from.parent.type.name).toBe('fieldHint');
    expect($from.parentOffset).toBe(0);

    // A second Delete is the browser's, a letter at most (jsdom deletes
    // none): the hint is never taken whole.
    press(editor, 'Delete');
    expect(json(editor)).toEqual(
      doc(field('f1', 'age', 'How old?', 'In years.')),
    );
    expect(editor.state.selection.$from.parent.type.name).toBe('fieldHint');
  });

  it('never selects its label or hint as a whole', async () => {
    const view = renderSections({
      value: doc(field('f1', 'age', 'How old?', 'In years.')),
    });
    const editor = await view.editor();

    const parts: string[] = [];
    editor.state.doc.descendants((node, position) => {
      if (NodeSelection.isSelectable(node)) parts.push(node.type.name);
      return position >= 0;
    });
    expect(parts).toEqual(['fieldBlock']);
  });

  it('opens a value selected in its label on Enter, rather than moving to the hint', async () => {
    const onActivate = vi.fn();
    const view = renderSections({
      value: doc({
        type: 'fieldBlock',
        attrs: { fieldId: 'f1', variable: 'age', showValidationHints: false },
        content: [
          { type: 'fieldLabel', content: [text('Hi '), value('name')] },
          { type: 'fieldHint' },
        ],
      }),
      inlineValues: inlineValuesFor({ name: 'Name' }, { onActivate }),
    });
    const editor = await view.editor();

    // The value sits after "Hi ", one in from the start of the label.
    act(() => {
      editor.view.dispatch(
        editor.state.tr.setSelection(
          NodeSelection.create(editor.state.doc, 2 + 'Hi '.length),
        ),
      );
    });
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    press(editor, 'Enter');

    expect(onActivate).toHaveBeenCalledWith('name', expect.any(HTMLElement));
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.$from.parent.type.name).toBe('fieldLabel');
  });

  it('selects an empty field on Backspace, and removes it on a second Backspace', async () => {
    const view = renderSections({
      value: doc(paragraph(text('Intro')), field('f1', 'age')),
    });
    const editor = await view.editor();

    caretIn(editor, 'fieldLabel');
    press(editor, 'Backspace');
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(json(editor)).toEqual(
      doc(paragraph(text('Intro')), field('f1', 'age')),
    );

    press(editor, 'Backspace');
    expect(json(editor)).toEqual(doc(paragraph(text('Intro'))));
  });

  it('leaves a label with words in it alone on Backspace at its start', async () => {
    const view = renderSections({
      value: doc(paragraph(text('Intro')), field('f1', 'age', 'How old?')),
    });
    const editor = await view.editor();

    caretIn(editor, 'fieldLabel');
    press(editor, 'Backspace');

    expect(json(editor)).toEqual(
      doc(paragraph(text('Intro')), field('f1', 'age', 'How old?')),
    );
    expect(editor.state.selection.$from.parent.type.name).toBe('fieldLabel');
  });

  it('selects the field on Escape, and activates it on Enter', async () => {
    const view = renderSections({
      value: doc(field('f1', 'age', 'How old?')),
    });
    const editor = await view.editor();

    caretIn(editor, 'fieldLabel', 2);
    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    let reachedOutside = false;
    const outside = () => {
      reachedOutside = true;
    };
    document.addEventListener('keydown', outside);
    act(() => {
      editor.view.dom.dispatchEvent(escape);
    });
    document.removeEventListener('keydown', outside);

    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.from).toBe(0);
    // Spent on the field: a dialog around the editor is not told.
    expect(reachedOutside).toBe(false);

    press(editor, 'Enter');
    expect(view.onActivate).toHaveBeenCalledWith('f1', expect.any(HTMLElement));
    // Enter on a selected field changes nothing.
    expect(json(editor)).toEqual(doc(field('f1', 'age', 'How old?')));
  });

  it('puts in a new, indeterminate field at the caret on Mod-Shift-F, and says so', async () => {
    const view = renderSections({
      value: doc(paragraph(text('Intro')), paragraph()),
    });
    const editor = await view.editor();

    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    });
    press(editor, 'f', { mod: true, shift: true });

    // In place of the empty line, and the text ends with a line to type in.
    expect(json(editor)).toEqual(
      doc(paragraph(text('Intro')), field('new-1', ''), paragraph()),
    );
    expect(editor.state.selection.$from.parent.type.name).toBe('fieldLabel');
    expect(view.onInsert).toHaveBeenCalledWith({
      fieldId: 'new-1',
      origin: 'keyboard',
      element: expect.any(HTMLElement),
    });
  });

  it('puts a field after the line the caret is in, never inside a list', async () => {
    const view = renderSections({
      value: doc(
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [paragraph(text('One'))] }],
        },
        paragraph(text('After')),
      ),
    });
    const editor = await view.editor();

    act(() => {
      editor.commands.setTextSelection(4);
    });
    press(editor, 'f', { mod: true, shift: true });

    const content = json(editor).content ?? [];
    expect(content.map((node) => node.type)).toEqual([
      'bulletList',
      'fieldBlock',
      'paragraph',
    ]);
  });

  it('gives a pasted copy of a field the document already has a new id and no attribute', async () => {
    const view = renderSections({
      value: doc(field('f1', 'age', 'How old?'), paragraph()),
    });
    const editor = await view.editor();

    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      editor.commands.insertContent([
        field('f1', 'age', 'How old?'),
        field('f2', 'age', 'Your age'),
        field('f3', 'height', 'How tall?'),
      ]);
    });

    expect(
      (json(editor).content ?? [])
        .filter((node) => node.type === 'fieldBlock')
        .map((node) => node.attrs),
    ).toEqual([
      { fieldId: 'f1', variable: 'age', showValidationHints: false },
      { fieldId: 'new-1', variable: '', showValidationHints: false },
      { fieldId: 'new-2', variable: '', showValidationHints: false },
      { fieldId: 'f3', variable: 'height', showValidationHints: false },
    ]);
  });

  it('keeps a field’s id when it is moved', async () => {
    const view = renderSections({
      value: doc(paragraph(text('Intro')), field('f1', 'age', 'How old?')),
    });
    const editor = await view.editor();

    act(() => {
      editor.view.dispatch(
        editor.state.tr.setSelection(
          NodeSelection.create(editor.state.doc, blockAt(editor)[0] ?? 0),
        ),
      );
    });
    press(editor, 'ArrowUp', { mod: true, shift: true });

    expect(json(editor)).toEqual(
      doc(field('f1', 'age', 'How old?'), paragraph(text('Intro'))),
    );
  });

  it('brings back a removed field, with its label, in one undo', async () => {
    const view = renderSections({
      value: doc(
        paragraph(text('Intro')),
        field('f1', 'age', 'How old?', 'In years'),
      ),
    });
    const editor = await view.editor();

    act(() => {
      editor.view.dispatch(
        editor.state.tr.setSelection(
          NodeSelection.create(editor.state.doc, blockAt(editor)[0] ?? 0),
        ),
      );
    });
    press(editor, 'Backspace');
    expect(json(editor)).toEqual(doc(paragraph(text('Intro'))));

    act(() => {
      editor.commands.undo();
    });
    expect(json(editor)).toEqual(
      doc(paragraph(text('Intro')), field('f1', 'age', 'How old?', 'In years')),
    );
  });

  it('starts a paragraph below a selected field when text is typed over it', async () => {
    const view = renderSections({
      value: doc(field('f1', 'age', 'How old?')),
    });
    const editor = await view.editor();

    act(() => {
      editor.view.dispatch(
        editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)),
      );
    });
    act(() => {
      editor.view.someProp('handleTextInput', (handle) =>
        handle(editor.view, 0, 0, 'N', () => editor.state.tr),
      );
    });

    expect(json(editor)).toEqual(
      doc(field('f1', 'age', 'How old?'), paragraph(text('N'))),
    );
  });

  it('tells its view when it is the selection', async () => {
    const view = renderSections({
      value: doc(paragraph(text('Intro')), field('f1', 'age', 'How old?')),
    });
    const textbox = await view.textbox();
    const editor = await view.editor();
    const fieldView = () => textbox.querySelector('[data-testid="field-f1"]');
    expect(fieldView()).toHaveAttribute('data-view-selected', 'false');

    act(() => {
      editor.view.dispatch(
        editor.state.tr.setSelection(
          NodeSelection.create(editor.state.doc, blockAt(editor)[0] ?? 0),
        ),
      );
    });

    await waitFor(() =>
      expect(fieldView()).toHaveAttribute('data-view-selected', 'true'),
    );
    expect(textbox.querySelector('[data-field-id="f1"]')).toHaveAttribute(
      'data-selected',
    );
  });

  it('is put in by the insert tools with the caret in its label, and gives back its frame', async () => {
    const view = renderSections({ value: doc(paragraph(text('Intro'))) });
    const editor = await view.editor();
    act(() => {
      editor.commands.setTextSelection(3);
    });

    let element: HTMLElement | null = null;
    act(() => {
      element = view
        .commands()
        .insertFieldBlock({ fieldId: 'f9', variable: 'age' });
    });

    expect(element).toBeInstanceOf(HTMLElement);
    expect(json(editor)).toEqual(
      doc(paragraph(text('Intro')), field('f9', 'age'), paragraph()),
    );
    expect(editor.state.selection.$from.parent.type.name).toBe('fieldLabel');
  });

  it('cannot be put in a field that holds none', async () => {
    const view = renderSections({ fieldBlocks: null, logicBlocks: null });
    const editor = await view.editor();

    expect(view.insert().canInsertSections).toBe(false);
    expect(
      view.commands().insertFieldBlock({ fieldId: 'f', variable: '' }),
    ).toBe(null);
    press(editor, 'f', { mod: true, shift: true });
    expect(json(editor)).toEqual(doc(paragraph(text('Hello'))));
  });
});

describe('a field block with no text', () => {
  const noText = { fieldBlocks: { text: 'none' } } as const;
  /** A field block as a field with no text holds it. */
  const atom = (fieldId: string, variable: string): JSONContent => ({
    type: 'fieldBlock',
    attrs: { fieldId, variable, showValidationHints: false },
  });

  it('is one unit without a label or hint, and its view is given no text', async () => {
    const document = doc(paragraph(text('Intro')), atom('f1', 'age'));
    const view = renderSections({ ...noText, value: document });
    const textbox = await view.textbox();

    expect(json(await view.editor())).toEqual(document);
    expect(textbox.querySelector('[data-field-label]')).toBe(null);
    expect(textbox.querySelector('[data-field-text]')).toBe(null);
    expect(screen.getByTestId('field-f1')).toHaveAttribute(
      'data-view-empty',
      'true',
    );
  });

  it('opens a document whose fields contain their text without the text', async () => {
    const view = renderSections({
      ...noText,
      value: doc(paragraph(text('Intro')), field('f1', 'age', 'How old?')),
    });

    expect(json(await view.editor())).toEqual(
      doc(paragraph(text('Intro')), atom('f1', 'age')),
    );
  });

  it('is put in without text, by the insert tools and by Mod-Shift-F', async () => {
    const view = renderSections({
      ...noText,
      value: doc(paragraph(text('Intro'))),
    });
    const editor = await view.editor();
    act(() => {
      editor.commands.setTextSelection(3);
    });
    act(() => {
      view.commands().insertFieldBlock({ fieldId: 'f9', variable: 'age' });
    });
    expect(json(editor)).toEqual(
      doc(paragraph(text('Intro')), atom('f9', 'age'), paragraph()),
    );

    act(() => {
      editor.commands.focus('end');
    });
    press(editor, 'f', { mod: true, shift: true });
    expect(view.onInsert).toHaveBeenCalledWith(
      expect.objectContaining({ fieldId: 'new-1', origin: 'keyboard' }),
    );
    expect(
      (json(editor).content ?? []).filter((node) => node.type === 'fieldBlock'),
    ).toEqual([atom('f9', 'age'), atom('new-1', '')]);
  });

  it('has no place for the caret inside it', async () => {
    const view = renderSections({
      ...noText,
      value: doc(
        paragraph(text('Intro')),
        atom('f1', 'age'),
        paragraph(text('Outro')),
      ),
    });
    const editor = await view.editor();

    // ProseMirror moves the caret over an atom, and has no position in it.
    expect(editor.schema.nodes.fieldBlock?.isAtom).toBe(true);
    const parents = new Set<string>();
    for (
      let position = 0;
      position <= editor.state.doc.content.size;
      position += 1
    ) {
      parents.add(editor.state.doc.resolve(position).parent.type.name);
    }
    expect([...parents].toSorted()).toEqual(['doc', 'paragraph']);
  });

  it('arrives without its text when pasted from a field whose blocks contain it, and the other way round', async () => {
    const withText = renderSections({
      value: doc(
        paragraph(text('Intro')),
        field('f1', 'age', 'How old?', 'In years'),
      ),
    });
    const copiedWithText = copyAll(await withText.editor());
    cleanup();

    const withoutText = renderSections({
      ...noText,
      value: doc(paragraph()),
    });
    const target = await withoutText.editor();
    paste(target, copiedWithText);
    expect(json(target)).toEqual(
      doc(paragraph(text('Intro')), atom('f1', 'age')),
    );
    const copiedWithoutText = copyAll(target);
    cleanup();

    const back = renderSections({ value: doc(paragraph()) });
    const into = await back.editor();
    paste(into, copiedWithoutText);
    // The field keeps its identity; with no text of its own from the host,
    // its label and hint arrive empty.
    expect(json(into)).toEqual(
      doc(paragraph(text('Intro')), field('f1', 'age')),
    );
  });

  it('takes its field’s own text from the host when it arrives in a field whose blocks contain text', async () => {
    const textOf = (fieldId: string) =>
      fieldId === 'f1'
        ? field('f1', 'age', '¿Cuántos años?').content
        : undefined;
    const view = renderSections({
      fieldBlocks: { textOf },
      value: doc(field('f2', 'town', 'Where?'), paragraph()),
    });
    const editor = await view.editor();

    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    });
    const block = (fieldId: string, variable: string, inside = '') =>
      `<div data-field-block="" data-field-id="${fieldId}" data-variable="${variable}">${inside}</div>`;
    paste(
      editor,
      [
        block('f1', 'age'),
        // Already in the document: a new field, which has no text to take.
        block('f2', 'town'),
        // A field with text of its own keeps it.
        block(
          'f3',
          'height',
          '<div data-field-label="">How tall?</div><div data-field-hint=""></div>',
        ),
      ].join(''),
    );

    expect(
      (json(editor).content ?? []).filter((node) => node.type === 'fieldBlock'),
    ).toEqual([
      field('f2', 'town', 'Where?'),
      field('f1', 'age', '¿Cuántos años?'),
      field('new-1', ''),
      field('f3', 'height', 'How tall?'),
    ]);
    // One edit: Undo takes the pasted fields and their text out together.
    act(() => {
      editor.commands.undo();
    });
    expect(json(editor)).toEqual(
      doc(field('f2', 'town', 'Where?'), paragraph()),
    );
  });
});
