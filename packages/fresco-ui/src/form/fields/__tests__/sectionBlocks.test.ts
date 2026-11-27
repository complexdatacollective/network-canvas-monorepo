import { act } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it, vi } from 'vitest';

import { startBlockDrag } from '../richText/blockFrames';
import {
  branch,
  doc,
  field,
  json,
  logic,
  paragraph,
  press,
  renderSections,
  text,
} from './sectionEditor';

const IF = { kind: 'conditions' };

/** Selects the field block with `fieldId`, whole. */
const selectField = (editor: Editor, fieldId: string) => {
  let at: number | undefined;
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === 'fieldBlock' && node.attrs.fieldId === fieldId) {
      at = position;
    }
  });
  if (at === undefined) throw new Error(`no field ${fieldId}`);
  const position = at;
  act(() => {
    editor.view.dispatch(
      editor.state.tr.setSelection(
        NodeSelection.create(editor.state.doc, position),
      ),
    );
  });
};

const up = (editor: Editor) =>
  press(editor, 'ArrowUp', { mod: true, shift: true });
const down = (editor: Editor) =>
  press(editor, 'ArrowDown', { mod: true, shift: true });

const selectedFieldId = (editor: Editor): unknown => {
  const { selection } = editor.state;
  return selection instanceof NodeSelection
    ? selection.node.attrs.fieldId
    : selection.$from.node(selection.$from.depth - 1).attrs.fieldId;
};

describe('moving a section from the keyboard', () => {
  it('moves a selected field past the blocks beside it, and keeps it selected', async () => {
    const view = renderSections({
      value: doc(
        paragraph(text('One')),
        field('f1', 'age', 'How old?'),
        paragraph(text('Two')),
      ),
    });
    const editor = await view.editor();
    selectField(editor, 'f1');

    down(editor);
    expect(json(editor)).toEqual(
      doc(
        paragraph(text('One')),
        paragraph(text('Two')),
        field('f1', 'age', 'How old?'),
      ),
    );
    expect(selectedFieldId(editor)).toBe('f1');

    // Nothing below the last block: it stays.
    down(editor);
    expect(json(editor)).toEqual(
      doc(
        paragraph(text('One')),
        paragraph(text('Two')),
        field('f1', 'age', 'How old?'),
      ),
    );

    up(editor);
    up(editor);
    expect(json(editor)).toEqual(
      doc(
        field('f1', 'age', 'How old?'),
        paragraph(text('One')),
        paragraph(text('Two')),
      ),
    );
  });

  it('moves the field the caret is in, keeping the caret where it was in the text', async () => {
    const view = renderSections({
      value: doc(paragraph(text('One')), field('f1', 'age', 'How old?')),
    });
    const editor = await view.editor();
    // Three letters into the label.
    act(() => {
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, 10),
        ),
      );
    });

    up(editor);

    expect(json(editor)).toEqual(
      doc(field('f1', 'age', 'How old?'), paragraph(text('One'))),
    );
    const { $from } = editor.state.selection;
    expect($from.parent.type.name).toBe('fieldLabel');
    expect($from.parentOffset).toBe(3);
  });

  it('moves a field into a logic block’s branches, through them, and out again', async () => {
    const view = renderSections({
      value: doc(
        field('f1', 'age', 'How old?'),
        logic(
          IF,
          branch('if', paragraph(text('Shown if'))),
          branch('otherwise'),
        ),
        paragraph(text('After')),
      ),
    });
    const editor = await view.editor();
    selectField(editor, 'f1');

    // Into the first branch, at its start.
    down(editor);
    expect(json(editor)).toEqual(
      doc(
        logic(
          IF,
          branch(
            'if',
            field('f1', 'age', 'How old?'),
            paragraph(text('Shown if')),
          ),
          branch('otherwise'),
        ),
        paragraph(text('After')),
      ),
    );

    down(editor);
    down(editor);
    // Into the next branch, which held only an empty line: the field takes
    // its place beside it.
    expect(json(editor)).toEqual(
      doc(
        logic(
          IF,
          branch('if', paragraph(text('Shown if'))),
          branch('otherwise', field('f1', 'age', 'How old?'), paragraph()),
        ),
        paragraph(text('After')),
      ),
    );

    down(editor);
    down(editor);
    // Out of the last branch, which keeps an empty line.
    expect(json(editor)).toEqual(
      doc(
        logic(
          IF,
          branch('if', paragraph(text('Shown if'))),
          branch('otherwise', paragraph()),
        ),
        field('f1', 'age', 'How old?'),
        paragraph(text('After')),
      ),
    );
    expect(selectedFieldId(editor)).toBe('f1');

    // And back in, at the end of the last branch.
    up(editor);
    expect(json(editor)).toEqual(
      doc(
        logic(
          IF,
          branch('if', paragraph(text('Shown if'))),
          branch('otherwise', paragraph(), field('f1', 'age', 'How old?')),
        ),
        paragraph(text('After')),
      ),
    );
  });

  it('moves a whole logic block, with what it holds', async () => {
    const view = renderSections({
      value: doc(
        paragraph(text('One')),
        logic(IF, branch('if', field('f1', 'age', 'How old?'))),
      ),
    });
    const editor = await view.editor();
    act(() => {
      editor.view.dispatch(
        editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 5)),
      );
    });

    up(editor);

    expect(json(editor)).toEqual(
      doc(
        logic(IF, branch('if', field('f1', 'age', 'How old?'))),
        paragraph(text('One')),
      ),
    );
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
  });

  it('moves in one undoable edit', async () => {
    const view = renderSections({
      value: doc(paragraph(text('One')), field('f1', 'age', 'How old?')),
    });
    const editor = await view.editor();
    selectField(editor, 'f1');

    up(editor);
    act(() => {
      editor.commands.undo();
    });

    expect(json(editor)).toEqual(
      doc(paragraph(text('One')), field('f1', 'age', 'How old?')),
    );
  });
});

