import { act, screen, waitFor } from '@testing-library/react';
import { type ComponentType, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Button } from '@codaco/fresco-ui/Button';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';

import SubjectSelectField from '../../fields/SubjectSelectField.tsx';
import MultiSelect from '../../form/arrayFields/MultiSelect.tsx';
import ProtocolArrayField from '../../form/ProtocolArrayField.tsx';
import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageValue } from '../../form/stageFormHooks.ts';
import { loadFixtureStage } from '../../testing/protocolFixture.ts';
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

const RadioGroup = RadioGroupField as ComponentType<Record<string, unknown>>;

/**
 * The section that OWNS the data file, rendering it as the ordinary stage
 * field it is: its value waits for the submit that flushes it, which is
 * exactly what makes a section resetting on it interesting.
 */
function RosterSource() {
  return (
    <BuilderSection title="Roster source">
      <ProtocolField<typeof RadioGroup>
        name="dataSource"
        label="Roster data file"
        component={RadioGroup}
        options={[
          { value: 'roster_data', label: 'Roster' },
          { value: 'another_roster', label: 'Another roster' },
        ]}
      />
    </BuilderSection>
  );
}

/**
 * A capability whose values only mean anything against something chosen
 * elsewhere — a roster's columns, named by a data file the researcher picks in
 * another section. That is the whole shape `resetOn` exists for.
 */
