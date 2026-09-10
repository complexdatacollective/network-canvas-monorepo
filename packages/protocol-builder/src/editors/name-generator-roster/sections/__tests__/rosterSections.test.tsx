import { screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { renderStageEditor } from '../../../../testing/renderStageEditor.tsx';
import { withRosterColumns } from '../../rosterInspection.ts';
import CardDisplaySection from '../CardDisplaySection.tsx';
import ExternalDataSourceSection from '../ExternalDataSourceSection.tsx';
import SearchOptionsSection from '../SearchOptionsSection.tsx';
import SortOptionsSection from '../SortOptionsSection.tsx';

/**
 * A roster stage carrying exactly the configuration a test needs. The fixture's
 * own roster stage is the fully configured case; the rest are built here.
 */
const rosterWith = (fields: SectionDoc) => ({
  id: 'roster-under-test',
  type: 'NameGeneratorRoster' as const,
  fields: {
    label: 'Name Generator Roster',
    subject: { entity: 'node', type: 'person' },
    prompts: [{ id: 'prompt-1', text: 'Select people from the roster' }],
    ...fields,
  },
});

const optionsOf = (name: RegExp | string) =>
  within(screen.getByRole('combobox', { name }))
    .getAllByRole('option')
    .map((option) => (option as HTMLOptionElement).value);

/**
 * The one attribute picker inside a named list, for the section that shows two
 * lists and labels every picker "Attribute".
 */
const attributeCellIn = (listLabel: RegExp) =>
  within(screen.getByRole('list', { name: listLabel })).getByRole('combobox', {
    name: /Attribute/,
  }) as HTMLSelectElement;

const optionIn = (listLabel: RegExp, value: string) =>
  [...attributeCellIn(listLabel).options].find(
    (option) => option.value === value,
  );

/**
 * Deletes the only row of a named list, through the row's own remove control
 * and the confirmation it opens. Scoped to the list, because a section showing
 * two of them offers a remove control in each.
 */
const removeTheOnlyRow = async (
  harness: Readonly<{ user: { click(element: Element): Promise<void> } }>,
  listLabel: RegExp,
) => {
  const list = await screen.findByRole('list', { name: listLabel });
  await harness.user.click(
    within(list).getByRole('button', { name: 'Remove item' }),
  );
  await harness.user.click(
    within(await screen.findByRole('dialog')).getByRole('button', {
      name: 'Delete item',
    }),
  );
};

/**
 * The saved stage, opened again the way a host opens one.
 *
 * What a switch reads on REOPENING is a different question from what it reads
 * while the researcher is still editing, and only a fresh render over the saved
 * document can ask it: the switch keeps the researcher's decision for as long
 * as the section is on screen (see `BuilderSection`), so asking the same mount
 * would report that decision back rather than what the stage now holds. The
 * first render is unmounted first, or both would answer at once.
 *
 * `id` and `type` are taken back off: they are the stage's identity, which the
 * host owns and refuses to be handed as fields.
 */
const reopenSaved = (
  harness: Readonly<{ unmount(): void }>,
  saved: SectionDoc,
  sections: ReactNode,
) => {
  harness.unmount();
  const { id: _id, type: _type, ...fields } = saved;
  return renderStageEditor({
    client: withRosterColumns,
    stage: { id: 'roster-under-test', type: 'NameGeneratorRoster', fields },
    sections,
  });
};

/**
 * A roster whose lists name `nickname`, which the fixture's data file does not
 * carry — the state a stage reaches when the file behind it is replaced with
 * one shaped differently, or when the protocol was authored against another
 * file entirely. `dataSource` never changes, so `BuilderSection`'s `resetOn`
 * does not fire and the rows stand.
 */
const rosterNamingALostColumn = () =>
  rosterWith({
    dataSource: 'roster_data',
    cardOptions: {
      additionalProperties: [{ variable: 'nickname', label: 'Nickname' }],
    },
    sortOptions: {
      sortOrder: [{ property: 'nickname', direction: 'asc' }],
      sortableProperties: [{ variable: 'nickname', label: 'Nickname' }],
    },
  });

describe("a roster stage's data file", () => {
  it('shows what the chosen file holds', async () => {
    renderStageEditor({
      client: withRosterColumns,
      stageId: 'name-generator-roster-1',
      sections: <ExternalDataSourceSection />,
    });

    // Read from the file through the resource gateway, not from the codebook:
    // a roster is external data and its columns are whatever it contains.
    expect(
      await screen.findByText(
        'The people in it carry these attributes: age and name.',
      ),
    ).toBeInTheDocument();
  });

  it('refuses to save a roster stage with no data file', async () => {
    const harness = renderStageEditor({
      client: withRosterColumns,
      stage: rosterWith({}),
      sections: <ExternalDataSourceSection />,
    });

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText('Choose the data file this roster lists people from.'),
    ).toBeInTheDocument();
  });

  /**
   * Every other roster section names a column of this file, so a different
   * file makes every one of those a reference to something that may not be
   * there. Leaving them would put a stage half-describing the old file into
   * the protocol, which the schema accepts and the interview renders as an
   * empty card.
   */
  it('clears everything chosen from the old file when the file changes', async () => {
    const harness = renderStageEditor({
      client: withRosterColumns,
      stageId: 'name-generator-roster-1',
      sections: (
        <>
          <ExternalDataSourceSection />
          <CardDisplaySection />
          <SortOptionsSection />
          <SearchOptionsSection />
        </>
      ),
    });

    // The way a researcher swaps rosters: take the old file off the stage,
    // then choose one. Everything chosen from the old file's columns goes with
    // the first half of that.
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove this resource' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: /Select/ }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Roster' }),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.dataSource).toBe('roster_data');
    expect(request?.stageDocument.cardOptions).toBeUndefined();
    expect(request?.stageDocument.sortOptions).toBeUndefined();
    expect(request?.stageDocument.searchOptions).toBeUndefined();
  });
});

