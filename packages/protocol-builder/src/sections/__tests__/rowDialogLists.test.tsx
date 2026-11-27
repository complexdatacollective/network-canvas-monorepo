import {
  type BoundFunctions,
  type queries,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import {
  fieldBlockMarkdown,
  isProtocolObjectId,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { RowValues } from '../../form/rowDialog.tsx';
import { translationText } from '../../localization/localizedText.ts';
import {
  fixtureTypeId,
  fixtureVariableId,
} from '../../testing/protocolFixture.ts';
import {
  renderStageEditor,
  type RenderStageEditorOptions,
  type StageEditorHarness,
} from '../../testing/renderStageEditor.tsx';
import { testId } from '../../testing/testId.ts';
import NodePanelsSection from '../panels/NodePanelsSection.tsx';
import PromptsSection from '../PromptsSection.tsx';
import { TestPromptEditor, TestPromptPreview } from './rowFixtures.tsx';

const PERSON = fixtureTypeId('node', 'person');
const NAME = fixtureVariableId({ entity: 'node', typeName: 'person' }, 'name');

const en = (text: string) => ({ 'en-US': text });

/** What a row's copy reads as in the fixture's one language. */
const englishOf = (value: unknown) => translationText(value, 'en-US');

/**
 * Every list a stage editor edits one row at a time, asked the same questions.
 *
 * They are one mechanism — Fresco's `ArrayField` as the `component` of a
 * `<Field>`, with a row dialog in the canonical shape — so what they promise a
 * researcher is asked of all of them together rather than list by list, where
 * a list that quietly lost one of these would go on passing its own suite.
 *
 * What each case supplies is only what makes its rows different: where the
 * list lives, what its rows are called, and which control names a row.
 */
/**
 * A row's open dialog, with the element it was found as.
 *
 * The element is carried because the attribute picker opens a SECOND dialog on
 * top of a row editor, so "the dialog" is ambiguous while its window is up:
 * the window is the one that is not this element.
 */
type OpenDialog = BoundFunctions<typeof queries> & { element: HTMLElement };

type ListCase = Readonly<{
  list: string;
  noun: string;
  addLabel: string;
  /** Where the list lives in the stage document. */
  read: (stage: SectionDoc) => RowValues[];
  /** A saved row of this list, as the stage document holds it. */
  row: (id: string, text: string, index: number) => SectionDoc;
  open: (rows: SectionDoc[]) => RenderStageEditorOptions;
  /** Writes the text that names a row into an open dialog. */
  write: (
    harness: StageEditorHarness,
    dialog: OpenDialog,
    text: string,
  ) => Promise<void>;
  /** What the list shows for a saved row when its dialog is closed. */
  label: (row: RowValues) => unknown;
  /** Everything a NEW row needs beyond its text before it can be saved. */
  complete?: (harness: StageEditorHarness, dialog: OpenDialog) => Promise<void>;
}>;

const rowsAt = (key: string) => (stage: SectionDoc) => {
  const value = key
    .split('.')
    .reduce<unknown>(
      (held, segment) =>
        typeof held === 'object' && held !== null
          ? Reflect.get(held, segment)
          : undefined,
      stage,
    );
  return Array.isArray(value) ? (value as RowValues[]) : [];
};

const typeInto =
  (control: string) =>
  async (
    harness: StageEditorHarness,
    dialog: ReturnType<typeof within>,
    text: string,
  ) => {
    const field = dialog.getByRole('textbox', { name: control });
    await harness.user.clear(field);
    if (text !== '') await harness.user.type(field, text);
  };

const nameGeneratorWith = (
  fields: SectionDoc,
  sections: ReactNode,
): RenderStageEditorOptions => ({
  stage: {
    id: testId('name-generator-with-rows'),
    type: 'NameGenerator',
    fields: {
      label: en('Name Generator'),
      subject: { entity: 'node', type: PERSON },
      form: {
        title: en('Add a person'),
        content: en(fieldBlockMarkdown(testId('field-1'))),
        fields: [
          {
            id: testId('field-1'),
            variable: NAME,
            prompt: en("What is this person's name?"),
          },
        ],
      },
      prompts: [{ id: testId('prompt-seed'), text: en('Who do you know?') }],
      ...fields,
    },
  },
  sections,
});

const lists: readonly ListCase[] = [
  {
    list: 'the prompts a stage asks',
    noun: 'prompt',
    addLabel: 'Create new prompt',
    read: rowsAt('prompts'),
    row: (id, text) => ({ id, text: en(text) }),
    label: (row) => englishOf(row.text),
    write: typeInto('Prompt text'),
    open: (rows) =>
      nameGeneratorWith(
        { prompts: rows },
        <PromptsSection
          PromptEditor={TestPromptEditor}
          PromptPreview={TestPromptPreview}
          requiresSubject={false}
        />,
      ),
  },
  {
    list: 'the panels a name generator shows',
    noun: 'panel',
    addLabel: 'Add new panel',
    read: rowsAt('panels'),
    row: (id, text) => ({ id, title: en(text), dataSource: 'existing' }),
    label: (row) => englishOf(row.title),
    write: typeInto('Panel title'),
    open: (rows) => nameGeneratorWith({ panels: rows }, <NodePanelsSection />),
  },
];

/** The two rows every case below opens on. */
const seeded = (listCase: ListCase) => [
  listCase.row(testId('row-one'), 'Alpha', 0),
  listCase.row(testId('row-two'), 'Bravo', 1),
];

const openDialog = async (
  harness: StageEditorHarness,
  name: string,
  index = 0,
): Promise<OpenDialog> => {
  const trigger = screen.getAllByRole('button', { name })[index];
  if (trigger === undefined) throw new Error(`There is no "${name}" ${index}.`);
  await harness.user.click(trigger);
  const element = await screen.findByRole('dialog');
  return Object.assign(within(element), { element });
};

const closesDialog = async () =>
  waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0));

