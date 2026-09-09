import { screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { familyPedigreeStageWith } from '../../editors/family-pedigree/sections/__tests__/pedigreeFixtures.tsx';
import NominationPromptsSection from '../../editors/family-pedigree/sections/NominationPromptsSection.tsx';
import NodePanelsSection from '../../editors/name-generator/sections/panels/NodePanelsSection.tsx';
import type { RowValues } from '../../form/rowDialog.tsx';
import {
  renderStageEditor,
  type RenderStageEditorOptions,
  type StageEditorHarness,
} from '../../testing/renderStageEditor.tsx';
import FormFieldsSection from '../form-fields/FormFieldsSection.tsx';
import PageContentSection from '../page-content/PageContentSection.tsx';
import PromptsSection from '../PromptsSection.tsx';
import {
  TestItemEditor,
  TestItemPreview,
  TestPromptEditor,
  TestPromptPreview,
} from './rowFixtures.tsx';

/**
 * Every list a stage editor edits one row at a time, asked the same questions.
 *
 * They are one mechanism now — Fresco's `ArrayField` as the `component` of a
 * `<Field>`, with a row dialog in the canonical shape — so what they promise a
 * researcher is asked of all of them together rather than list by list, where
 * a list that quietly lost one of these would go on passing its own suite.
 *
 * What each case supplies is only what makes its rows different: where the
 * list lives, what its rows are called, and which control names a row.
 */
type ListCase = Readonly<{
  list: string;
  /** The list's own noun for one of its rows. */
  noun: string;
  addLabel: string;
  /** Where the list lives in the stage document. */
  read: (stage: SectionDoc) => RowValues[];
  /** A saved row holding `text`, under `id`, at `index` in the list. */
  row: (id: string, text: string, index: number) => SectionDoc;
  open: (rows: SectionDoc[]) => RenderStageEditorOptions;
  /** Writes the text that names a row into an open dialog. */
  write: (
    harness: StageEditorHarness,
    dialog: ReturnType<typeof within>,
    text: string,
  ) => Promise<void>;
  /** What a saved row is called. */
  label: (row: RowValues) => unknown;
  /** Everything a NEW row needs beyond its text before it can be saved. */
  complete?: (
    harness: StageEditorHarness,
    dialog: ReturnType<typeof within>,
  ) => Promise<void>;
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
    id: 'name-generator-with-rows',
    type: 'NameGenerator',
    fields: {
      label: 'Name Generator',
      subject: { entity: 'node', type: 'person' },
      form: {
        title: 'Add a person',
        fields: [{ variable: 'name', prompt: "What is this person's name?" }],
      },
      prompts: [{ id: 'prompt-seed', text: 'Who do you know?' }],
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
    row: (id, text) => ({ id, text }),
    label: (row) => row.text,
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
    list: 'the blocks a page shows',
    noun: 'block',
    addLabel: 'Create new content block',
    read: rowsAt('items'),
    row: (id, text) => ({ id, type: 'text', content: text }),
    label: (row) => row.content,
    write: typeInto('Block text'),
    open: (rows) => ({
      stage: {
        id: 'information-with-blocks',
        type: 'Information',
        fields: { label: 'Information', title: 'Welcome', items: rows },
      },
      sections: (
        <PageContentSection
          ItemEditor={TestItemEditor}
          ItemPreview={TestItemPreview}
        />
      ),
    }),
  },
  {
    list: 'the panels a name generator shows',
    noun: 'panel',
    addLabel: 'Create new panel',
    read: rowsAt('panels'),
    row: (id, text) => ({ id, title: text, dataSource: 'existing' }),
    label: (row) => row.title,
    write: typeInto('Panel title'),
    open: (rows) => nameGeneratorWith({ panels: rows }, <NodePanelsSection />),
  },
  {
    list: 'the fields a form collects',
    noun: 'field',
    addLabel: 'Create new form field',
    read: rowsAt('form.fields'),
    // A field is one codebook attribute and the question asked for it, so the
    // attributes are real ones of the fixture's person type and the question
    // is what names a row here.
    row: (id, text, index) => ({
      id,
      variable: index === 0 ? 'relationship_to_ego' : 'flagged',
      prompt: text,
    }),
    label: (row) => row.prompt,
    write: typeInto('Question text'),
    // The attribute is picked rather than typed, and a field that names none
    // cannot be saved at all.
    complete: async (harness, dialog) => {
      await harness.user.selectOptions(
        dialog.getByRole('combobox', { name: 'Attribute' }),
        'age',
      );
    },
    open: (rows) => ({
      stage: {
        id: 'alter-form-with-fields',
        type: 'AlterForm',
        fields: {
          label: 'Alter form',
          subject: { entity: 'node', type: 'person' },
          form: { fields: rows },
          introductionPanel: {
            title: 'About each person',
            text: 'A few more questions.',
          },
        },
      },
      sections: <FormFieldsSection subject="node" />,
    }),
  },
  {
    list: 'the questions a pedigree asks about everybody',
    noun: 'nomination prompt',
    addLabel: 'Create new nomination prompt',
    read: rowsAt('nominationPrompts'),
    row: (id, text) => ({ id, text, variable: 'hasConditionX' }),
    label: (row) => row.text,
    write: typeInto('Prompt text'),
    // Every nomination prompt writes one attribute, and the picker is where it
    // comes from.
    complete: async (harness, dialog) => {
      await harness.user.selectOptions(
        dialog.getByRole('combobox', { name: 'Attribute' }),
        'hasConditionX',
      );
    },
    open: (rows) => ({
      stage: familyPedigreeStageWith({ nominationPrompts: rows }),
      sections: <NominationPromptsSection />,
    }),
  },
];

/** The two rows every case below opens on. */
const seeded = (listCase: ListCase) => [
  listCase.row('row-one', 'Alpha', 0),
  listCase.row('row-two', 'Bravo', 1),
];

const openDialog = async (
  harness: StageEditorHarness,
  name: string,
  index = 0,
) => {
  const trigger = screen.getAllByRole('button', { name })[index];
  if (trigger === undefined) throw new Error(`There is no "${name}" ${index}.`);
  await harness.user.click(trigger);
  return within(await screen.findByRole('dialog'));
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
      name: `Remove ${noun}`,
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
    expect(rows.map((row) => row.id)).toEqual(['row-two', 'row-one']);
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
      listCase.open([listCase.row('row-one', 'Alpha', 0)]),
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
});
