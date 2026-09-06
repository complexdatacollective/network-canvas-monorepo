import { screen, waitFor, within } from '@testing-library/react';
import { type ComponentType, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Button } from '@codaco/fresco-ui/Button';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { buildUpdateVariableRequest } from '../../codebook/editing.ts';
import MultiSelect from '../../form/arrayFields/MultiSelect.tsx';
import ProtocolArrayField from '../../form/ProtocolArrayField.tsx';
import ProtocolField from '../../form/ProtocolField.tsx';
import ResourcePickerControl from '../../resources/components/ResourcePickerControl.tsx';
import { fixtureMessage } from '../../testing/i18n.ts';
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
    title: fixtureMessage('This will clear the card details'),
    description: fixtureMessage(
      'Every extra attribute the cards show will be removed.',
    ),
    confirmLabel: fixtureMessage('Clear card details'),
  },
};

const SORTING: SectionCapability = {
  fields: ['sortOptions'],
  confirmClear: {
    title: fixtureMessage('This will clear your sorting'),
    description: fixtureMessage(
      'The starting order and every sortable attribute will go.',
    ),
    confirmLabel: fixtureMessage('Clear sorting'),
  },
};

const SEARCH: SectionCapability = {
  fields: ['searchOptions'],
  confirmClear: {
    title: fixtureMessage('This will turn off roster search'),
    description: fixtureMessage(
      'The attributes a search is matched against will go.',
    ),
    confirmLabel: fixtureMessage('Turn off search'),
  },
};

/**
 * A capability that resets on the data file and owns a key the roster fixture
 * does not hold, so its reset finds nothing whatever to throw away.
 */
