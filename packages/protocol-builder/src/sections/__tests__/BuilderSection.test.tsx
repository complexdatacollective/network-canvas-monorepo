import { act, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Button } from '@codaco/fresco-ui/Button';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import MultiSelect from '../../form/arrayFields/MultiSelect.tsx';
import ProtocolArrayField from '../../form/ProtocolArrayField.tsx';
import ProtocolField from '../../form/ProtocolField.tsx';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import BuilderSection, { type SectionCapability } from '../BuilderSection.tsx';

const SEARCH: SectionCapability = {
  fields: ['searchOptions'],
  confirmClear: {
    title: 'Remove the search settings?',
    description: 'The columns participants can search will be forgotten.',
    confirmLabel: 'Remove them',
  },
};

/**
 * A capability whose values only mean anything against something chosen
 * elsewhere — a roster's columns, named by a data file the researcher picks in
 * another section. That is the whole shape `resetOn` exists for.
 */
function SearchOptions() {
  const [dataSource, setDataSource] = useState('roster_data');
  return (
    <>
      <Button type="button" onClick={() => setDataSource('another_roster')}>
        Choose another roster
      </Button>
      <BuilderSection
        title="Search options"
        capability={SEARCH}
        resetOn={dataSource}
      >
        <ProtocolField
          name="searchOptions.fuzziness"
          label="Fuzziness"
          component={InputField}
        />
      </BuilderSection>
    </>
  );
}

/**
 * The same capability, resetting on a value with structure — which is what a
 * section actually resets on: a subject, a chosen resource, a pair of ids. A
 * caller that builds one inline hands a new object on every render, so it is
 * the value that has to be compared rather than the object holding it.
 */
function SearchOptionsAgainstAResource() {
  const [dataSource, setDataSource] = useState('roster_data');
  const [unrelated, setUnrelated] = useState(0);
  return (
    <>
      <Button type="button" onClick={() => setUnrelated(unrelated + 1)}>
        Type in another section
      </Button>
      <Button type="button" onClick={() => setDataSource('another_roster')}>
        Choose another roster
      </Button>
      <BuilderSection
        title="Search options"
        capability={SEARCH}
        resetOn={{ entity: 'node', resource: dataSource }}
      >
        <ProtocolField
          name="searchOptions.fuzziness"
          label="Fuzziness"
          component={InputField}
        />
      </BuilderSection>
    </>
  );
}

/**
 * A capability that owns a whole CONTAINER, whose rows are what it holds.
 *
 * The container rather than the list inside it, because absence is how the
 * schema spells "this stage does not do this": a capability owning only
 * `cardOptions.additionalProperties` leaves an empty `cardOptions` behind when
 * it is switched off. It is the shape a subject change clears too, which
 * addresses the stage in top-level keys.
 */
const CARDS: SectionCapability = {
  fields: ['cardOptions'],
  confirmClear: {
    title: 'This will clear the card details',
    description: 'Every extra attribute the cards show will be removed.',
    confirmLabel: 'Clear card details',
  },
};

const CARD_COLUMNS = [
  { fieldName: 'variable', label: 'Attribute' },
  { fieldName: 'label', control: 'input' as const, label: 'Label' },
];

/** What each file turned out to hold. The two share only `name`. */
const FILE_COLUMNS: Record<string, { value: string; label: string }[]> = {
  roster_data: [
    { value: 'name', label: 'name' },
    { value: 'age', label: 'age' },
  ],
  another_roster: [
    { value: 'name', label: 'name' },
    { value: 'city', label: 'city' },
  ],
};

/**
 * The same capability holding ROWS, behind a group the researcher has to open.
 *
 * The group is the shape that matters. A capability owning a container whose
 * controls sit inside a collapsed group has no field registered anywhere under
 * that container until the group is opened — the case `useClearStageValue` and
 * `pathHasAnswer` each single out — so the clear has nothing beneath the
 * container to park a record on, and the list arrives afterwards, seeded from
 * the draft the stage was opened with.
 */
function CardDetails() {
  const [dataSource, setDataSource] = useState('roster_data');
  const [showAttributes, setShowAttributes] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setDataSource('another_roster')}>
        Choose another roster
      </Button>
      <BuilderSection
        title="Card details"
        capability={CARDS}
        resetOn={dataSource}
      >
        {showAttributes ? (
          <ProtocolArrayField<typeof MultiSelect>
            name="cardOptions.additionalProperties"
            label="Attributes shown on a card"
            component={MultiSelect}
            addButtonLabel="Add new card detail"
            properties={CARD_COLUMNS}
            options={() => FILE_COLUMNS[dataSource] ?? []}
            emptyStateMessage="No extra attributes are shown on a card."
          />
        ) : (
          <Button type="button" onClick={() => setShowAttributes(true)}>
            Choose the attributes
          </Button>
        )}
      </BuilderSection>
    </>
  );
}

const openSection = () => ({
  stageId: 'name-generator-roster-1',
  sections: <SearchOptions />,
});

const openListSection = () => ({
  stageId: 'name-generator-roster-1',
  sections: <CardDetails />,
});

const openSectionAgainstAResource = () => ({
  stageId: 'name-generator-roster-1',
  sections: <SearchOptionsAgainstAResource />,
});