describe("what a roster's cards show", () => {
  it('shows the card details a stage arrives with, and saves them unchanged', async () => {
    const harness = renderStageEditor({
      client: withRosterColumns,
      stageId: 'name-generator-roster-1',
      sections: (
        <>
          <ExternalDataSourceSection />
          <CardDisplaySection />
          <SortOptionsSection />
          <SearchOptionsSection />
        </>
      ),
    });

    // The columns arrive from the gateway, so nothing on this stage can be
    // judged until they have: a section rendered before them offers nothing.
    await screen.findByText(
      'The people in it carry these attributes: age and name.',
    );
    // The stage's name, the type it lists, what it asks and how it behaves
    // belong to sections this mount does not include.
    await harness.roundTrip({
      unowned: ['label', 'subject', 'prompts', 'behaviours'],
    });
  });

  it('offers the data file’s own columns', async () => {
    renderStageEditor({
      client: withRosterColumns,
      stage: rosterWith({
        dataSource: 'roster_data',
        cardOptions: {
          additionalProperties: [{ label: 'Age', variable: 'age' }],
        },
      }),
      sections: <CardDisplaySection />,
    });

    await waitFor(() => expect(optionsOf(/Attribute/)).toContain('name'));
    expect(optionsOf(/Attribute/)).toEqual(['age', 'name']);
  });

  /**
   * A row's own cells only display their errors, so a card detail with an
   * attribute and no label reaches the protocol as `{ variable: 'age' }` and
   * fails the roster stage's schema against a path.
   */
  it('refuses to save a card detail with no label', async () => {
    const harness = renderStageEditor({
      client: withRosterColumns,
      stage: rosterWith({
        dataSource: 'roster_data',
        cardOptions: { additionalProperties: [{ label: '', variable: 'age' }] },
      }),
      sections: <CardDisplaySection />,
    });

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText('Every row needs a value in each column.'),
    ).toBeInTheDocument();
  });

  /**
   * The column is not half-missing: the row holds a name, and the name is
   * exactly the problem. Left to the options alone the cell renders BLANK —
   * nothing in the list carries the id — so the researcher sees an empty
   * required cell, cannot find out what it points at, and saves the dangling
   * reference straight back. `cardOptions.additionalProperties` accepts it,
   * and the interview renders a card detail with nothing under it.
   */
  it('says which column a card detail points at when the file lacks it', async () => {
    renderStageEditor({
      client: withRosterColumns,
      stage: rosterNamingALostColumn(),
      sections: <CardDisplaySection />,
    });

    const cell = await waitFor(() => {
      const found = attributeCellIn(/Attributes shown on a card/);
      expect(found.value).toBe('nickname');
      return found;
    });

    // Readable as the current choice rather than blank...
    expect(
      within(cell).getByRole('option', {
        name: 'nickname — this attribute is not in the data file',
      }),
    ).toBeInTheDocument();
    // ...and never choosable afresh.
    expect(optionIn(/Attributes shown on a card/, 'nickname')?.disabled).toBe(
      true,
    );
  });

  it('refuses to save a card detail naming a column the file does not have', async () => {
    const harness = renderStageEditor({
      client: withRosterColumns,
      stage: rosterNamingALostColumn(),
      sections: <CardDisplaySection />,
    });

    await waitFor(() =>
      expect(attributeCellIn(/Attributes shown on a card/).value).toBe(
        'nickname',
      ),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'This row points at an attribute that is not in the data file. Choose another or delete the row.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * The refusal has to be one the researcher can act on, so the way out is
   * part of the behaviour. Choosing an attribute clears the label beside it —
   * a label describes the column it sits next to, and this row now names a
   * different one — so the way out is both halves of the row, and the save
   * goes through once they are both answered.
   */
  it('saves once the card detail is pointed at a column the file has', async () => {
    const harness = renderStageEditor({
      client: withRosterColumns,
      stage: rosterNamingALostColumn(),
      sections: <CardDisplaySection />,
    });

    await waitFor(() =>
      expect(attributeCellIn(/Attributes shown on a card/).value).toBe(
        'nickname',
      ),
    );
    expect(await harness.submit()).toBeNull();

    await harness.user.selectOptions(
      attributeCellIn(/Attributes shown on a card/),
      'age',
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: /Label/ }),
      'Age',
    );

    const request = await harness.submit();
    expect(request?.stageDocument.cardOptions).toEqual({
      additionalProperties: [{ variable: 'age', label: 'Age' }],
    });
    // Pointed elsewhere, so the id it used to hold stops being offered at all.
    expect(optionIn(/Attributes shown on a card/, 'nickname')).toBeUndefined();
  });

  /**
   * Deleting the last row is a decision — this roster's cards show nothing but
   * a name — and the schema says that by the key not being there. An empty
   * array would round-trip as a configured-but-empty list.
   */
  it('writes no card details once the last one is deleted', async () => {
    const harness = renderStageEditor({
      client: withRosterColumns,
      stage: rosterWith({
        dataSource: 'roster_data',
        cardOptions: {
          additionalProperties: [{ variable: 'age', label: 'Age' }],
        },
      }),
      sections: <CardDisplaySection />,
    });

    await removeTheOnlyRow(harness, /Attributes shown on a card/);
    await screen.findByText('No extra attributes are shown on a card.');

    // The switch is untouched by the deletion. The researcher is mid-decision,
    // and closing the section under them would take away the Add button they
    // are reaching for.
    expect(screen.getByRole('switch', { name: 'Card details' })).toBeChecked();

    const request = await harness.submit();
    expect(request).not.toBeNull();
    // `hasOwn` rather than a comparison against undefined: a key left standing
    // over an empty container is exactly the failure this is about, and
    // `toBeUndefined` passes for a `cardOptions` holding `{}`.
    expect(Object.hasOwn(request?.stageDocument ?? {}, 'cardOptions')).toBe(
      false,
    );

    // And the switch now reads off, which is by then the truth about the stage.
    reopenSaved(harness, request!.stageDocument, <CardDisplaySection />);
    expect(
      await screen.findByRole('switch', { name: 'Card details' }),
    ).not.toBeChecked();
  });
});

