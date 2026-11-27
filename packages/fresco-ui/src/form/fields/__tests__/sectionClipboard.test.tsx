import { act, cleanup } from '@testing-library/react';
import { NodeSelection } from '@tiptap/pm/state';
import type { JSONContent } from '@tiptap/react';
import { describe, expect, it } from 'vitest';

import {
  branch,
  copyAll,
  doc,
  field,
  json,
  logic,
  paragraph,
  paste,
  renderSections,
  text,
  value,
} from './sectionEditor';

/** A whole form: text, pills, fields, a logic block holding a field, a file. */
const englishForm = doc(
  { type: 'heading', attrs: { level: 1 }, content: [text('About you')] },
  paragraph(
    text('Please answer the questions below, '),
    value('name'),
    text('.'),
  ),
  field(
    'f1',
    'first_name',
    'What is your first name?',
    'Only during this interview.',
  ),
  field('f2', 'employment', 'What is your employment status?'),
  logic(
    { kind: 'conditions', rows: [{ condition: 'c1', when: 'met' }] },
    {
      type: 'logicBranch',
      attrs: { key: 'c1', meta: { condition: 'c1', when: 'met' } },
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [text('Your work')],
        },
        field('f3', 'employer', 'Who is your employer?'),
      ],
    },
    branch('otherwise'),
  ),
  {
    type: 'assetBlock',
    attrs: {
      assetId: 'network',
      description: 'A network',
      size: null,
      align: 'center',
      autoplay: true,
      loop: true,
    },
  },
);

/** Copies every block of `from` and pastes it into a new, empty document. */
const copyIntoEmpty = async (from: JSONContent, into: JSONContent) => {
  const english = renderSections({ value: from });
  const html = copyAll(await english.editor());
  cleanup();

  // The language being edited changes: the editor is drawn afresh.
  const spanish = renderSections({ value: into });
  const editor = await spanish.editor();
  act(() => {
    editor.commands.selectAll();
  });
  paste(editor, html);
  return { editor, spanish };
};

describe('copying between editors (one language’s document to another’s)', () => {
  it('carries every block: fields with their ids, logic blocks with their branches, values and files', async () => {
    const { editor } = await copyIntoEmpty(englishForm, doc(paragraph()));

    expect(json(editor)).toEqual(englishForm);
  });

  it('pastes a copy beside a field it repeats as a new, indeterminate field', async () => {
    const english = renderSections({
      value: doc(field('f1', 'first_name', 'What is your first name?')),
    });
    const html = copyAll(await english.editor());
    cleanup();

    const spanish = renderSections({
      value: doc(field('f1', 'first_name', '¿Cómo se llama?'), paragraph()),
    });
    const editor = await spanish.editor();
    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    });
    paste(editor, html);

    expect(
      (json(editor).content ?? [])
        .filter((node) => node.type === 'fieldBlock')
        .map((node) => node.attrs),
    ).toEqual([
      { fieldId: 'f1', variable: 'first_name', showValidationHints: false },
      { fieldId: 'new-1', variable: '', showValidationHints: false },
    ]);
  });

  it('pastes what was copied below a selected field, leaving the field as it is', async () => {
    const view = renderSections({
      value: doc(
        field('f1', 'age', 'How old?', 'In years.'),
        paragraph(text('After')),
      ),
    });
    const editor = await view.editor();
    act(() => {
      editor.view.dispatch(
        editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)),
      );
    });

    paste(editor, '<p>Pasted</p>', 'Pasted');

    expect(json(editor)).toEqual(
      doc(
        field('f1', 'age', 'How old?', 'In years.'),
        paragraph(text('Pasted')),
        paragraph(text('After')),
      ),
    );
    const { $from } = editor.state.selection;
    expect($from.parent.textContent).toBe('Pasted');
    expect($from.parentOffset).toBe('Pasted'.length);
  });
});
