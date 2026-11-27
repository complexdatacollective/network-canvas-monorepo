import { act } from '@testing-library/react';
import { NodeSelection } from '@tiptap/pm/state';
import { describe, expect, it, vi } from 'vitest';

import { inlineValuesFor } from '../../../testing/inlineValues';
import {
  doc,
  json,
  paragraph,
  paste,
  press,
  renderSections,
  text,
  value,
} from './sectionEditor';

const line = (...content: Parameters<typeof paragraph>) =>
  doc(paragraph(...content));

describe('an inline value', () => {
  it('is drawn as the consumer draws it, inside one element that names it', async () => {
    const view = renderSections({
      value: line(text('Thanks, '), value('name'), text('.')),
    });
    const textbox = await view.textbox();

    const frame = textbox.querySelector('[data-inline-value="name"]');
    expect(frame).toHaveAttribute('contenteditable', 'false');
    expect(frame?.querySelector('[data-value-pill="name"]')).toHaveTextContent(
      'Name',
    );
    expect(textbox).toHaveTextContent('Thanks, Name.');
  });

  it('is drawn again when the consumer’s version changes, without changing the text', async () => {
    const view = renderSections({
      value: line(text('Thanks, '), value('name')),
    });
    const textbox = await view.textbox();
    const editor = await view.editor();
    const before = json(editor);

    view.change({ inlineValues: inlineValuesFor({ name: 'First name' }) });

    const pill = () => textbox.querySelector('[data-value-pill="name"]');
    expect(pill()).toHaveTextContent('First name');
    // The same editor, with nothing new in its history.
    expect(await view.textbox()).toBe(textbox);
    expect(json(editor)).toEqual(before);
    expect(editor.can().undo()).toBe(false);
    expect(view.onChange).not.toHaveBeenCalled();
  });

  it('is copied as the consumer’s words in plain text', async () => {
    const view = renderSections({
      value: line(text('Thanks, '), value('name'), text('.')),
    });
    const editor = await view.editor();
    // What is copied is what is selected.
    act(() => {
      editor.commands.selectAll();
    });

    const copied = editor.view.serializeForClipboard(
      editor.state.doc.slice(0, editor.state.doc.content.size),
    );

    expect(copied.text).toBe('Thanks, Name.');
    expect(
      copied.dom.querySelector('span[data-inline-value="name"]'),
    ).not.toBeNull();
  });

  it('arrives as the value when pasted, whichever editor it came from', async () => {
    const view = renderSections({ value: line() });
    const editor = await view.editor();

    paste(
      editor,
      '<p>For <span data-inline-value="name"><b>Name</b></span> and <span data-inline-value="relation">Relation</span></p>',
      'For Name and Relation',
    );

    expect(json(editor)).toEqual(
      line(text('For '), value('name'), text(' and '), value('relation')),
    );
  });

  it('arrives as the value from pasted text that spells it out', async () => {
    const view = renderSections({
      value: line(),
      inlineValues: inlineValuesFor(
        { name: 'Name' },
        { written: [{ id: 'name', text: '{name}' }] },
      ),
    });
    const editor = await view.editor();

    paste(editor, '', 'Hello {name}!');

    expect(json(editor)).toEqual(
      line(text('Hello '), value('name'), text('!')),
    );
  });

  it('is activated by Enter while selected, when the consumer asks for it', async () => {
    const onActivate = vi.fn();
    const view = renderSections({
      value: line(text('Hi '), value('name')),
      inlineValues: inlineValuesFor({ name: 'Name' }, { onActivate }),
    });
    const editor = await view.editor();
    act(() => {
      editor.view.dispatch(
        editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 4)),
      );
    });

    press(editor, 'Enter');

    expect(onActivate).toHaveBeenCalledWith('name', expect.any(HTMLElement));
    expect(json(editor)).toEqual(line(text('Hi '), value('name')));
  });

  it('is put in by the insert tools at the caret, replacing a typed trigger', async () => {
    const view = renderSections({
      value: line(text('Hi ')),
    });
    const editor = await view.editor();
    act(() => {
      editor.commands.setTextSelection(4);
    });
    expect(view.insert().trigger).toBe(null);

    act(() => {
      editor.view.someProp('handleTextInput', (handle) =>
        handle(editor.view, 4, 4, '{', () => editor.state.tr),
      );
      editor.commands.insertContent('{');
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(view.insert().trigger).not.toBe(null);

    act(() => {
      view.commands().insertInlineValue('name');
    });

    expect(json(editor)).toEqual(line(text('Hi '), value('name')));
    expect(view.insert().trigger).toBe(null);
  });

  it('is taken out wherever it is in the text, as one undoable edit', async () => {
    const view = renderSections({
      value: doc(
        paragraph(text('Hi '), value('name'), text(', '), value('age')),
        paragraph(value('name'), text('!')),
      ),
    });
    const editor = await view.editor();

    act(() => {
      view.commands().removeInlineValues('name');
    });
    expect(json(editor)).toEqual(
      doc(paragraph(text('Hi , '), value('age')), paragraph(text('!'))),
    );

    act(() => {
      editor.commands.undo();
    });
    expect(json(editor)).toEqual(
      doc(
        paragraph(text('Hi '), value('name'), text(', '), value('age')),
        paragraph(value('name'), text('!')),
      ),
    );
  });
});

describe('the commands of a rich text field', () => {
  it('are one object for the life of the field, which the insert tools are given too', async () => {
    const view = renderSections({ value: line(text('Hi')) });
    const before = await view.editor();
    const first = view.commands();
    expect(view.insert().commands).toBe(first);

    // A placeholder is part of the schema: the field makes a new editor, and
    // the commands stay the same object and act on the new one.
    view.change({ placeholder: 'Write here' });
    const after = await view.editor();
    expect(after).not.toBe(before);
    expect(view.commands()).toBe(first);
    expect(view.insert().commands).toBe(first);

    act(() => {
      after.commands.setTextSelection(3);
    });
    act(() => {
      first.insertInlineValue('name');
    });
    expect(json(after)).toEqual(line(text('Hi'), value('name')));
  });
});
