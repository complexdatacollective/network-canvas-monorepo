import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { fixtureStageIds } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { writeInto } from '../../__tests__/writeInto.ts';
import { nameGeneratorRosterStageEditor } from '../NameGeneratorRosterStageEditor.ts';

/** Where a host would insert a new one: over the stage the fixture holds. */
const ROSTER_INDEX = fixtureStageIds().indexOf('name-generator-roster-1');

const stageNameInput = (): HTMLElement =>
  screen.getByRole('textbox', { name: 'Stage name' });

/**
 * The whole journey a researcher makes to a saveable roster, which is what
 * this editor is FOR and what no section test can ask.
 *
 * The section order, the fixture round trip and the whole-schema round trip
 * are the family's, in `editors/__tests__/censusBinEditors.test.tsx`. What is
 * here is the sequence: the type this stage adds, the data file the people
 * come from, and the question that offers them — with the three sections that
 * describe the list itself waiting on the file, because every one of them is
 * chosen from its columns.
 */
describe('creating a roster name generator', () => {
  it('saves the new stage once it has a data file and a question to ask', async () => {
    const harness = renderStageEditor({
      create: { type: 'NameGeneratorRoster', position: ROSTER_INDEX },
      registry: nameGeneratorRosterStageEditor,
    });

    await waitFor(() =>
      expect(stageNameInput()).toHaveValue('Roster Name Generator'),
    );
    // Nothing about the list can be decided before the file it is a list of,
    // which the section says by being unusable rather than by a sentence of
    // its own — as Architect's does.
    expect(screen.getByRole('switch', { name: 'Card display' })).toBeDisabled();

    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await harness.user.click(
      await screen.findByRole('button', { name: /Select/ }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Roster' }),
    );
    await screen.findByText(
      'The people in it carry these attributes: age and name.',
    );

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await writeInto(
      harness,
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'Select people from the roster',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      type: 'NameGeneratorRoster',
      subject: { entity: 'node', type: 'person' },
      dataSource: 'roster_data',
    });
    expect(request?.stageDocument.prompts).toEqual([
      {
        id: expect.any(String) as unknown as string,
        text: 'Select people from the roster',
      },
    ]);
    // A roster whose cards, order and search were never configured saves none
    // of the three, rather than three empty containers.
    for (const key of ['cardOptions', 'sortOptions', 'searchOptions']) {
      expect(Object.hasOwn(request?.stageDocument ?? {}, key)).toBe(false);
    }
  });

  /**
   * The roster IS the panel, so this generator has no side panels — the schema
   * gives `panels` to the other two and to nothing else, and a heading
   * qualified by panels this stage cannot have would name a stage nobody could
   * author.
   */
  it('offers no side panels, and proposes a name that claims none', async () => {
    const harness = renderStageEditor({
      create: { type: 'NameGeneratorRoster', position: ROSTER_INDEX },
      registry: nameGeneratorRosterStageEditor,
    });

    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await waitFor(() =>
      expect(stageNameInput()).toHaveValue('Person Roster Name Generator'),
    );
    expect(harness.outline().map((section) => section.title)).not.toContain(
      'Side panels',
    );
  });
});
