import { act, screen, waitFor, within } from '@testing-library/react';
import { expect } from 'vitest';

import type { renderStageEditor } from '../../../testing/renderStageEditor.tsx';

type Harness = ReturnType<typeof renderStageEditor>;

/** The form's editor. */
export const formEditor = () =>
  screen.findByRole('textbox', { name: 'Form content' });

/** The frame of the block for `fieldId`. */
export const blockFor = (editor: HTMLElement, fieldId: string): HTMLElement => {
  const frame = editor.querySelector<HTMLElement>(
    `[data-field-id="${fieldId}"]`,
  );
  if (frame === null) throw new Error(`The form has no field "${fieldId}".`);
  return frame;
};

/**
 * Puts the caret in a field's question, as a click there does in a browser.
 * jsdom has no layout, so the editor cannot find a clicked position: the
 * caret is placed through the document's selection, which the editor reads.
 */
export const caretInQuestion = async (
  harness: Harness,
  editor: HTMLElement,
  fieldId: string,
  offset = 0,
) => {
  const label = blockFor(editor, fieldId).querySelector<HTMLElement>(
    '[data-field-label]',
  );
  if (label === null) throw new Error(`Field "${fieldId}" has no question.`);
  await harness.user.click(label);
  const node = label.firstChild ?? label;
  act(() => {
    const selection = document.getSelection();
    selection?.removeAllRanges();
    const range = document.createRange();
    range.setStart(node, Math.min(offset, node.textContent?.length ?? 0));
    range.collapse(true);
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await waitFor(() => {
    if (!label.contains(document.getSelection()?.anchorNode ?? null)) {
      throw new Error('The caret did not reach the question.');
    }
  });
};

/**
 * Puts the caret at the end of the first paragraph of the form's text, as a
 * click there does in a browser (see `caretInQuestion`).
 */
export const caretAtEndOfFirstParagraph = async (
  harness: Harness,
  editor: HTMLElement,
) => {
  const paragraph = editor.querySelector<HTMLElement>(':scope > p');
  const text = paragraph?.firstChild;
  if (paragraph === null || text === null || text === undefined) {
    throw new Error('The form has no paragraph of text.');
  }
  await harness.user.click(paragraph);
  act(() => {
    const selection = document.getSelection();
    selection?.removeAllRanges();
    const range = document.createRange();
    range.setStart(text, text.textContent?.length ?? 0);
    range.collapse(true);
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await waitFor(() => {
    if (!paragraph.contains(document.getSelection()?.anchorNode ?? null)) {
      throw new Error('The caret did not reach the paragraph.');
    }
  });
};

/** Selects a field the way the keyboard does: Escape from its question. */
export const selectField = async (
  harness: Harness,
  editor: HTMLElement,
  fieldId: string,
) => {
  await caretInQuestion(harness, editor, fieldId);
  await harness.user.keyboard('{Escape}');
  await waitFor(() =>
    expect(blockFor(editor, fieldId)).toHaveAttribute('data-selected'),
  );
};

/** The settings of the selected field. */
export const fieldSettings = async () =>
  within(await screen.findByRole('dialog', { name: 'Field settings' }));

/** The settings button in the tab of the field `fieldId`, once it shows. */
export const settingsButtonOf = (editor: HTMLElement, fieldId: string) =>
  within(blockFor(editor, fieldId)).findByRole('button', {
    name: 'Field settings',
  });

/**
 * Opens a field's settings the way the keyboard does: Escape from its
 * question selects the field, and Enter on it presses the settings button in
 * its tab. Selecting a field opens nothing on its own.
 */
export const openFieldSettings = async (
  harness: Harness,
  editor: HTMLElement,
  fieldId: string,
) => {
  await selectField(harness, editor, fieldId);
  await settingsButtonOf(editor, fieldId);
  await harness.user.keyboard('{Enter}');
  return fieldSettings();
};

/** The attribute list of a new field. */
export const insertPicker = () =>
  screen.findByRole('dialog', { name: 'Attribute of the new field' });

/** The row of the attribute list for the attribute named `name`. */
export const attributeRow = async (name: string) => {
  const picker = within(await insertPicker());
  const row = picker
    .getAllByRole('option')
    .find((option) => option.textContent?.startsWith(name));
  if (row === undefined) throw new Error(`The list does not offer "${name}".`);
  return row;
};

/** Switches the editing language through the menu above the form. */
export const editIn = async (harness: Harness, language: RegExp) => {
  const [trigger] = screen.getAllByRole('button', {
    name: /Editing language/,
  });
  if (trigger === undefined) throw new Error('There is no language menu.');
  await harness.user.click(trigger);
  await harness.user.click(
    await screen.findByRole('menuitemradio', { name: language }),
  );
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
};

/** Puts in a new field from the Field button, and answers with its list. */
export const newFieldPicker = async (harness: Harness) => {
  const editor = await formEditor();
  await harness.user.click(editor);
  await harness.user.click(screen.getByRole('button', { name: 'Field' }));
  return insertPicker();
};

const pickerRows = (picker: HTMLElement) => [
  ...picker.querySelectorAll<HTMLElement>('[role="option"][data-attribute-id]'),
];

/** The attributes the list offers, by id. */
export const offeredIn = (picker: HTMLElement): string[] =>
  pickerRows(picker)
    .filter((row) => row.dataset.unavailable === undefined)
    .flatMap((row) => row.dataset.attributeId ?? []);

/** Why the list will not let `attributeId` be chosen, as shown under it. */
export const reasonIn = (picker: HTMLElement, attributeId: string): string => {
  const row = pickerRows(picker).find(
    (candidate) => candidate.dataset.attributeId === attributeId,
  );
  if (row?.dataset.unavailable === undefined) {
    throw new Error(`The list does not refuse "${attributeId}".`);
  }
  return row.querySelector('[id$="-reason"]')?.textContent ?? '';
};

/**
 * Chooses `attributeId` in a new field's list, and answers with the field's
 * id once the list has gone and the caret is in the field's question.
 */
export const chooseIn = async (
  harness: Harness,
  picker: HTMLElement,
  attributeId: string,
): Promise<string> => {
  const fieldId = picker.getAttribute('data-field-insert-picker') ?? '';
  const row = picker.querySelector<HTMLElement>(
    `[role="option"][data-attribute-id="${attributeId}"]:not([data-unavailable])`,
  );
  if (row === null)
    throw new Error(`The list does not offer "${attributeId}".`);
  await harness.user.click(row);
  const editor = await formEditor();
  await waitFor(() => {
    expect(
      screen.queryByRole('dialog', { name: 'Attribute of the new field' }),
    ).toBeNull();
    expect(editor).toHaveFocus();
    const anchor = document.getSelection()?.anchorNode ?? null;
    const label = blockFor(editor, fieldId).querySelector('[data-field-label]');
    expect(label?.contains(anchor)).toBe(true);
  });
  return fieldId;
};
