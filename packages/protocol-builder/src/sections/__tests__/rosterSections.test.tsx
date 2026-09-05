import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
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

describe("a roster stage's data file", () => {
  it('shows what the chosen file holds', async () => {
    renderStageEditor({
      stageId: 'name-generator-roster-1',
      sections: <ExternalDataSourceSection />,
    });

    // Read from the file through the resource gateway, not from the codebook:
    // a roster is external data and its columns are whatever it contains.
    expect(
      await screen.findByText(
        'The people in it carry these attributes: age, name.',
      ),
    ).toBeInTheDocument();
  });

  it('refuses to save a roster stage with no data file', async () => {
    const harness = renderStageEditor({
      stage: rosterWith({}),
      sections: <ExternalDataSourceSection />,
    });

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText('Choose the data file this roster lists people from.'),
    ).toBeInTheDocument();
  });

  /**
   * Every other roster section names a column of the file. A new file makes
   * each of those a reference to something that may not be there, and a stage
   * half-describing the old roster is one the schema accepts and the interview
   * renders as an empty card.
   */
  it('clears everything chosen from the old file when the file changes', async () => {
    const harness = renderStageEditor({
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
      await screen.findByRole('button', { name: 'Select a data file' }),
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
      'The people in it carry these attributes: age, name.',
    );
    // The stage's name, the type it lists, what it asks and how it behaves
    // belong to sections this mount does not include.
    await harness.roundTrip({
      unowned: ['label', 'subject', 'prompts', 'behaviours'],
    });
  });

  it('offers the data file’s own columns', async () => {
    renderStageEditor({
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
   * A row's own cells cannot refuse a save (see `RowField`), so a card detail
   * with an attribute and no label reaches the protocol as `{ variable: 'age' }`
   * and fails the roster stage's schema against a path.
   */
  it('refuses to save a card detail with no label', async () => {
    const harness = renderStageEditor({
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

  it('records the card detail the researcher added', async () => {
    const harness = renderStageEditor({
      stage: rosterWith({ dataSource: 'roster_data' }),
      sections: <CardDisplaySection />,
    });

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Card details' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Add new card detail' }),
    );
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: /Attribute/ }),
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
  });
});

describe('how a roster is ordered', () => {
  it('offers the file’s columns and the file’s own order', async () => {
    renderStageEditor({
      stage: rosterWith({
        dataSource: 'roster_data',
        sortOptions: { sortOrder: [{ property: 'age', direction: 'desc' }] },
      }),
      sections: <SortOptionsSection />,
    });

    await waitFor(() => expect(optionsOf(/Attribute/)).toContain('age'));
    // `*` is the data file's own order, offered alongside its columns.
    expect(optionsOf(/Attribute/)).toContain('*');
  });

  /**
   * A sort rule that names an attribute but no direction reaches the protocol
   * as `{ property: 'age' }` and fails `SortRuleSchema`.
   */
  it('refuses to save a sort rule with no direction', async () => {
    const harness = renderStageEditor({
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

  it('writes nothing for a roster kept in the file’s own order', async () => {
    const harness = renderStageEditor({
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
      stage: rosterWith({
        dataSource: 'roster_data',
        searchOptions: { fuzziness: 0.4, matchProperties: ['name'] },
      }),
      sections: <SearchOptionsSection />,
    });

    expect(await screen.findByRole('checkbox', { name: 'name' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'age' })).not.toBeChecked();
  });

  it('records what the researcher chose to search on', async () => {
    const harness = renderStageEditor({
      stage: rosterWith({
        dataSource: 'roster_data',
        searchOptions: { fuzziness: 0.4, matchProperties: ['name'] },
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

  /**
   * A search with nothing to match against finds nobody, whatever the
   * participant types.
   */
  it('refuses to save a search that matches nothing', async () => {
    const harness = renderStageEditor({
      stage: rosterWith({
        dataSource: 'roster_data',
        searchOptions: { fuzziness: 0.4, matchProperties: ['name'] },
      }),
      sections: <SearchOptionsSection />,
    });

    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'name' }),
    );

    expect(await harness.submit()).toBeNull();
  });

  it('writes nothing for a roster the participant cannot search', async () => {
    const harness = renderStageEditor({
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
});