function SearchOptions() {
  return (
    <>
      <RosterSource />
      <BuilderSection
        title="Search options"
        capability={SEARCH}
        resetOn="dataSource"
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
 * The same capability, resetting on a path whose value has STRUCTURE — a
 * stage's subject is `{entity, type}`, which is what one control writes there
 * whole. The value is read from the path rather than assembled by the caller,
 * so a keystroke anywhere else in the stage cannot look like a change to it.
 */
function SearchOptionsAgainstASubject() {
  return (
    <>
      <BuilderSection title="Node type">
        <ProtocolField<typeof SubjectSelectField>
          name="subject"
          label="Node type"
          component={SubjectSelectField}
          entityType="node"
        />
      </BuilderSection>
      <BuilderSection title="Stage name">
        <ProtocolField name="label" label="Stage name" component={InputField} />
      </BuilderSection>
      <BuilderSection
        title="Search options"
        capability={SEARCH}
        resetOn="subject"
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
 * that container until the group is opened, so the clear has nothing beneath
 * the container to park a record on and nothing to tell: the list arrives
 * afterwards and seeds itself from the draft. Everything a switch-off has to
 * be true of, it has to be true of here.
 */
function CardDetails() {
  const dataSource = useStageValue('dataSource');
  const [showAttributes, setShowAttributes] = useState(false);

  return (
    <>
      <RosterSource />
      <BuilderSection
        title="Card details"
        capability={CARDS}
        resetOn="dataSource"
      >
        {showAttributes ? (
          <ProtocolArrayField<typeof MultiSelect>
            name="cardOptions.additionalProperties"
            label="Attributes shown on a card"
            component={MultiSelect}
            addButtonLabel="Add new card detail"
            properties={CARD_COLUMNS}
            options={() =>
              FILE_COLUMNS[typeof dataSource === 'string' ? dataSource : ''] ??
              []
            }
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

/**
 * The other roster, as a resource the protocol really holds.
 *
 * A data file the manifest does not list is a dangling reference, and a save
 * that carries one is refused for that rather than for whatever a test is
 * actually asking about.
 */
const ANOTHER_ROSTER = {
  another_roster: {
    type: 'network',
    id: 'another_roster',
    name: 'Another roster',
    source: 'another-roster.json',
  },
};

const openSection = () => ({
  stageId: 'name-generator-roster-1',
  sections: <SearchOptions />,
  assets: ANOTHER_ROSTER,
});

const openListSection = () => ({
  stageId: 'name-generator-roster-1',
  sections: <CardDetails />,
  assets: ANOTHER_ROSTER,
});

const openSectionAgainstASubject = () => ({
  stageId: 'name-generator-roster-1',
  sections: <SearchOptionsAgainstASubject />,
});

/** Swaps the stage's data file, which is what every reset below fires on. */
const chooseAnotherRoster = async (
  harness: ReturnType<typeof renderStageEditor>,
) => {
  await harness.user.click(
    await screen.findByRole('radio', { name: 'Another roster' }),
  );
};

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

    await chooseAnotherRoster(harness);

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

    await chooseAnotherRoster(harness);
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
   * value is before the researcher has touched it — so the clear has to reach
   * that draft, or a field arriving under a cleared path starts from the old
   * roster's rows, and they look every bit as authored as the ones the
   * researcher writes next. Nothing here can be covered by telling the fields
   * that exist: this list does not exist yet.
   */
  it('leaves no row of the old choice behind when the list arrives after the clear', async () => {
    const harness = renderStageEditor(openListSection());
    // The stage arrives with a card detail, which is what opens the section —
    // and the list holding it has not been asked for yet.
    expect(
      await screen.findByRole('switch', { name: 'Card details' }),
    ).toBeChecked();

    await chooseAnotherRoster(harness);
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
   * And nothing of the container it sat in either.
   *
   * A capability owns a CONTAINER, so switching it back on mounts controls
   * inside one that holds nothing yet. Writing each of those into the draft
   * where it lives assembles the container around them, and the save carries
   * `cardOptions: {}` — a key the researcher did not write. The schema happens
   * to tolerate an empty one here and refuses it elsewhere (a `skipLogic` of
   * nothing is a skip logic missing its required members), which is the same
   * reason absence is how a switched-off capability is spelled at all.
   */
  it('saves no container at all for a capability switched back on empty', async () => {
    const harness = renderStageEditor(openListSection());
    expect(
      await screen.findByRole('switch', { name: 'Card details' }),
    ).toBeChecked();

    await chooseAnotherRoster(harness);
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Card details' }),
      ).not.toBeChecked(),
    );

    // Back on, and the list asked for — so a control IS mounted under
    // `cardOptions`, holding nothing. Nothing is entered into it.
    await harness.user.click(
      screen.getByRole('switch', { name: 'Card details' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Choose the attributes' }),
    );

    const saved = await harness.submit();
    expect(saved).not.toBeNull();
    expect(saved?.stageDocument).not.toHaveProperty('cardOptions');
  });

  /**
   * The other direction, which the clear has to leave alone.
   *
   * Once the clear has reached the protocol, it says nothing about content that
   * arrives after it. A collaborator writing at the path is authoritative, and
   * the editor has to show what they wrote rather than the blank this session
   * decided on — the researcher can always switch the capability off again, and
   * cannot act on something they cannot see.
   */
  it('shows what a collaborator writes once the clear has landed', async () => {
    const harness = renderStageEditor(openListSection());
    expect(
      await screen.findByRole('switch', { name: 'Card details' }),
    ).toBeChecked();

    await chooseAnotherRoster(harness);
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Card details' }),
      ).not.toBeChecked(),
    );

    // Acknowledged THROUGH the clear's own batch, which is what a host that has
    // applied it answers with. The collaborator's row was written onto a stage
    // that already had the capability switched off.
    const cleared = harness.pendingCommands().at(-1);
    // The file the researcher chose travels WITH the clear it caused, so what
    // the host applied is the whole change rather than half of it.
    expect(cleared?.commands).toEqual([
      { op: 'set', key: 'dataSource', value: 'another_roster' },
      { op: 'unset', key: 'cardOptions' },
    ]);
    act(() => {
      harness.session.acknowledge({
        fields: {
          ...harness.seeded.fields,
          dataSource: 'another_roster',
          cardOptions: {
            additionalProperties: [{ variable: 'city', label: 'City' }],
          },
        },
        throughBatchId: cleared?.id ?? 0,
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

  /**
   * And the same arrival while the clear is still on its way.
   *
   * A switched-off capability is an edit like any other, so a batch the host
   * has not applied yet is replayed onto whatever it does send back — an
   * `unset` says what it says wherever it lands (`rebaseCommand`). The
   * researcher's decision therefore stands over a write made against the stage
   * they made it on, exactly as any other pending local edit would.
   *
   * The alternative is worse than it looks: letting the arrival win would put
   * the capability back on and save content under a switch the researcher had
   * already turned off, and they would have to notice it to turn it off again.
   */
  it('keeps the clear over an arrival the host has not seen it yet', async () => {
    const harness = renderStageEditor(openListSection());
    expect(
      await screen.findByRole('switch', { name: 'Card details' }),
    ).toBeChecked();

    await chooseAnotherRoster(harness);
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
        // Nothing acknowledged, so the clear is still pending.
        throughBatchId: 0,
        manifestRevision: { sequence: 9n, hash: 'revision-9' },
      });
    });

    await waitFor(() =>
      expect(
        harness.session.getSnapshot().editedSection.fields,
      ).not.toHaveProperty('cardOptions'),
    );
    expect(
      screen.getByRole('switch', { name: 'Card details' }),
    ).not.toBeChecked();
  });
});

/**
 * The switch itself, rather than something the capability describes changing
 * underneath it. Same clear, and the researcher confirmed this one.
 */
describe('a capability the researcher switches off', () => {
  /**
   * The first row added after switching it back on.
   *
   * A bound list resolves every insertion against the draft the SESSION holds,
   * never against the rows it is rendering — that is what keeps a row dialog's
   * save from landing on whichever row has since moved into its position. So
   * "the list is empty now" has to be true there: a switch-off recorded only in
   * the form left the old rows in the draft, and the researcher's first Add was
   * placed after them.
   *
   * The container shape, which is the one a capability really owns: the switch
   * is on `cardOptions` and the list sits at `cardOptions.additionalProperties`
   * inside it.
   */
  it('adds the first row to an empty list, and saves only that row', async () => {
    const harness = renderStageEditor(openListSection());
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Card details' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Clear card details' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Card details' }),
      ).not.toBeChecked(),
    );

    await harness.user.click(
      screen.getByRole('switch', { name: 'Card details' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Choose the attributes' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Add new card detail' }),
    );

    const attributes = screen.getAllByRole('combobox', { name: 'Attribute' });
    expect(attributes).toHaveLength(1);
    await harness.user.selectOptions(attributes[0]!, 'name');
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Label' }),
      'Name',
    );

    const saved = await harness.submit();
    expect(saved?.stageDocument.cardOptions).toEqual({
      additionalProperties: [{ variable: 'name', label: 'Name' }],
    });
  });

  /**
   * Undo, which is the researcher's way back from a switch they did not mean.
   *
   * A decision that only emptied the form would have nothing in the session's
   * history to undo — the rows would be gone until the editor was closed
   * without saving, and every keystroke since would go with them.
   */
  it('comes back whole when the session undoes the switch-off', async () => {
    const harness = renderStageEditor(openListSection());
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Card details' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Clear card details' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Card details' }),
      ).not.toBeChecked(),
    );

    act(() => {
      harness.session.undo();
    });

    // The switch follows the values: holding a value is what "switched on"
    // means, so nothing has to remember that the researcher turned it off.
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
    ).toHaveValue('age');
  });
});

/**
 * What a capability's values mean anything against is rarely a bare string: a
 * subject, a pair of limits, a whole settings container. The store assembles
 * such a value out of the fields registered inside it, so what is compared has
 * to be the value rather than the object carrying it — and what it is
 * compared against has to be the path's own content, so that a keystroke
 * somewhere else in the stage does not throw the researcher's settings away.
 */
describe('a capability that resets on a value with structure', () => {
  it('survives a re-render that changed nothing it depends on', async () => {
    const harness = renderStageEditor(openSectionAgainstASubject());
    await screen.findByRole('textbox', { name: 'Fuzziness' });

    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      '!',
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
    const harness = renderStageEditor(openSectionAgainstASubject());
    await screen.findByRole('textbox', { name: 'Fuzziness' });

    await harness.user.click(
      await screen.findByRole('radio', { name: 'family member' }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Search options' }),
      ).not.toBeChecked(),
    );
  });
});

/**
 * A path is read the same way wherever it is read.
 *
 * Telling a researcher's change from an arrival is a comparison of two reads of
 * ONE path: what the form holds there, and what the agreed draft holds there.
 * Resolve the path differently in the two and they are reads of two different
 * values, which move independently — so an arrival that moves one of them and
 * not the other reads as a choice the researcher made, and the section throws
 * away the capability the arrival was bringing back.
 *
 * The stage below holds both readings of `presentation.theme` at once — a route
 * through a container, and a key that happens to contain a dot — because that
 * is what a general-purpose `get` decides between by looking at the document.
 */
describe('a capability resetting on a path the stage could read two ways', () => {
  const ambiguousStage = () => {
    const roster = loadFixtureStage('name-generator-roster-1');
    return {
      stage: {
        id: roster.id,
        type: roster.type,
        fields: {
          ...roster.fields,
          'presentation': { theme: 'plain' },
          'presentation.theme': 'a key of its own',
        },
      },
      sections: (
        <>
          <BuilderSection title="Presentation">
            <ProtocolField<typeof RadioGroup>
              name="presentation.theme"
              label="Theme"
              component={RadioGroup}
              options={[
                { value: 'plain', label: 'Plain' },
                { value: 'bold', label: 'Bold' },
              ]}
            />
          </BuilderSection>
          <BuilderSection
            title="Search options"
            capability={SEARCH}
            resetOn="presentation.theme"
          >
            <ProtocolField
              name="searchOptions.fuzziness"
              label="Fuzziness"
              component={InputField}
            />
          </BuilderSection>
        </>
      ),
    };
  };

  it('does not reset again when the session undoes the reset', async () => {
    const harness = renderStageEditor(ambiguousStage());
    await screen.findByRole('textbox', { name: 'Fuzziness' });

    // The researcher's own change, which does reset the capability.
    await harness.user.click(
      await screen.findByRole('radio', { name: 'Bold' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Search options' }),
      ).not.toBeChecked(),
    );

    act(() => {
      harness.session.undo();
    });

    // The undo is an arrival, and it brings the theme and the settings that
    // described it back together. Resetting on it would take away the half of
    // the change the researcher was reaching for, on the spot.
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Search options' }),
      ).toBeChecked(),
    );
    expect(harness.session.getSnapshot().editedSection.fields).toMatchObject({
      searchOptions: { fuzziness: 0.4 },
    });
  });
});
