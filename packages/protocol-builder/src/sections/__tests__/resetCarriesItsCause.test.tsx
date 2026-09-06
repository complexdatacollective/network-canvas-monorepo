import { screen, waitFor, within } from '@testing-library/react';
import { type ComponentType, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Button } from '@codaco/fresco-ui/Button';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import MultiSelect from '../../form/arrayFields/MultiSelect.tsx';
import ProtocolArrayField from '../../form/ProtocolArrayField.tsx';
import ProtocolField from '../../form/ProtocolField.tsx';
import ResourcePickerControl from '../../resources/components/ResourcePickerControl.tsx';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import BuilderSection, { type SectionCapability } from '../BuilderSection.tsx';

/**
 * A data file imported while the stage is being edited is STAGED with the
 * host: its bytes are there, its manifest entry is not, and only the finish
 * that promotes it writes one. Everything below turns on that.
 *
 * The stage is the roster name generator, because it is the shape the rule is
 * about: a data file chosen in one section, and three capabilities whose every
 * value names a column of it. Reproduced here from the sections themselves
 * rather than taken from the roster editor, so the claims stay claims about
 * `BuilderSection` and the session behind it.
 */
const STAGED_ROSTER = 'name,city\nAda,Lagos\nGrace,Kyoto\n';

/**
 * The attributes each data file turned out to carry, as the picker's own
 * summary of it lists them. What a test waits for: every section below the
 * data file is chosen from these, and none of them can be judged until the
 * gateway has read the file.
 */
const FIXTURE_COLUMNS = 'age, name';
const STAGED_COLUMNS = 'city, name';

const CARDS: SectionCapability = {
  fields: ['cardOptions'],
  confirmClear: {
    title: 'This will clear the card details',
    description: 'Every extra attribute the cards show will be removed.',
    confirmLabel: 'Clear card details',
  },
};

const SORTING: SectionCapability = {
  fields: ['sortOptions'],
  confirmClear: {
    title: 'This will clear your sorting',
    description: 'The starting order and every sortable attribute will go.',
    confirmLabel: 'Clear sorting',
  },
};

const SEARCH: SectionCapability = {
  fields: ['searchOptions'],
  confirmClear: {
    title: 'This will turn off roster search',
    description: 'The attributes a search is matched against will go.',
    confirmLabel: 'Turn off search',
  },
};

/**
 * A capability that depends on no resource at all, and is switched off by
 * hand. Nothing about it may change: a clear with no staged file behind it is
 * an ordinary edit, and an ordinary edit reaches a live-applying host at once.
 */
const LIMITS: SectionCapability = {
  fields: ['behaviours'],
  confirmClear: {
    title: 'This will clear the nomination limits',
    description: 'The fewest and most people the participant may name go.',
    confirmLabel: 'Clear the limits',
  },
};

const CARD_COLUMNS = [
  { fieldName: 'variable', label: 'Attribute' },
  { fieldName: 'label', control: 'input' as const, label: 'Label' },
];

/** What each data file turned out to hold. The two share only `name`. */
const COLUMNS_OF: Record<string, { value: string; label: string }[]> = {
  fixture: [
    { value: 'name', label: 'name' },
    { value: 'age', label: 'age' },
  ],
  staged: [
    { value: 'name', label: 'name' },
    { value: 'city', label: 'city' },
  ],
};

const ResourcePicker = ResourcePickerControl as ComponentType<
  Record<string, unknown>
>;