describe('a capability that only means anything against something else', () => {
  it('opens on what the stage was saved with, rather than resetting itself', async () => {
    renderStageEditor(openSection());

    // The first render is a stage being opened, not a change: resetting here
    // would empty a section the researcher has not touched.
    expect(
      await screen.findByRole('textbox', { name: 'Fuzziness' }),
    ).toHaveValue('0.4');
  });

  it('clears and switches off when the thing it describes changes', async () => {
    const harness = renderStageEditor(openSection());
    await screen.findByRole('textbox', { name: 'Fuzziness' });

    await harness.user.click(
      screen.getByRole('button', { name: 'Choose another roster' }),
    );

    // Without asking: the values did not become wrong through anything the
    // researcher did to THIS section, so there is no decision to put to them.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Search options' }),
      ).not.toBeChecked(),
    );
    await waitFor(() =>
      expect(
        harness.outline().find((section) => section.title === 'Search options')
          ?.state,
      ).toBe('Switched off'),
    );
  });

  it('leaves nothing of the old choice behind when it is switched back on', async () => {
    const harness = renderStageEditor(openSection());
    await screen.findByRole('textbox', { name: 'Fuzziness' });

    await harness.user.click(
      screen.getByRole('button', { name: 'Choose another roster' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Search options' }),
      ).not.toBeChecked(),
    );
    await harness.user.click(
      screen.getByRole('switch', { name: 'Search options' }),
    );

    // The value is gone rather than merely hidden: a section that only closed
    // over its fields would replay the old roster's settings on save.
    expect(
      await screen.findByRole('textbox', { name: 'Fuzziness' }),
    ).toHaveValue('');
  });

  /**
   * The same guarantee for a control that was not on screen when the clear
   * happened.
   *
   * A field seeds itself from the committed draft, which is the only place a
   * value is before the researcher has touched it. The clear does not reach
   * that draft — it is the researcher's pending decision, not a save — so a
   * field arriving under a path that has been cleared has to be told, or it
   * starts from the old roster's rows and they look every bit as authored as
   * the ones the researcher writes next.
   */
  it('leaves no row of the old choice behind when the list arrives after the clear', async () => {
    const harness = renderStageEditor(openListSection());
    // The stage arrives with a card detail, which is what opens the section —
    // and the list holding it has not been asked for yet.
    expect(
      await screen.findByRole('switch', { name: 'Card details' }),
    ).toBeChecked();

    await harness.user.click(
      screen.getByRole('button', { name: 'Choose another roster' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Card details' }),
      ).not.toBeChecked(),
    );

    // Asked for again, against the columns the new file actually has.
    await harness.user.click(
      screen.getByRole('switch', { name: 'Card details' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Choose the attributes' }),
    );

    // Nothing, rather than the old file's row. That row comes back complete —
    // an attribute and the label the researcher wrote for it — so there is
    // nothing about it to tell them it is not theirs.
    expect(
      screen.queryAllByRole('combobox', { name: 'Attribute' }),
    ).toHaveLength(0);
    expect(
      screen.getByText('No extra attributes are shown on a card.'),
    ).toBeInTheDocument();

    // And the save says the same thing the screen does. A row that is only
    // hidden is a row the next save writes back into the protocol.
    const saved = await harness.submit();
    expect(saved?.stageDocument).not.toHaveProperty(
      'cardOptions.additionalProperties',
    );
  });

  /**
   * The other direction, which the same rule has to leave alone.
   *
   * A clear is this session's pending decision about content that is still in
   * the protocol, so it says nothing about content that arrives AFTER it. A
   * collaborator writing at the cleared path is authoritative, and the editor
   * has to show what they wrote rather than the blank this session was holding
   * — the researcher can always switch the capability off again, and cannot
   * act on something they cannot see.
   */
  it('shows what a collaborator writes under a path this session cleared', async () => {
    const harness = renderStageEditor(openListSection());
    expect(
      await screen.findByRole('switch', { name: 'Card details' }),
    ).toBeChecked();

    await harness.user.click(
      screen.getByRole('button', { name: 'Choose another roster' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Card details' }),
      ).not.toBeChecked(),
    );

    act(() => {
      harness.session.acknowledge({
        fields: {
          ...harness.seeded.fields,
          cardOptions: {
            additionalProperties: [{ variable: 'city', label: 'City' }],
          },
        },
        throughBatchId: 0,
        manifestRevision: { sequence: 9n, hash: 'revision-9' },
      });
    });

    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Card details' }),
      ).toBeChecked(),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Choose the attributes' }),
    );
    expect(
      await screen.findByRole('combobox', { name: 'Attribute' }),
    ).toHaveValue('city');
  });
});

/**
 * What a capability's values mean anything against is rarely a string. A
 * roster's columns are named by a resource chosen in another section, a card's
 * details by the subject the stage works with — objects a caller assembles
 * where it renders the section. Compared by reference, every one of those is a
 * different object on every render, and the researcher's settings would be
 * thrown away by anything at all happening elsewhere in the editor.
 */
describe('a capability that resets on a value with structure', () => {
  it('survives a re-render that changed nothing it depends on', async () => {
    const harness = renderStageEditor(openSectionAgainstAResource());
    await screen.findByRole('textbox', { name: 'Fuzziness' });

    await harness.user.click(
      screen.getByRole('button', { name: 'Type in another section' }),
    );

    expect(
      screen.getByRole('switch', { name: 'Search options' }),
    ).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'Fuzziness' })).toHaveValue(
      '0.4',
    );
    expect(
      harness.outline().find((section) => section.title === 'Search options')
        ?.state,
    ).not.toBe('Switched off');
  });

  it('still clears when the value itself changes', async () => {
    const harness = renderStageEditor(openSectionAgainstAResource());
    await screen.findByRole('textbox', { name: 'Fuzziness' });

    await harness.user.click(
      screen.getByRole('button', { name: 'Choose another roster' }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Search options' }),
      ).not.toBeChecked(),
    );
  });
});
