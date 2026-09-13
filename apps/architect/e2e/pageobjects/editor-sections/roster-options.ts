import { expect, type Page } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';

// NameGeneratorRoster's three list-shaped sections
// (`@codaco/protocol-builder`'s `editors/name-generator-roster/sections/`:
// `CardDisplaySection` "Card display", `SortOptionsSection` "Roster sorting",
// `SearchOptionsSection` "Roster search"). Facts read from that source:
// - All three are capability sections gated on `dataSource`: switched off and
//   disabled on a fresh stage, and `resetOn={DATA_SOURCE}` clears them without
//   asking when the data file changes. ALWAYS pick the data file first.
// - Each switch is named by its own section heading; switching one on writes
//   nothing.
// - Rows are `OptionalList` (a `MultiSelect`) with `immediateAdd`: one click
//   on the list's add button inserts `{}` inline. Each list names its own add
//   button, so no scoping is needed to tell them apart. Within a row, set the
//   SELECT before the text/direction cell: changing an earlier cell nulls
//   every later one (`MultiSelect`'s handleChange).
// - Every cell keeps the `name[i].property` `data-field-name` seam, and the
//   column headings are the cells' own labels: "Attribute" for the column
//   naming a data-file column, plus "Label" or "Direction".
// - Option values are the raw column-header strings and the row selects are
//   native, so `selectOption` works. Saved rows carry exactly the two keys.
// - `searchOptions.matchProperties` is a checkbox group ("Searchable
//   attributes") whose value fills in click order; names need `exact: true`
//   ('name' substring-matches 'first_name').
// - `searchOptions.fuzziness` is the "Search accuracy" Likert scale. Its four
//   settings are tolerances, ascending: 'Exact' (0), 'Close matches only'
//   (0.25), 'Allow small differences' (0.5), 'Allow typos and misspellings'
//   (0.75) — the scale reads the chosen one back through `aria-valuetext`.
export async function addCardDisplayProperties(
  editor: StageEditor,
  rows: { variable: string; label: string }[],
): Promise<void> {
  const section = editor.section('Card display');
  await section
    .getByRole('switch', { name: 'Card display', exact: true })
    .click();
  for (const [index, row] of rows.entries()) {
    await section
      .getByRole('button', { name: 'Add new display property' })
      .click();
    await editor
      .field(`cardOptions.additionalProperties[${index}].variable`)
      .getByRole('combobox', { name: 'Attribute' })
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
  const section = editor.section('Roster sorting');
  await section
    .getByRole('switch', { name: 'Roster sorting', exact: true })
    .click();
  await section.getByRole('button', { name: 'Add new sort rule' }).click();
  await editor
    .field('sortOptions.sortOrder[0].property')
    .getByRole('combobox', { name: 'Attribute' })
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
      .getByRole('combobox', { name: 'Attribute' })
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
    tolerance:
      | 'Exact'
      | 'Close matches only'
      | 'Allow small differences'
      | 'Allow typos and misspellings';
  },
): Promise<void> {
  await editor
    .section('Roster search')
    .getByRole('switch', { name: 'Roster search', exact: true })
    .click();
  for (const property of opts.matchProperties) {
    await editor
      .field('searchOptions.matchProperties')
      .getByRole('checkbox', { name: property, exact: true })
      .check();
  }
  const slider = page.getByRole('slider', { name: 'Search accuracy' });
  // Deterministic keyboard path: End commits the last stop ('Allow typos and
  // misspellings'), then ArrowLeft steps back one committed stop at a time.
  const stops = [
    'Exact',
    'Close matches only',
    'Allow small differences',
    'Allow typos and misspellings',
  ];
  const target = stops.indexOf(opts.tolerance);
  await slider.press('End');
  for (let step = stops.length - 1; step > target; step -= 1) {
    await slider.press('ArrowLeft');
  }
  await expect(slider).toHaveAttribute('aria-valuetext', opts.tolerance);
}