const bulletList = (...items: string[]) => ({
  type: 'bulletList',
  content: items.map((item) => ({
    type: 'listItem',
    content: [paragraph(text(item))],
  })),
});

const caretAt = (editor: Editor, position: number) => {
  act(() => {
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, position),
      ),
    );
  });
};

describe('moving any block from the keyboard', () => {
  it('moves the paragraph the caret is in, keeping the caret in it', async () => {
    const view = renderSections({
      value: doc(
        paragraph(text('One')),
        paragraph(text('Two')),
        field('f1', 'age', 'How old?'),
      ),
    });
    const editor = await view.editor();
    // Two letters into "Two".
    caretAt(editor, 8);

    down(editor);
    expect(json(editor)).toEqual(
      doc(
        paragraph(text('One')),
        field('f1', 'age', 'How old?'),
        paragraph(text('Two')),
      ),
    );
    const { $from } = editor.state.selection;
    expect($from.parent.textContent).toBe('Two');
    expect($from.parentOffset).toBe(2);
  });

  it('moves a whole list as one block, from the caret in any of its items', async () => {
    const view = renderSections({
      value: doc(
        paragraph(text('Intro')),
        bulletList('Apples', 'Pears'),
        paragraph(text('After')),
      ),
    });
    const editor = await view.editor();
    // In "Pears", the list's second item.
    let pears = 0;
    editor.state.doc.descendants((node, position) => {
      if (node.isText && node.text === 'Pears') pears = position;
    });
    caretAt(editor, pears + 1);

    up(editor);
    expect(json(editor)).toEqual(
      doc(
        bulletList('Apples', 'Pears'),
        paragraph(text('Intro')),
        paragraph(text('After')),
      ),
    );
    // The item did not leave its list.
    expect(editor.state.selection.$from.parent.textContent).toBe('Pears');
  });

  it('moves a selected paragraph and keeps it selected', async () => {
    const view = renderSections({
      value: doc(paragraph(text('One')), paragraph(text('Two'))),
    });
    const editor = await view.editor();
    act(() => {
      editor.view.dispatch(
        editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 5)),
      );
    });

    up(editor);
    expect(json(editor)).toEqual(
      doc(paragraph(text('Two')), paragraph(text('One'))),
    );
    const { selection } = editor.state;
    expect(selection).toBeInstanceOf(NodeSelection);
    expect(selection.from).toBe(0);
  });
});

describe('dragging a block by its handle', () => {
  it('selects the block and carries the whole of it, to be moved where it is dropped', async () => {
    const view = renderSections({
      value: doc(
        paragraph(text('One')),
        field('f1', 'age', 'How old?'),
        paragraph(text('Two')),
      ),
    });
    const editor = await view.editor();
    const data = new Map<string, string>();
    const dataTransfer = {
      clearData: () => data.clear(),
      setData: (type: string, value: string) => data.set(type, value),
      setDragImage: vi.fn(),
      effectAllowed: 'none',
    };
    const image = document.createElement('div');

    act(() => {
      startBlockDrag(
        editor.view,
        5,
        { dataTransfer } as unknown as DragEvent,
        image,
      );
    });

    // The field is the selection, and what is dragged.
    const { selection } = editor.state;
    expect(selection).toBeInstanceOf(NodeSelection);
    expect(selection.from).toBe(5);
    expect(selectedFieldId(editor)).toBe('f1');
    const dragging = editor.view.dragging;
    expect(dragging?.move).toBe(true);
    expect(dragging?.slice.content.childCount).toBe(1);
    expect(dragging?.slice.content.firstChild?.attrs.fieldId).toBe('f1');
    // And what another page is given for it: the block, not the text
    // around it.
    expect(data.get('text/html')).toContain('data-field-block');
    expect(data.get('text/plain')).toContain('How old?');
    expect(data.get('text/plain')).not.toContain('One');
    expect(dataTransfer.effectAllowed).toBe('copyMove');
    expect(dataTransfer.setDragImage).toHaveBeenCalledWith(image, 0, 0);
  });
});
