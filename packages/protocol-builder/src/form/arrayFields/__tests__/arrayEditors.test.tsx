import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useMemo, useState } from 'react';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import BuilderSection from '../../../sections/BuilderSection.tsx';
import { fixtureMessage } from '../../../testing/i18n.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { createStageDraftProbe } from '../../__tests__/stageDraftProbe.tsx';
import MultiSelect, {
  makeMultiSelectValidation,
  type PropertyField,
} from '../MultiSelect.tsx';
import Options, { optionsValidation } from '../Options.tsx';

const OPTIONS_CAPABILITY = {
  fields: ['options'],
  confirmClear: {
    title: fixtureMessage('This will clear your answer options'),
    description: fixtureMessage('The options you entered will be deleted.'),
    confirmLabel: fixtureMessage('Clear options'),
  },
};

const SORT_PROPERTIES: PropertyField[] = [
  { fieldName: 'property', control: 'input', label: 'Property' },
  { fieldName: 'direction', control: 'input', label: 'Direction' },
];

type ListOptions = Readonly<{
  /** Put the list behind a capability the researcher can switch off. */
  optional?: boolean;
}>;

/**
 * A list in a real stage editor, with a control that takes its interactivity
 * away the way a section does when a prerequisite stops being chosen.
 *
 * `options` and `sortOrder` are not keys an Information page's schema
 * declares, so a stage is saved here only where the list is empty by then:
 * everything else is read out of the document the editor is holding, which is
 * the value a save would assemble.
 */
function renderList(
  fields: SectionDoc,
  list: (disabled: boolean) => React.ReactNode,
  title: string,
  { optional = false }: ListOptions = {},
) {
  const controls: { setDisabled: (value: boolean) => void } = {
    setDisabled: () => undefined,
  };
  const { probe, draft } = createStageDraftProbe();

  function Section() {
    const [disabled, setDisabled] = useState(false);
    controls.setDisabled = setDisabled;
    return (
      <BuilderSection
        title={title}
        {...(optional ? { capability: OPTIONS_CAPABILITY } : {})}
      >
        {probe}
        {list(disabled)}
      </BuilderSection>
    );
  }

  const harness = renderStageEditor({
    stage: { type: 'Information', fields },
    sections: <Section />,
  });

  return {
    harness,
    user: harness.user,
    draft,
    stopAcceptingChanges: () => {
      act(() => {
        controls.setDisabled(true);
      });
    },
  };
}

const optionList = (disabled: boolean) => (
  <Field
    name="options"
    label="Answer options"
    component={Options}
    addButtonLabel="Create new option"
    disabled={disabled}
    {...optionsValidation}
  />
);

function SortRules({ disabled }: Readonly<{ disabled: boolean }>) {
  const validation = useMemo(
    () => makeMultiSelectValidation(SORT_PROPERTIES),
    [],
  );
  return (
    <Field
      name="sortOrder"
      label="Sort order"
      component={MultiSelect}
      addButtonLabel="Add new sort rule"
      properties={SORT_PROPERTIES}
      options={() => []}
      disabled={disabled}
      {...validation}
    />
  );
}

const sortRuleList = (disabled: boolean) => <SortRules disabled={disabled} />;

const renderOptions = (fields: SectionDoc, options?: ListOptions) =>
  renderList(fields, optionList, 'Answer options', options);

const renderSortRules = (fields: SectionDoc) =>
  renderList(fields, sortRuleList, 'Sort order');

/** A stage the schema accepts, so a refused save can only be the list's doing. */
const SAVEABLE_STAGE = {
  label: 'Welcome',
  title: 'Welcome',
  items: [],
};