describe.each(lists)('$list', (listCase) => {
  const { noun, addLabel } = listCase;

  /**
   * A dialog is a draft: nothing typed in it reaches the stage until the
   * researcher saves. Committing on cancel is the failure that loses the row
   * they were looking at and replaces it with one they abandoned.
   */
  it('leaves the list exactly as it was when a row edit is cancelled', async () => {
    const harness = renderStageEditor(listCase.open(seeded(listCase)));

    const dialog = await openDialog(harness, `Edit ${noun}`, 0);
    await listCase.write(harness, dialog, 'Cancelled');
    await harness.user.click(dialog.getByRole('button', { name: 'Cancel' }));
    // The draft is a change, so the dialog asks before discarding it.
    await harness.user.click(
      await screen.findByRole('button', { name: 'Discard changes' }),
    );
    await closesDialog();

    const saved = await harness.submit();
    expect(
      listCase.read(saved?.stageDocument ?? {}).map(listCase.label),
    ).toEqual(['Alpha', 'Bravo']);
  });

  /**
   * Deleting a row is destructive and irreversible, so it is confirmed — and
   * the confirmation says what is going in the list's own word for a row,
   * because a stage editor shows several lists at once.
   */
  it('names its own rows in the confirmation, and removes only the one confirmed', async () => {
    const harness = renderStageEditor(listCase.open(seeded(listCase)));

    const removes = await screen.findAllByRole('button', {
      name: `Delete ${noun}`,
    });
    await harness.user.click(removes[0]!);

    expect(await screen.findByText(`Delete this ${noun}?`)).toBeInTheDocument();
    await harness.user.click(
      screen.getByRole('button', { name: `Delete ${noun}` }),
    );

    const saved = await harness.submit();
    expect(
      listCase.read(saved?.stageDocument ?? {}).map(listCase.label),
    ).toEqual(['Bravo']);
  });

  /**
   * A reorder moves a row, and a row is more than the words on it: the rest of
   * what it holds — and its identity — has to travel with it.
   */
  it('moves a row without changing which row it is', async () => {
    const harness = renderStageEditor(listCase.open(seeded(listCase)));

    const handles = await screen.findAllByRole('button', {
      name: `Reorder ${noun} 1 of 2`,
    });
    handles[0]!.focus();
    await harness.user.keyboard('{ }{ArrowDown}{ }');

    const saved = await harness.submit();
    expect(saved).not.toBeNull();
    const rows = listCase.read(saved?.stageDocument ?? {});
    expect(rows.map(listCase.label)).toEqual(['Bravo', 'Alpha']);
    expect(rows.map((row) => row.id)).toEqual([
      testId('row-two'),
      testId('row-one'),
    ]);
  });

  /**
   * A row the dialog refuses stays on screen, with the draft in it, and never
   * reaches the list. Closing over a refused row loses the researcher's work
   * and, for a list whose rows the schema checks, hands them a stage that
   * cannot be saved with nothing on screen saying which row is the reason.
   */
  it('refuses a row its own fields reject, and keeps the dialog on it', async () => {
    const harness = renderStageEditor(listCase.open(seeded(listCase)));

    const dialog = await openDialog(harness, `Edit ${noun}`, 0);
    await listCase.write(harness, dialog, '');
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await harness.user.click(dialog.getByRole('button', { name: 'Cancel' }));
    await harness.user.click(
      await screen.findByRole('button', { name: 'Discard changes' }),
    );
    await closesDialog();

    const saved = await harness.submit();
    expect(
      listCase.read(saved?.stageDocument ?? {}).map(listCase.label),
    ).toEqual(['Alpha', 'Bravo']);
  });

  /**
   * The row the researcher wrote, and nothing the list invented for its own
   * bookkeeping: `ArrayField` keys its rows on properties of its own, and one
   * that reached the saved stage would be a key the protocol schema refuses.
   */
  it('carries a new row into the saved stage, holding no key the list invented', async () => {
    // One row rather than two: a side-panel list is at its cap with two, and
    // a list with no Add button has nothing to drive.
    const harness = renderStageEditor(
      listCase.open([listCase.row(testId('row-one'), 'Alpha', 0)]),
    );

    const dialog = await openDialog(harness, addLabel);
    await listCase.write(harness, dialog, 'Charlie');
    await listCase.complete?.(harness, dialog);
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await closesDialog();

    const saved = await harness.submit();
    const rows = listCase.read(saved?.stageDocument ?? {});
    expect(rows.map(listCase.label)).toEqual(['Alpha', 'Charlie']);
    for (const row of rows) {
      expect(Object.keys(row)).not.toContain('_internalId');
      expect(Object.keys(row)).not.toContain('_draft');
    }
  });

  it('keeps every row the same object through add, edit, reorder and delete', async () => {
    const harness = renderStageEditor(
      listCase.open([listCase.row(testId('row-one'), 'Alpha', 0)]),
    );

    const added = await openDialog(harness, addLabel);
    await listCase.write(harness, added, 'Charlie');
    await listCase.complete?.(harness, added);
    await harness.user.click(added.getByRole('button', { name: 'Add' }));
    await closesDialog();

    const afterAdd = listCase.read(
      (await harness.submit())?.stageDocument ?? {},
    );
    const newId = afterAdd[1]?.id;
    expect(isProtocolObjectId(newId)).toBe(true);

    const edited = await openDialog(harness, `Edit ${noun}`, 1);
    await listCase.write(harness, edited, 'Delta');
    await harness.user.click(edited.getByRole('button', { name: 'Save' }));
    await closesDialog();

    const handles = await screen.findAllByRole('button', {
      name: `Reorder ${noun} 2 of 2`,
    });
    handles[0]!.focus();
    await harness.user.keyboard('{ }{ArrowUp}{ }');

    const afterMove = listCase.read(
      (await harness.submit())?.stageDocument ?? {},
    );
    expect(afterMove.map(listCase.label)).toEqual(['Delta', 'Alpha']);
    expect(afterMove.map((row) => row.id)).toEqual([newId, testId('row-one')]);

    const removes = await screen.findAllByRole('button', {
      name: `Delete ${noun}`,
    });
    await harness.user.click(removes[1]!);
    await harness.user.click(
      await screen.findByRole('button', { name: `Delete ${noun}` }),
    );

    const afterDelete = listCase.read(
      (await harness.submit())?.stageDocument ?? {},
    );
    expect(afterDelete.map((row) => row.id)).toEqual([newId]);
  });

  /**
   * A draft abandoned in a row's dialog is gone, and the row it was made on
   * opens again as the list holds it: the next save writes the stored row
   * under its own id, not the abandoned draft and not a copy.
   */
  it('reopens a row whose draft was discarded as the row the list holds', async () => {
    const harness = renderStageEditor(listCase.open(seeded(listCase)));

    const abandoned = await openDialog(harness, `Edit ${noun}`, 1);
    await listCase.write(harness, abandoned, 'Abandoned');
    await harness.user.click(abandoned.getByRole('button', { name: 'Cancel' }));
    await harness.user.click(
      await screen.findByRole('button', { name: 'Discard changes' }),
    );
    await closesDialog();

    const reopened = await openDialog(harness, `Edit ${noun}`, 1);
    await harness.user.click(reopened.getByRole('button', { name: 'Save' }));
    await closesDialog();

    const rows = listCase.read((await harness.submit())?.stageDocument ?? {});
    expect(rows.map(listCase.label)).toEqual(['Alpha', 'Bravo']);
    expect(rows.map((row) => row.id)).toEqual([
      testId('row-one'),
      testId('row-two'),
    ]);
  });
});