function RosterSections() {
  // The card list sits behind a control the researcher opens, which is where a
  // roster's own advanced options sit: the clear has to reach a list that is
  // not mounted when it happens.
  const [showAttributes, setShowAttributes] = useState(false);
  const [staged, setStaged] = useState(false);

  return (
    <>
      <BuilderSection title="Roster source">
        <ProtocolField<typeof ResourcePicker>
          name="dataSource"
          label="Roster data file"
          component={ResourcePicker}
          kind="network"
        />
      </BuilderSection>
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
            options={() => COLUMNS_OF[staged ? 'staged' : 'fixture'] ?? []}
            emptyStateMessage="No extra attributes are shown on a card."
          />
        ) : (
          <>
            <Button type="button" onClick={() => setShowAttributes(true)}>
              Choose the attributes
            </Button>
            <Button type="button" onClick={() => setStaged(true)}>
              Read the new file
            </Button>
          </>
        )}
      </BuilderSection>
      <BuilderSection
        title="Roster order"
        capability={SORTING}
        resetOn="dataSource"
      >
        <ProtocolField
          name="sortOptions.sortOrder"
          label="Starting order"
          component={InputField}
        />
      </BuilderSection>
      <BuilderSection
        title="Roster search"
        capability={SEARCH}
        resetOn="dataSource"
      >
        <ProtocolField
          name="searchOptions.fuzziness"
          label="Tolerance"
          component={InputField}
        />
      </BuilderSection>
      <BuilderSection title="Nomination limits" capability={LIMITS}>
        <ProtocolField
          name="behaviours.minNodes"
          label="Fewest"
          component={InputField}
        />
      </BuilderSection>
    </>
  );
}

const openRoster = () =>
  renderStageEditor({
    stageId: 'name-generator-roster-1',
    sections: <RosterSections />,
  });

/** Imports a data file, which stages it with the host and selects it. */
const importAnotherRoster = async (
  harness: ReturnType<typeof renderStageEditor>,
) => {
  await harness.user.click(
    await screen.findByRole('button', { name: 'Change the data file' }),
  );
  await harness.user.upload(
    await screen.findByLabelText('Choose a file from your computer'),
    new File([STAGED_ROSTER], 'community.csv', { type: 'text/csv' }),
  );
  await screen.findByText(STAGED_COLUMNS);
};

/** The id the gateway gave the file this session staged. */
const stagedRosterId = (harness: ReturnType<typeof renderStageEditor>) => {
  const [descriptor] = harness.session.getSnapshot().stagedResources;
  if (descriptor === undefined) throw new Error('nothing was staged');
  return descriptor.id;
};

