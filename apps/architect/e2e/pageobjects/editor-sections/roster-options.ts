import { expect, type Page } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';

// NameGeneratorRoster card/sort/search options (sections/CardDisplayOptions,
// SortOptionsForExternalData, SearchOptionsForExternalData). Facts verified
// against source:
// - All three sections are toggleable, gated on `dataSource`, and collapsed
//   on a fresh stage; toggling ON writes nothing. ALWAYS pick the data
//   source first — changing it resets all three areas.
// - Rows are immediateAdd MultiSelects: one click on the list's add button
//   inserts `{}` inline. Each of this stage's three lists names that button
//   for its own contents, so no scoping is needed to tell them apart. Within
//   a row, set the SELECT (Variable/Property) before the text/direction
//   field: changing an earlier row field nulls every later one (MultiSelect
//   handleChange).
// - Variable/Property options are the raw CSV header strings; row selects
//   are native (selectOption works). Saved rows carry exactly the two keys.
// - searchOptions.matchProperties is a checkbox group ('Which attributes
//   should be searchable?') whose value fills in click order; names need
//   exact: true ('name' substring-matches 'first_name').
// - searchOptions.fuzziness is the 'Search accuracy' Likert slider; the
//   pristine thumb rests on index 1 without committing, so one ArrowRight
//   commits index 2 = 0.25 ('High accuracy').
export async function addCardDisplayProperties(
  editor: StageEditor,
  rows: { variable: string; label: string }[],
): Promise<void> {
  const section = editor.section('Card Display Options');
  await section.getByRole('switch', { name: 'Card Display Options' }).click();
  for (const [index, row] of rows.entries()) {
    await section
      .getByRole('button', { name: 'Add new display property' })
      .click();
    await editor
      .field(`cardOptions.additionalProperties[${index}].variable`)
      .getByRole('combobox', { name: 'Variable' })
      .selectOption(row.variable);
    await editor
      .field(`cardOptions.additionalProperties[${index}].label`)
      .getByRole('textbox', { name: 'Label' })
      .fill(row.label);
  }
}

export async function configureSortOptions(
  editor: StageEditor,
  opts: {
    sortOrder: { property: string; direction: 'asc' | 'desc' };
    sortableProperties: { variable: string; label: string }[];
  },
): Promise<void> {
  const section = editor.section('Sort Options');
  await section.getByRole('switch', { name: 'Sort Options' }).click();
  await section.getByRole('button', { name: 'Add new sort rule' }).click();
  await editor
    .field('sortOptions.sortOrder[0].property')
    .getByRole('combobox', { name: 'Property' })
    .selectOption(opts.sortOrder.property);
  await editor
    .field('sortOptions.sortOrder[0].direction')
    .getByRole('combobox', { name: 'Direction' })
    .selectOption(opts.sortOrder.direction);
  for (const [index, row] of opts.sortableProperties.entries()) {
    await section
      .getByRole('button', { name: 'Add new sortable property' })
      .click();
    await editor
      .field(`sortOptions.sortableProperties[${index}].variable`)
      .getByRole('combobox', { name: 'Variable' })
      .selectOption(row.variable);
    await editor
      .field(`sortOptions.sortableProperties[${index}].label`)
      .getByRole('textbox', { name: 'Label' })
      .fill(row.label);
  }
}

export async function configureSearchOptions(
  editor: StageEditor,
  page: Page,
  opts: {
    // Click order becomes the saved array order.
    matchProperties: string[];
    accuracy: 'Low accuracy' | 'Medium accuracy' | 'High accuracy' | 'Exact';
  },
): Promise<void> {
  await editor
    .section('Search Options')
    .getByRole('switch', { name: 'Search Options' })
    .click();
  for (const property of opts.matchProperties) {
    await editor
      .field('searchOptions.matchProperties')
      .getByRole('checkbox', { name: property, exact: true })
      .check();
  }
  const slider = page.getByRole('slider', { name: 'Search accuracy' });
  // Deterministic keyboard path: End commits the last stop ('Exact'), then
  // ArrowLeft steps back one committed stop at a time.
  const stops = ['Low accuracy', 'Medium accuracy', 'High accuracy', 'Exact'];
  const target = stops.indexOf(opts.accuracy);
  await slider.press('End');
  for (let step = stops.length - 1; step > target; step -= 1) {
    await slider.press('ArrowLeft');
  }
  await expect(slider).toHaveAttribute('aria-valuetext', opts.accuracy);
}