describe('how a roster is ordered', () => {
  it('offers the file’s columns and the file’s own order', async () => {
    renderStageEditor({
      client: withRosterColumns,
      stage: rosterWith({
        dataSource: 'roster_data',
        sortOptions: { sortOrder: [{ property: 'age', direction: 'desc' }] },
      }),
      sections: <SortOptionsSection />,
    });

    await waitFor(() =>
      expect(optionsOf(/Attribute/)).toEqual(
        expect.arrayContaining(['age', '*']),
      ),
    );
  });

  /**
   * A sort rule that names an attribute but no direction reaches the protocol
   * as `{ property: 'age' }` and fails `SortRuleSchema`.
   */
  it('refuses to save a sort rule with no direction', async () => {
    const harness = renderStageEditor({
      client: withRosterColumns,
      stage: rosterWith({
        dataSource: 'roster_data',
        sortOptions: { sortOrder: [{ property: 'age', direction: '' }] },
      }),
      sections: <SortOptionsSection />,
    });

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText('Every row needs a value in each column.'),
    ).toBeInTheDocument();
  });

  it('refuses a starting order naming a column the file does not have', async () => {
    const harness = renderStageEditor({
      client: withRosterColumns,
      stage: rosterNamingALostColumn(),
      sections: <SortOptionsSection />,
    });

    await waitFor(() =>
      expect(attributeCellIn(/Starting order/).value).toBe('nickname'),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getAllByText(
        'This row points at an attribute that is not in the data file. Choose another or delete the row.',
      ).length,
    ).toBeGreaterThan(0);
  });

  /**
   * Emptying one of the two lists is not emptying the capability: the
   * researcher chose what participants may sort by, and only the starting
   * order went.
   */
  it('keeps the sortable attributes when only the starting order is emptied', async () => {
    const harness = renderStageEditor({
      client: withRosterColumns,
      stage: rosterWith({
        dataSource: 'roster_data',
        sortOptions: {
          sortOrder: [{ property: 'age', direction: 'asc' }],
          sortableProperties: [{ variable: 'age', label: 'Age' }],
        },
      }),
      sections: <SortOptionsSection />,
    });

    await removeTheOnlyRow(harness, /Starting order/);
    await screen.findByText(
      'People appear in the order the data file lists them.',
    );

    const request = await harness.submit();
    expect(request?.stageDocument.sortOptions).toEqual({
      sortableProperties: [{ variable: 'age', label: 'Age' }],
    });

    // The capability still holds a decision, so it is still switched on.
    reopenSaved(harness, request!.stageDocument, <SortOptionsSection />);
    expect(
      await screen.findByRole('switch', { name: 'Roster order' }),
    ).toBeChecked();
  });

  /**
   * The other end of the same rule: with both lists emptied the capability
   * holds nothing, so it leaves the stage entirely rather than staying behind
   * as a `sortOptions` of two empty arrays.
   */
  it('writes no sorting at all once both lists are emptied', async () => {
    const harness = renderStageEditor({
      client: withRosterColumns,
      stage: rosterWith({
        dataSource: 'roster_data',
        sortOptions: {
          sortOrder: [{ property: 'age', direction: 'asc' }],
          sortableProperties: [{ variable: 'age', label: 'Age' }],
        },
      }),
      sections: <SortOptionsSection />,
    });

    await removeTheOnlyRow(harness, /Starting order/);
    await removeTheOnlyRow(harness, /Attributes the participant may sort by/);
    await screen.findByText('The participant cannot reorder the roster.');

    // Still on, because the researcher has not said otherwise.
    expect(screen.getByRole('switch', { name: 'Roster order' })).toBeChecked();

    const request = await harness.submit();
    expect(request).not.toBeNull();
    expect(Object.hasOwn(request?.stageDocument ?? {}, 'sortOptions')).toBe(
      false,
    );

    reopenSaved(harness, request!.stageDocument, <SortOptionsSection />);
    expect(
      await screen.findByRole('switch', { name: 'Roster order' }),
    ).not.toBeChecked();
  });

  it('writes nothing for a roster kept in the file’s own order', async () => {
    const harness = renderStageEditor({
      client: withRosterColumns,
      stage: rosterWith({ dataSource: 'roster_data' }),
      sections: <SortOptionsSection />,
    });

    const request = await harness.submit();
    expect(request).not.toBeNull();
    expect(request?.stageDocument.sortOptions).toBeUndefined();
  });
});