describe('a capability reset by a data file staged in this session', () => {
  /**
   * The defect this rule exists for, stated as what the host must not be left
   * holding.
   *
   * The file is staged, so the choice of it cannot reach a live-applying host
   * until the finish that promotes it — and the clears it causes name no
   * resource at all, so nothing about them says they have to wait. Sent alone,
   * they leave the host with the OLD file and none of the card details,
   * ordering or search that described it: a stage nobody authored, made by an
   * edit the researcher then cancelled.
   */
  it('sends a live host nothing at all until the file is saved', async () => {
    const harness = openRoster();
    await screen.findByText(FIXTURE_COLUMNS);

    await importAnotherRoster(harness);

    expect(harness.liveCommands()).toEqual([]);
    // Held rather than lost: the researcher's own draft has the new file and
    // none of the settings that described the old one.
    expect(harness.session.getSnapshot().editedSection.fields).toMatchObject({
      dataSource: stagedRosterId(harness),
    });
    expect(
      harness.session.getSnapshot().editedSection.fields,
    ).not.toHaveProperty('cardOptions');
  });

  it('leaves the host and the stage exactly as they were when it is cancelled', async () => {
    const harness = openRoster();
    await screen.findByText(FIXTURE_COLUMNS);
    await importAnotherRoster(harness);
    // The proof the discard below has something to do.
    expect(harness.gateway.getStagingResidue().length).toBeGreaterThan(0);

    // Closed first, because that is what a cancel IS: a host ends the session
    // and takes the editor down with it. Left mounted, the sections would go
    // on watching a draft the cancel has just rewound and reset themselves
    // against a stage nobody is editing any more.
    harness.unmount();
    await harness.cancel();

    // Nothing was staged, nothing was pending, and nothing ever reached the
    // host — so the stage the interview holds is the one it opened with.
    expect(harness.gateway.getStagingResidue()).toEqual([]);
    expect(harness.liveCommands()).toEqual([]);
    expect(harness.pendingCommands()).toEqual([]);
    expect(harness.session.getSnapshot().editedSection.fields).toEqual(
      harness.seeded.fields,
    );
  });

  it('carries the file and the clears it caused into the same save', async () => {
    const harness = openRoster();
    await screen.findByText(FIXTURE_COLUMNS);
    await importAnotherRoster(harness);
    const staged = stagedRosterId(harness);

    const request = await harness.submit();

    expect(request).not.toBeNull();
    // One apply: the manifest entry for the promoted file, and the batches
    // that only make sense once it exists.
    expect(
      request?.resourceManifest?.commands.map((command) => command.key),
    ).toEqual([staged]);
    expect(
      request?.pendingCommands.flatMap((batch) => [...batch.commands]),
    ).toEqual([
      { op: 'set', key: 'dataSource', value: staged },
      { op: 'unset', key: 'cardOptions' },
      { op: 'unset', key: 'sortOptions' },
      { op: 'unset', key: 'searchOptions' },
    ]);
    expect(request?.stageDocument).toMatchObject({ dataSource: staged });
    expect(request?.stageDocument).not.toHaveProperty('cardOptions');
  });

  /**
   * And every edit made AFTERWARDS, against the file the host has not got.
   *
   * A card detail naming a column only the new file has is as unsendable as
   * the file itself: applied live it would leave the host describing the old
   * file with the new one's columns. The session holds it for the same reason
   * and by the same means — the hold is a suffix, so everything after the
   * batch that took it waits with it.
   */
  it('holds back what the researcher writes against the new file', async () => {
    const harness = openRoster();
    await screen.findByText(FIXTURE_COLUMNS);
    await importAnotherRoster(harness);

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Card details' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Read the new file' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Choose the attributes' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Add new card detail' }),
    );
    const [attribute] = screen.getAllByRole('combobox', { name: 'Attribute' });
    await harness.user.selectOptions(attribute as HTMLElement, 'city');

    // The row is in the researcher's draft and nowhere else. A host that had
    // it would be holding a stage whose data file has no `city` column.
    expect(harness.session.getSnapshot().editedSection.fields).toMatchObject({
      cardOptions: { additionalProperties: [{ variable: 'city' }] },
    });
    expect(JSON.stringify(harness.liveCommands())).not.toContain('city');
    expect(harness.liveCommands()).toEqual([]);
  });

  /**
   * The other side of the rule, and the one that must not have moved.
   *
   * A capability switched off by hand, describing nothing that was staged, is
   * an ordinary edit: the researcher confirmed it, it belongs in the command
   * log, and a host applying edits live gets it at once.
   */
  it('still sends a switch-off that has no staged file behind it', async () => {
    const harness = openRoster();
    await screen.findByText(FIXTURE_COLUMNS);

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Nomination limits' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Clear the limits' }),
    );

    await waitFor(() =>
      expect(harness.liveCommands()).toEqual([
        { op: 'unset', key: 'behaviours' },
      ]),
    );
  });

  /**
   * A file the protocol already holds is a different case, and it must NOT be
   * held back: its manifest entry exists, so a host may apply the swap the
   * moment it is made. What it may not be given is the clears without it.
   */
  it('sends a swap to a committed file with its clears, at once', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-roster-1',
      sections: <RosterSections />,
      assets: {
        other_roster: {
          type: 'network',
          id: 'other_roster',
          name: 'Other roster',
          source: 'other-roster.json',
        },
      },
    });
    await screen.findByText(FIXTURE_COLUMNS);

    await harness.user.click(
      await screen.findByRole('button', { name: 'Change the data file' }),
    );
    const browser = within(await screen.findByRole('dialog'));
    await harness.user.click(
      await browser.findByRole('button', { name: 'Other roster' }),
    );

    await waitFor(() =>
      expect(harness.liveCommands()).toEqual([
        { op: 'set', key: 'dataSource', value: 'other_roster' },
        { op: 'unset', key: 'cardOptions' },
        { op: 'unset', key: 'sortOptions' },
        { op: 'unset', key: 'searchOptions' },
      ]),
    );
  });
});