describe('Options', () => {
  it('adds a row and lands every keystroke after it on that row alone', async () => {
    const { user, draft } = renderOptions({
      ...SAVEABLE_STAGE,
      options: [{ label: 'Yes', value: 'yes' }],
    });

    await user.click(
      await screen.findByRole('button', { name: 'Create new option' }),
    );

    // A blank option opens straight into its editor, so the value cell is
    // reachable without a further click.
    const valueCell = await screen.findByRole('textbox', { name: 'Value' });
    await user.type(valueCell, 'no');

    // The first option is untouched throughout, which a whole-array rewrite
    // on every keystroke could not promise.
    await waitFor(() =>
      expect(draft().options).toEqual([
        { label: 'Yes', value: 'yes' },
        { value: 'no' },
      ]),
    );
  });

  /**
   * What one cell of a row says about itself, and when.
   *
   * A row is not made of registered fields — the whole list is one field value
   * — so a cell shows what it finds wrong through the field's own error slot
   * rather than through the form store. These hold the researcher's side of
   * that: silence until they have said something, and everything wrong with a
   * cell at once when they have.
   *
   * Read out of the cell rather than off the page, because the LIST is a field
   * too: it carries its own `required`, whose screen-reader marker is the word
   * "Required" as well, and a page-wide search would answer with it whether or
   * not any row had said anything.
   */
  const optionCell = (row: number, column: 'label' | 'value') => {
    const cell = document.querySelector<HTMLElement>(
      `[data-field-name="options[${row}].${column}"]`,
    );
    expect(cell).not.toBeNull();
    return within(cell!);
  };

  it('says nothing about an option the researcher has not touched', async () => {
    const { user } = renderOptions({
      ...SAVEABLE_STAGE,
      options: [{ label: 'Yes', value: 'yes' }],
    });

    await user.click(
      await screen.findByRole('button', { name: 'Edit option 1' }),
    );
    // Both cells are on screen, so the silence below is the rule and not a
    // cell that was never rendered.
    await screen.findByRole('textbox', { name: 'Value' });

    expect(optionCell(0, 'label').queryByText('Required')).toBeNull();
    expect(optionCell(0, 'value').queryByText('Required')).toBeNull();
  });

  it('says nothing about a fresh option nobody has typed in', async () => {
    // The rich-text editor an option label is typed into announces its value
    // as it mounts. Counting that as an edit would greet every new option with
    // "Required" in a cell nobody has reached.
    const { user } = renderOptions({ ...SAVEABLE_STAGE, options: [] });

    await user.click(
      await screen.findByRole('button', { name: 'Create new option' }),
    );
    await screen.findByRole('textbox', { name: 'Value' });

    expect(optionCell(0, 'label').queryByText('Required')).toBeNull();
    expect(optionCell(0, 'value').queryByText('Required')).toBeNull();
  });

  it('shows every problem with an option value at once, once it is edited', async () => {
    const { user } = renderOptions({
      ...SAVEABLE_STAGE,
      options: [
        { label: 'Alpha', value: 'yes' },
        { label: 'Bravo', value: 'yes!' },
      ],
    });

    await user.click(
      await screen.findByRole('button', { name: 'Edit option 1' }),
    );
    const valueCell = await screen.findByRole('textbox', { name: 'Value' });
    expect(
      optionCell(0, 'value').queryByText('Values must be unique'),
    ).toBeNull();

    // Now it exports as the same answer as Bravo, and `!` cannot appear in an
    // export column name.
    await user.type(valueCell, '!');

    // Both, not just the first: a row is edited in place, so a cell that
    // reported its problems one at a time would send the researcher back to
    // the same box for each of them.
    await optionCell(0, 'value').findByText('Values must be unique');
    optionCell(0, 'value').getByText(/Not a valid option value/);
  });

  it('reveals a blank option’s problems when it refuses to collapse', async () => {
    const { user } = renderOptions({ ...SAVEABLE_STAGE, options: [] });

    await user.click(
      await screen.findByRole('button', { name: 'Create new option' }),
    );
    await screen.findByRole('textbox', { name: 'Value' });
    expect(optionCell(0, 'value').queryByText('Required')).toBeNull();

    // The one way a row nobody has typed in hears about itself: it will not
    // collapse, and has to say why — in both cells, not just the one the
    // researcher happens to be in.
    await user.click(
      screen.getByRole('button', { name: 'Finish editing option' }),
    );

    await optionCell(0, 'label').findByText('Required');
    optionCell(0, 'value').getByText('Required');
  });

  it('removes the option it confirmed when the list has not moved', async () => {
    const { user, draft } = renderOptions({
      ...SAVEABLE_STAGE,
      options: [
        { label: 'Alpha', value: 'alpha' },
        { label: 'Bravo', value: 'bravo' },
      ],
    });

    await user.click(
      await screen.findByRole('button', { name: 'Remove option 2' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Delete option' }),
    );

    await waitFor(() =>
      expect(draft().options).toEqual([{ label: 'Alpha', value: 'alpha' }]),
    );
  });

  /**
   * What a confirm's own window can outlive: not the row, but what the list
   * will accept.
   *
   * The refusal is `ArrayField`'s (see its `deleteAvailability` spec); this
   * asks it of a real options list in a real stage editor, where the list goes
   * read-only because the stage did.
   */
  it('removes nothing when the list stops accepting changes mid-confirm', async () => {
    const { user, draft, stopAcceptingChanges } = renderOptions({
      ...SAVEABLE_STAGE,
      options: [
        { label: 'Alpha', value: 'alpha' },
        { label: 'Bravo', value: 'bravo' },
      ],
    });

    await user.click(
      await screen.findByRole('button', { name: 'Remove option 2' }),
    );
    await screen.findByRole('button', { name: 'Delete option' });

    // The list stops accepting changes while the confirm sits open. The option
    // is untouched — only what may be done to it has changed.
    stopAcceptingChanges();

    await user.click(screen.getByRole('button', { name: 'Delete option' }));

    expect(
      await screen.findByText(
        'This list stopped accepting changes while you were confirming, so nothing was removed. Try again once the list can be edited.',
      ),
    ).toBeInTheDocument();
    expect(draft().options).toEqual([
      { label: 'Alpha', value: 'alpha' },
      { label: 'Bravo', value: 'bravo' },
    ]);
  });

  it('refuses to save the stage while a row it added is still blank', async () => {
    const { harness, user, draft } = renderOptions({
      ...SAVEABLE_STAGE,
      options: [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
      ],
    });

    await user.click(
      await screen.findByRole('button', { name: 'Create new option' }),
    );
    // The blank row reaches the document the moment it is added, because a
    // list edit is committed as the operation it was. Nothing downstream will
    // catch it: an unknown key is not what makes a stage invalid, so this
    // field's own rule is the only thing standing between the researcher and a
    // protocol carrying an option with neither half.
    await waitFor(() =>
      expect(draft().options).toEqual([
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
        {},
      ]),
    );

    expect(await harness.submit()).toBeNull();

    const message = await screen.findByText(
      'Every option needs both a label and a value.',
    );
    // Attributed to the list that holds the row, so the outline and the
    // problem panel can say where to go — a refusal nobody can act on is not
    // much better than none.
    expect(message.closest('[data-field-name="options"]')).not.toBeNull();
  });

  it('leaves no blank row behind when the capability that held it is switched off', async () => {
    const { harness, user, draft } = renderOptions(
      {
        ...SAVEABLE_STAGE,
        options: [
          { label: 'Yes', value: 'yes' },
          { label: 'No', value: 'no' },
        ],
      },
      { optional: true },
    );

    await user.click(
      await screen.findByRole('button', { name: 'Create new option' }),
    );
    await waitFor(() => expect(draft().options).toHaveLength(3));

    await user.click(screen.getByRole('switch', { name: 'Answer options' }));
    await user.click(screen.getByRole('button', { name: 'Clear options' }));

    // The list is gone from the page, and with it the only rule that could
    // have refused the blank row. What has to be true is that there is no
    // blank row left to refuse: switching a capability off clears the paths it
    // owns, so the stage saves with no options at all rather than with the
    // half-finished one the researcher never got to see again.
    const written = await harness.submit();
    expect(written?.stageDocument).toEqual({
      id: harness.seeded.id,
      type: 'Information',
      ...SAVEABLE_STAGE,
    });
  });

  /**
   * The first row added after the capability comes back on.
   *
   * A list resolves every insertion against the document the EDITOR holds,
   * never against the rows it happens to be rendering, so "the list is empty
   * now" has to be true there rather than only on screen. A switch-off that
   * stopped at the form left the old rows in the document, and the
   * researcher's next Add was placed after them: the row they added arrived
   * beside a row they had just confirmed the deletion of, looking every bit as
   * authored.
   */
  it('adds the first row after a switch-off to an empty list', async () => {
    const { user, draft } = renderOptions(
      { ...SAVEABLE_STAGE, options: [{ label: 'Yes', value: 'yes' }] },
      { optional: true },
    );

    await user.click(screen.getByRole('switch', { name: 'Answer options' }));
    await user.click(screen.getByRole('button', { name: 'Clear options' }));
    await user.click(screen.getByRole('switch', { name: 'Answer options' }));

    await user.click(
      await screen.findByRole('button', { name: 'Create new option' }),
    );

    await user.type(
      await screen.findByRole('textbox', { name: 'Label' }),
      'No',
    );
    await user.type(screen.getByRole('textbox', { name: 'Value' }), 'no');

    // One row, and it is the researcher's. The list they are typing into and
    // the list the next save will write are the same list.
    await waitFor(() =>
      expect(draft().options).toEqual([{ label: 'No', value: 'no' }]),
    );
    expect(screen.getAllByRole('textbox', { name: 'Label' })).toHaveLength(1);
  });

  it('adds an option to a key an import left holding something else', async () => {
    // What a list key can hold after an import, a migration or a hand-edited
    // protocol. The editor renders it as an empty list with a WORKING Add
    // button — fresco-ui's render-tolerance contract — so the click behind
    // that button has to reach the document rather than throw out of the
    // handler.
    const { user, draft } = renderOptions({
      ...SAVEABLE_STAGE,
      options: 'yes',
    });

    await user.click(
      await screen.findByRole('button', { name: 'Create new option' }),
    );

    await waitFor(() => expect(draft().options).toEqual([{}]));
  });
});

describe('MultiSelect', () => {
  it('refuses a save while a row is missing a column', async () => {
    const { harness } = renderSortRules({
      ...SAVEABLE_STAGE,
      sortOrder: [{ property: 'name' }],
    });

    expect(await harness.submit()).toBeNull();

    expect(
      await screen.findByText('Every row needs a value in each column.'),
    ).toBeInTheDocument();
    expect(
      harness.protocolSections()[
        sectionId({ kind: 'stage', stageId: harness.seeded.id })
      ],
    ).toEqual({
      id: harness.seeded.id,
      type: 'Information',
      ...SAVEABLE_STAGE,
      sortOrder: [{ property: 'name' }],
    });
  });

  it('adds a sort rule to a key an import left holding something else', async () => {
    const { user, draft } = renderSortRules({
      ...SAVEABLE_STAGE,
      sortOrder: { property: 'name' },
    });

    await user.click(
      await screen.findByRole('button', { name: 'Add new sort rule' }),
    );

    await waitFor(() => expect(draft().sortOrder).toEqual([{}]));
  });
});

/**
 * The same window, in the second of the three lists that share the confirm.
 * A sort rule names its Remove control identically in every row, and the
 * confirm's own control is named the same again, so the confirm is asked
 * inside its own dialog rather than by name alone.
 */
describe('a row removal confirm the list stops accepting', () => {
  it('removes no sort rule and says why', async () => {
    const { user, draft, stopAcceptingChanges } = renderSortRules({
      ...SAVEABLE_STAGE,
      sortOrder: [
        { property: 'name', direction: 'asc' },
        { property: 'age', direction: 'desc' },
      ],
    });

    const [firstRemove] = await screen.findAllByRole('button', {
      name: 'Remove item',
    });
    await user.click(firstRemove!);
    const dialog = await screen.findByRole('dialog');

    stopAcceptingChanges();

    await user.click(
      within(dialog).getByRole('button', { name: 'Delete item' }),
    );

    expect(
      await screen.findByText(
        'This list stopped accepting changes while you were confirming, so nothing was removed. Try again once the list can be edited.',
      ),
    ).toBeInTheDocument();
    expect(draft().sortOrder).toEqual([
      { property: 'name', direction: 'asc' },
      { property: 'age', direction: 'desc' },
    ]);
  });
});

/**
 * A reorder among rows nothing tells apart.
 *
 * Which of two rules the researcher took hold of is the same question as which
 * of them a destination sits after, and it has the same answer: the rows are
 * paired off in order with the document's, so a position names the second of
 * them at both ends. Resolving the row on its own — by content, and only while
 * exactly one row matched — refused every such reorder outright, telling the
 * researcher a list they could see perfectly well had changed underneath them.
 */
describe('a list holding rows the researcher cannot tell apart', () => {
  it('moves the rule the researcher took hold of past the one between the copies', async () => {
    const { user, draft } = renderSortRules({
      ...SAVEABLE_STAGE,
      sortOrder: [
        { property: 'name', direction: 'asc' },
        { property: 'age', direction: 'desc' },
        { property: 'name', direction: 'asc' },
      ],
    });

    await user.click(
      await screen.findByRole('button', { name: 'Add new sort rule' }),
    );
    await waitFor(() =>
      expect(screen.getAllByRole('textbox', { name: 'Property' })).toHaveLength(
        4,
      ),
    );

    // The SECOND of the two rules that cannot be told apart moves up one, past
    // the rule that was between them.
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Reorder item 3 of 4' }),
      { key: 'ArrowUp' },
    );

    await waitFor(() =>
      expect(draft().sortOrder).toEqual([
        { property: 'name', direction: 'asc' },
        { property: 'name', direction: 'asc' },
        { property: 'age', direction: 'desc' },
        {},
      ]),
    );
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('textbox', { name: 'Property' })
          .map((cell) => (cell as HTMLInputElement).value),
      ).toEqual(['name', 'name', 'age', '']),
    );
  });

  it('moves a rule to a place between two rules it cannot tell apart', async () => {
    const { user, draft } = renderSortRules({
      ...SAVEABLE_STAGE,
      sortOrder: [
        { property: 'name', direction: 'asc' },
        { property: 'name', direction: 'asc' },
      ],
    });

    await user.click(
      await screen.findByRole('button', { name: 'Add new sort rule' }),
    );
    await waitFor(() =>
      expect(screen.getAllByRole('textbox', { name: 'Property' })).toHaveLength(
        3,
      ),
    );

    // The blank row moves up one, which is between the two twins.
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Reorder item 3 of 3' }),
      { key: 'ArrowUp' },
    );

    await waitFor(() =>
      expect(draft().sortOrder).toEqual([
        { property: 'name', direction: 'asc' },
        {},
        { property: 'name', direction: 'asc' },
      ]),
    );
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('textbox', { name: 'Property' })
          .map((cell) => (cell as HTMLInputElement).value),
      ).toEqual(['name', '', 'name']),
    );
  });
});