describe('how a participant searches a roster', () => {
  it('matches against the file’s own columns', async () => {
    renderStageEditor({
      client: withRosterColumns,
      stage: rosterWith({
        dataSource: 'roster_data',
        searchOptions: { fuzziness: 0.5, matchProperties: ['name'] },
      }),
      sections: <SearchOptionsSection />,
    });

    expect(await screen.findByRole('checkbox', { name: 'name' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'age' })).not.toBeChecked();
  });

  it('records what the researcher chose to search on', async () => {
    const harness = renderStageEditor({
      client: withRosterColumns,
      stage: rosterWith({
        dataSource: 'roster_data',
        searchOptions: { fuzziness: 0.5, matchProperties: ['name'] },
      }),
      sections: <SearchOptionsSection />,
    });

    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'age' }),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.searchOptions).toMatchObject({
      matchProperties: ['name', 'age'],
    });
  });

  it('writes nothing for a roster the participant cannot search', async () => {
    const harness = renderStageEditor({
      client: withRosterColumns,
      stage: rosterWith({ dataSource: 'roster_data' }),
      sections: <SearchOptionsSection />,
    });

    const request = await harness.submit();
    expect(request).not.toBeNull();
    expect(request?.stageDocument.searchOptions).toBeUndefined();
  });

  /**
   * Switching search on and saving straight away is the commonest way to reach
   * it, and it is exactly the case each half used to excuse the other in: with
   * both empty, neither rule fired and the save left the section for the
   * schema to refuse as `searchOptions.matchProperties` against a path.
   */
  it('refuses a search switched on and left empty, in the section’s own words', async () => {
    const harness = renderStageEditor({
      client: withRosterColumns,
      stage: rosterWith({ dataSource: 'roster_data' }),
      sections: <SearchOptionsSection />,
    });

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Roster search' }),
    );
    await screen.findByRole('group', { name: /Attributes a search matches/ });

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'Choose at least one attribute for a search to match against.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Choose how closely a search must match.'),
    ).toBeInTheDocument();
  });

  /**
   * The other half of the same hole. A stage arriving with attributes and no
   * tolerance is refused by the schema as `searchOptions.fuzziness`, and used
   * to pass here because the empty tolerance excused itself whenever it was
   * the missing half.
   */
  it('refuses attributes chosen with no tolerance', async () => {
    const harness = renderStageEditor({
      client: withRosterColumns,
      stage: rosterWith({
        dataSource: 'roster_data',
        searchOptions: { matchProperties: ['name'] },
      }),
      sections: <SearchOptionsSection />,
    });

    await screen.findByRole('checkbox', { name: 'name' });

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText('Choose how closely a search must match.'),
    ).toBeInTheDocument();
  });

  /**
   * A checked column the data file does not carry, which is the hole the card
   * and sort lists already answer for their own rows. A checkbox group is the
   * worst place for it: a row at least shows an empty cell, whereas a checked
   * attribute the option list does not carry is simply not rendered — so the
   * researcher sees a search that looks fully configured, and saves a search
   * matching against a column that is not there without ever being told.
   *
   * The stage arrives holding it rather than reaching it by a swap, because a
   * swap clears this whole capability (`resetOn`) and there would be nothing
   * left to misjudge.
   */
  it('names a checked attribute the data file does not have', async () => {
    renderStageEditor({
      client: withRosterColumns,
      stage: rosterWith({
        dataSource: 'roster_data',
        searchOptions: { fuzziness: 0.5, matchProperties: ['nickname'] },
      }),
      sections: <SearchOptionsSection />,
    });

    const orphan = await screen.findByRole('checkbox', {
      name: 'nickname — this attribute is not in the data file',
    });
    // On screen and checked, so what the search matches is readable...
    expect(orphan).toBeChecked();
    // ...and the columns the file does carry are still offered beside it.
    expect(screen.getByRole('checkbox', { name: 'name' })).toBeInTheDocument();
  });

  it('refuses to save a search matching an attribute the file does not have', async () => {
    const harness = renderStageEditor({
      client: withRosterColumns,
      stage: rosterWith({
        dataSource: 'roster_data',
        searchOptions: { fuzziness: 0.5, matchProperties: ['nickname'] },
      }),
      sections: <SearchOptionsSection />,
    });

    await screen.findByRole('checkbox', {
      name: 'nickname — this attribute is not in the data file',
    });

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'This search matches an attribute that is not in the data file. Uncheck it and choose another.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * The schema takes any number, so a protocol authored elsewhere can hold a
   * tolerance that is not one of the four this section names. The scale renders
   * from its option list, so such a value would be no position at all: the
   * control reads as unanswered, the thumb parks on the middle option, and the
   * first interaction near it records that option over a setting nobody asked
   * to change.
   */
  it('shows a tolerance the stage was saved with, off the four settings', async () => {
    renderStageEditor({
      client: withRosterColumns,
      stage: rosterWith({
        dataSource: 'roster_data',
        searchOptions: { fuzziness: 0.4, matchProperties: ['name'] },
      }),
      sections: <SearchOptionsSection />,
    });

    expect(await screen.findByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      'Saved setting (0.4)',
    );
  });

  /**
   * And it is not a fifth tolerance: it is only ever on offer while the stage
   * still holds it, so a researcher who moves to a named setting cannot get
   * back to it by picking it again.
   */
  it('stops offering it once a named setting is chosen', async () => {
    const harness = renderStageEditor({
      client: withRosterColumns,
      stage: rosterWith({
        dataSource: 'roster_data',
        searchOptions: { fuzziness: 0.4, matchProperties: ['name'] },
      }),
      sections: <SearchOptionsSection />,
    });

    const slider = await screen.findByRole('slider');
    slider.focus();
    await harness.user.keyboard('{ArrowRight}');

    await waitFor(() =>
      expect(screen.getByRole('slider')).toHaveAttribute(
        'aria-valuetext',
        'Allow small differences',
      ),
    );
    expect(screen.queryByText('Saved setting (0.4)')).toBeNull();

    const request = await harness.submit();
    expect(request?.stageDocument.searchOptions).toMatchObject({
      fuzziness: 0.5,
    });
  });
});