const PRESENTATION: SectionCapability = {
  fields: ['presentationOptions'],
  confirmClear: {
    title: fixtureMessage('This will clear the presentation'),
    description: fixtureMessage(
      'Everything about how the roster is presented will go.',
    ),
    confirmLabel: fixtureMessage('Clear the presentation'),
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
    title: fixtureMessage('This will clear the nomination limits'),
    description: fixtureMessage(
      'The fewest and most people the participant may name go.',
    ),
    confirmLabel: fixtureMessage('Clear the limits'),
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

/**
 * The same stage with ONE capability that resets on the data file, owning a key
 * the fixture does not hold. Everything the rule has to do is decided by the
 * cause alone here, because there is no clear to carry it.
 */
function UnconfiguredRosterSections() {
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
        title="Presentation"
        capability={PRESENTATION}
        resetOn="dataSource"
      >
        <ProtocolField
          name="presentationOptions.style"
          label="Style"
          component={InputField}
        />
      </BuilderSection>
      {/* A bound list: it writes to the session the moment it is edited. */}
      <BuilderSection title="Card details">
        <Button type="button" onClick={() => setStaged(true)}>
          Read the new file
        </Button>
        <ProtocolArrayField<typeof MultiSelect>
          name="cardOptions.additionalProperties"
          label="Attributes shown on a card"
          component={MultiSelect}
          addButtonLabel="Add new card detail"
          properties={CARD_COLUMNS}
          options={() => COLUMNS_OF[staged ? 'staged' : 'fixture'] ?? []}
          emptyStateMessage="No extra attributes are shown on a card."
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

const openUnconfiguredRoster = () =>
  renderStageEditor({
    stageId: 'name-generator-roster-1',
    sections: <UnconfiguredRosterSections />,
  });

/** Imports a data file, which stages it with the host and selects it. */
const importAnotherRoster = async (
  harness: ReturnType<typeof renderStageEditor>,
) => {
  // Either way into the browser: the picker offers a change while it holds a
  // file, and a choice once the researcher has discarded it.
  await harness.user.click(
    await screen.findByRole('button', {
      name: /^(Change the|Select a) data file$/,
    }),
  );
  await harness.user.upload(
    await screen.findByLabelText('Choose a file from your computer'),
    new File([STAGED_ROSTER], 'community.csv', { type: 'text/csv' }),
  );
  await screen.findByText(STAGED_COLUMNS);
};

/** The `person` type as the SESSION holds it — what an editor builds an edit from. */
const personDocument = (
  harness: ReturnType<typeof renderStageEditor>,
): SectionDoc => {
  const person =
    harness.session.getSnapshot().protocolSections[
      sectionId({ kind: 'codebookNode', typeId: 'person' })
    ];
  if (person === undefined) throw new Error('the fixture has no "person" type');
  return person;
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

/**
 * The same rule where the capability turns out to hold nothing.
 *
 * There is no clear to strand, so it is tempting to read this as a reset that
 * did not happen and write nothing at all. But what makes the file safe is that
 * the SESSION saw it: the hold is decided from the draft, so a batch that never
 * touches `dataSource` leaves the session judging a draft that still names the
 * file the researcher replaced — and everything they then write against the new
 * one goes to a live-applying host at once.
 */
describe('a data file chosen while the capability it resets holds nothing', () => {
  it('still reaches the draft, alone in its own batch', async () => {
    const harness = openUnconfiguredRoster();
    await screen.findByText(FIXTURE_COLUMNS);

    await importAnotherRoster(harness);

    const staged = stagedRosterId(harness);
    expect(harness.session.getSnapshot().editedSection.fields).toMatchObject({
      dataSource: staged,
    });
    expect(
      harness.pendingCommands().flatMap((batch) => [...batch.commands]),
    ).toEqual([{ op: 'set', key: 'dataSource', value: staged }]);
    // And it is the batch the file itself makes unsendable, which is the whole
    // reason it had to travel now rather than at the submit.
    expect(harness.liveCommands()).toEqual([]);
  });

  it('holds back what the researcher then writes against it', async () => {
    const harness = openUnconfiguredRoster();
    await screen.findByText(FIXTURE_COLUMNS);
    await importAnotherRoster(harness);

    // A card detail named from the columns of the file just chosen. A bound
    // list writes to the session the moment the row is edited.
    await harness.user.click(
      await screen.findByRole('button', { name: 'Read the new file' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Add new card detail' }),
    );
    const attributes = screen.getAllByRole('combobox', { name: 'Attribute' });
    await harness.user.selectOptions(attributes.at(-1) as HTMLElement, 'city');

    // A host applying live would otherwise hold a stage whose data file is the
    // OLD one and whose card details name a column only the NEW one has.
    expect(JSON.stringify(harness.liveCommands())).not.toContain('city');
    expect(harness.liveCommands()).toEqual([]);
  });

  it('takes that edit away again with the file when it is cancelled', async () => {
    const harness = openUnconfiguredRoster();
    await screen.findByText(FIXTURE_COLUMNS);
    await importAnotherRoster(harness);
    await harness.user.click(
      await screen.findByRole('button', { name: 'Read the new file' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Add new card detail' }),
    );
    const attributes = screen.getAllByRole('combobox', { name: 'Attribute' });
    await harness.user.selectOptions(attributes.at(-1) as HTMLElement, 'city');

    harness.unmount();
    await harness.cancel();

    // The file was discarded, and so was the row that only makes sense with it.
    expect(harness.gateway.getStagingResidue()).toEqual([]);
    expect(harness.liveCommands()).toEqual([]);
  });
});

/**
 * And the way back out: the researcher discards the file they imported.
 *
 * Emptying the picker is a researcher change on `dataSource` like any other, so
 * every section resetting on it runs again — this time with a cause of
 * `undefined`, and with nothing left to discard because the import already
 * cleared them. The cause is the whole batch, and without it the draft goes on
 * naming bytes that no longer exist anywhere.
 */
describe('a staged data file the researcher discards again', () => {
  const discardTheImportedFile = async (
    harness: ReturnType<typeof renderStageEditor>,
  ) => {
    await harness.user.click(
      await screen.findByRole('button', { name: 'Discard this resource' }),
    );
    await waitFor(() =>
      expect(harness.session.getSnapshot().stagedResources).toEqual([]),
    );
  };

  it('leaves no reference to it in the draft', async () => {
    const harness = openRoster();
    await screen.findByText(FIXTURE_COLUMNS);
    await importAnotherRoster(harness);
    const staged = stagedRosterId(harness);

    await discardTheImportedFile(harness);

    expect(await screen.findByText('No resource selected.')).toBeVisible();
    expect(
      harness.session.getSnapshot().editedSection.fields,
    ).not.toHaveProperty('dataSource', staged);
    expect(
      harness.session.getSnapshot().editedSection.fields,
    ).not.toHaveProperty('dataSource');
  });

  it('says nothing about a dangling resource in the outline', async () => {
    const harness = openRoster();
    await screen.findByText(FIXTURE_COLUMNS);
    await importAnotherRoster(harness);
    const staged = stagedRosterId(harness);

    await discardTheImportedFile(harness);

    // The picker on screen holds nothing, so the researcher must not be told
    // the stage points at a resource the protocol does not have.
    await waitFor(() => {
      const issues = harness.session
        .getSnapshot()
        .validation.issues.map((issue) => issue.message);
      expect(issues.join(' ')).not.toContain(staged);
    });
  });

  /**
   * And it releases the hold the import took.
   *
   * The hold is a suffix over the batches a live host may not be given, and it
   * was taken because one of them named bytes only a finish could commit. Once
   * the file is discarded that is true of nothing: no finish will ever promote
   * it. Left standing, the hold would keep every later edit off the host and
   * refuse every compound edit for the rest of the session.
   */
  it('gives a live host the edits that were waiting for it', async () => {
    const harness = openRoster();
    await screen.findByText(FIXTURE_COLUMNS);
    await importAnotherRoster(harness);
    const staged = stagedRosterId(harness);
    expect(harness.liveCommands()).toEqual([]);

    await discardTheImportedFile(harness);

    // The researcher's own two edits, in the order they made them: the swap
    // they asked for, and the emptying that superseded it.
    await waitFor(() =>
      expect(harness.liveCommands()).toEqual([
        { op: 'set', key: 'dataSource', value: staged },
        { op: 'unset', key: 'cardOptions' },
        { op: 'unset', key: 'sortOptions' },
        { op: 'unset', key: 'searchOptions' },
        { op: 'unset', key: 'dataSource' },
      ]),
    );
  });

  it('lets an ordinary edit made afterwards reach that host', async () => {
    const harness = openRoster();
    await screen.findByText(FIXTURE_COLUMNS);
    await importAnotherRoster(harness);
    await discardTheImportedFile(harness);
    await waitFor(() =>
      expect(harness.liveCommands().length).toBeGreaterThan(0),
    );
    const released = harness.liveCommands().length;

    // A capability switched off by hand, describing nothing that was ever
    // staged. It is an ordinary edit and the host gets it at once.
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Nomination limits' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Clear the limits' }),
    );

    await waitFor(() =>
      expect(harness.liveCommands().slice(released)).toEqual([
        { op: 'unset', key: 'behaviours' },
      ]),
    );
  });

  it('lets a related section be edited again', async () => {
    const harness = openRoster();
    await screen.findByText(FIXTURE_COLUMNS);
    await importAnotherRoster(harness);

    // While the file is staged the request is refused, because a batch the
    // host has not got cannot be folded into one.
    const rename = (name: string) =>
      buildUpdateVariableRequest({
        requestId: `rename-age-to-${name}`,
        description: 'Rename an attribute',
        subject: { entity: 'node', type: 'person' },
        authoritativeDocument: personDocument(harness),
        variableId: 'age',
        draft: { name },
      });
    await expect(
      harness.session.requestCompoundEdit(rename('years')),
    ).resolves.toMatchObject({ status: 'failed', reason: 'pending-commands' });

    await discardTheImportedFile(harness);
    await waitFor(() =>
      expect(harness.liveCommands().length).toBeGreaterThan(0),
    );

    await expect(
      harness.session.requestCompoundEdit(rename('years_old')),
    ).resolves.toMatchObject({ status: 'applied' });
  });

  it('starts the hold again at the next file imported', async () => {
    const harness = openRoster();
    await screen.findByText(FIXTURE_COLUMNS);
    await importAnotherRoster(harness);
    await discardTheImportedFile(harness);
    await waitFor(() =>
      expect(harness.liveCommands().length).toBeGreaterThan(0),
    );
    const released = harness.liveCommands().length;

    await importAnotherRoster(harness);

    // The new file is staged too, so what names it waits exactly as before.
    expect(harness.session.getSnapshot().editedSection.fields).toMatchObject({
      dataSource: stagedRosterId(harness),
    });
    expect(harness.liveCommands()).toHaveLength(released);
  });
});

/**
 * The one reset a section may not ask for.
 *
 * A cause reaches the session as a command, and a command addresses keys and
 * never list positions — so a path with an index in it has nothing that could
 * carry it. Answering with no command is the one thing that must not happen:
 * the clears would travel without the change that explains them, which is the
 * defect the whole rule exists to prevent. It is refused where it is read.
 */
describe('a section resetting on a path a command cannot address', () => {
  function RowResetSections() {
    return (
      <>
        <BuilderSection title="Prompts">
          <ProtocolField
            name="prompts[0].text"
            label="Prompt text"
            component={InputField}
          />
        </BuilderSection>
        <BuilderSection
          title="Roster order"
          capability={SORTING}
          resetOn="prompts[0].text"
        >
          <ProtocolField
            name="sortOptions.sortOrder"
            label="Starting order"
            component={InputField}
          />
        </BuilderSection>
      </>
    );
  }

  it('is refused rather than reset without its cause', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-roster-1',
      sections: <RowResetSections />,
    });
    const text = await screen.findByRole('textbox', { name: 'Prompt text' });

    await expect(harness.user.type(text, '!')).rejects.toThrow(
      /no command can address/,
    );
  });
});
