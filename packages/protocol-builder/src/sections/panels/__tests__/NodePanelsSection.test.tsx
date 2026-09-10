import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import NodePanelsSection from '../NodePanelsSection.tsx';

const panels = <NodePanelsSection />;

type Harness = ReturnType<typeof renderStageEditor>;

/**
 * What the host is still holding for this edit.
 *
 * The only place a staged file really exists: the editor's own list of what it
 * has staged is bookkeeping over this, and a discard the host refused would
 * leave the two disagreeing. Failures are thrown rather than answered with an
 * empty list, which is what a discard having worked looks like.
 *
 * The edit is named because staged files belong to it: a list that named none
 * would answer with the protocol's committed resources alone, and every
 * question here would be answered "nothing is staged" whatever the editor was
 * holding.
 */
const stagedInTheHost = async (
  harness: Harness,
): Promise<readonly Readonly<{ id: string; name: string }>[]> => {
  const answer = await harness.host.client.resources.list({
    protocolId: harness.host.protocolId,
    editId: harness.editId,
    status: 'staged',
  });
  if (answer.status !== 'ok') {
    throw new Error(
      `the host would not list its resources: ${answer.failure.message}`,
    );
  }
  return answer.data.resources;
};

/** A name generator carrying the panels a test needs it to start with. */
const nameGeneratorWith = (configured: SectionDoc[]) => ({
  id: 'name-generator-with-panels',
  type: 'NameGenerator' as const,
  fields: {
    label: 'Name Generator',
    subject: { entity: 'node', type: 'person' },
    form: {
      title: 'Add a person',
      fields: [{ variable: 'name', prompt: "What is this person's name?" }],
    },
    prompts: [{ id: 'prompt-1', text: 'Who are the people you know?' }],
    panels: configured,
  },
});

const openPanel = async (harness: Harness, name: string, index = 0) => {
  const trigger = screen.getAllByRole('button', { name })[index];
  if (trigger === undefined) throw new Error(`There is no "${name}" ${index}.`);
  await harness.user.click(trigger);
  return within(await screen.findByRole('dialog'));
};

/** A panel narrowed by a rule only the interview's own network can answer. */
const panelWithAnEdgeRule = {
  id: 'panel-1',
  title: 'People you named earlier',
  dataSource: 'existing',
  filter: {
    join: 'AND',
    rules: [
      {
        id: 'rule-1',
        type: 'edge',
        options: { type: 'knows', operator: 'EXISTS' },
      },
    ],
  },
};

/**
 * A panel narrowed by a rule about the participant themselves. Legal in a
 * panel filter — `ProtocolSchemaV8` validates one with ego rules enabled, and
 * `getPanelNodes` hands the interview network's real ego to the filter — so a
 * stage carrying one is a stage this section has to be able to open and save.
 */
const panelWithAnEgoRule = {
  id: 'panel-1',
  title: 'People you named earlier',
  dataSource: 'existing',
  filter: {
    rules: [
      {
        id: 'rule-1',
        type: 'ego',
        options: {
          attribute: 'ego_name',
          operator: 'EXACTLY',
          value: 'Ada',
        },
      },
    ],
  },
};

/** Points a panel at an imported file, the way a researcher does. */
const chooseImportedNetwork = async (
  harness: Harness,
  dialog: ReturnType<typeof within>,
) => {
  await harness.user.click(
    dialog.getByRole('radio', { name: 'Use an imported data file' }),
  );
  await harness.user.click(
    await screen.findByRole('button', { name: 'Roster' }),
  );
};

/** A small network file, with records in it so the host accepts the import. */
const IMPORTED_NETWORK = JSON.stringify({
  nodes: [{ attributes: { name: 'Amara' } }, { attributes: { name: 'Beto' } }],
});

/** Imports a network file through the panel's picker, staging it. */
const importNetworkFile = async (
  harness: Harness,
  dialog: ReturnType<typeof within>,
  fileName: string,
) => {
  await harness.user.click(
    dialog.getByRole('radio', { name: 'Use an imported data file' }),
  );
  await harness.user.upload(
    await screen.findByLabelText('Choose a file from your computer'),
    new File([IMPORTED_NETWORK], fileName, { type: 'application/json' }),
  );
  await dialog.findByRole('button', { name: 'Discard this resource' });
};

const panelsOf = (
  request: Awaited<ReturnType<Harness['submit']>>,
): Record<string, unknown>[] => {
  const value = request?.stageDocument.panels;
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
};

/**
 * What the shell says when the stage's own schema is what refused the save.
 *
 * It names no panel, so a researcher who meets it has to go looking. A
 * refusal this section decided says its own sentence instead, which is why a
 * test that means the section's refusal also says this one is absent.
 */
const SCHEMA_REFUSAL =
  'This stage is not finished, so it was not saved. The sections below say what is missing.';

describe('the side panels a name generator shows', () => {
  it('shows the panels a stage arrives with, and saves them unchanged', async () => {
    const harness = renderStageEditor({
      stage: nameGeneratorWith([
        {
          id: 'panel-1',
          title: 'People you named earlier',
          dataSource: 'existing',
        },
      ]),
      sections: panels,
    });

    expect(
      await screen.findByText('People you named earlier'),
    ).toBeInTheDocument();
    // The stage's name, the type it nominates, its add-a-person form and what
    // it asks belong to sections this mount does not include.
    await harness.roundTrip({
      unowned: ['label', 'subject', 'form', 'prompts'],
    });
  });

  /**
   * A stage with no panels is the norm, so the section arrives switched off and
   * writes nothing. Absent, not an empty list: the researcher has not said
   * "show no panels", they have not asked for panels at all.
   */
  it('writes nothing for a stage that has no panels', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: panels,
    });

    const request = await harness.submit();
    expect(request).not.toBeNull();
    expect(Object.hasOwn(request?.stageDocument ?? {}, 'panels')).toBe(false);
  });

  it('records the panel the researcher created', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: panels,
    });

    await harness.user.click(
      screen.getByRole('switch', { name: 'Side panels' }),
    );
    const dialog = await openPanel(harness, 'Create new panel');
    await harness.user.type(
      dialog.getByRole('textbox', { name: 'Panel title' }),
      'People you named earlier',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    expect(panelsOf(await harness.submit())).toEqual([
      {
        id: expect.any(String) as unknown as string,
        title: 'People you named earlier',
        dataSource: 'existing',
      },
    ]);
  });

  /**
   * A panel with no title has nothing above it on screen, and the schema
   * refuses it — as `stages.N.panels.0.title`, a path rather than the section
   * the researcher is looking at.
   */
  it('refuses to save a panel with no title', async () => {
    const harness = renderStageEditor({
      stage: nameGeneratorWith([{ id: 'panel-1', dataSource: 'existing' }]),
      sections: panels,
    });

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'Every panel needs a title and a source of people. Open the unfinished panel and complete it.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * A panel reads its source as network data, so a reference to a map layer,
   * an image or a recording is a panel the interview cannot fill: it reads the
   * bytes, fails to parse them, and tells the participant the external data is
   * unavailable. The picker refuses such a resource when one is CHOSEN; a
   * stage authored elsewhere never went through the picker.
   *
   * `ProtocolSchemaV8` does not catch it either — it checks a
   * `NameGeneratorRoster` data source is a `network` asset and says nothing
   * about a panel's — so this section is where the researcher hears about it.
   */
  it('refuses a panel whose stored source is not network data', async () => {
    const harness = renderStageEditor({
      stage: nameGeneratorWith([
        { id: 'panel-1', title: 'People nearby', dataSource: 'geo_data' },
      ]),
      sections: panels,
    });

    expect(await screen.findByText('People nearby')).toBeInTheDocument();
    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        'A panel is set to list something that is not network data. Open it and choose a data file, or the people named so far.',
      ),
    ).toBeInTheDocument();
    // And it is this section's refusal rather than the schema's, so the
    // researcher is told which panel is wrong.
    expect(screen.queryByText(SCHEMA_REFUSAL)).toBeNull();
  });

  /**
   * A rule about connections is a question about the network the participant is
   * building. An imported file has none, so the rule could never match and the
   * panel would silently show nobody — accepted by the schema, unreported by
   * the interview, discovered mid-study.
   *
   * Losing rules the researcher wrote is a real loss, so it is confirmed
   * first, exactly as switching the whole section off is.
   */
  it('drops a connection rule, once told to, when the panel stops reading the interview', async () => {
    const harness = renderStageEditor({
      stage: nameGeneratorWith([panelWithAnEdgeRule]),
      sections: panels,
    });

    const dialog = await openPanel(harness, 'Edit panel');
    await chooseImportedNetwork(harness, dialog);
    await harness.user.click(
      await screen.findByRole('button', { name: 'Delete the rules' }),
    );

    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    const saved = panelsOf(await harness.submit())[0];
    expect(saved).toEqual({
      id: 'panel-1',
      title: 'People you named earlier',
      dataSource: 'roster_data',
    });
  });

  /**
   * And refusing keeps both: the rules are what the researcher answered for,
   * and they only mean anything against the interview's own network — so the
   * source goes back rather than the panel being left in the one state that
   * would silently show nobody.
   */
  it('puts the source back when the researcher keeps the rules', async () => {
    const harness = renderStageEditor({
      stage: nameGeneratorWith([panelWithAnEdgeRule]),
      sections: panels,
    });

    const dialog = await openPanel(harness, 'Edit panel');
    await chooseImportedNetwork(harness, dialog);
    await harness.user.click(
      await screen.findByRole('button', { name: 'Cancel' }),
    );

    await waitFor(() =>
      expect(
        dialog.getByRole('radio', {
          name: 'Use the network from the in-progress interview',
        }),
      ).toBeChecked(),
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    expect(panelsOf(await harness.submit())[0]).toEqual(panelWithAnEdgeRule);
  });

  /**
   * Two, because a name generator shows its panels beside the interview and a
   * third would leave nothing to nominate into. The schema does not cap them,
   * so nothing downstream would refuse a stage with three — the screen is the
   * only thing that knows, and this is where it says so.
   */
  it('offers no third panel once there are two', async () => {
    const harness = renderStageEditor({
      stage: nameGeneratorWith([
        { id: 'panel-1', title: 'First panel', dataSource: 'existing' },
        { id: 'panel-2', title: 'Second panel', dataSource: 'existing' },
      ]),
      sections: panels,
    });

    expect(await screen.findByText('Second panel')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create new panel' }),
    ).not.toBeInTheDocument();

    // And one panel is one short of the cap, so the control is there.
    harness.unmount();
    renderStageEditor({
      stage: nameGeneratorWith([
        { id: 'panel-1', title: 'First panel', dataSource: 'existing' },
      ]),
      sections: panels,
    });

    expect(
      await screen.findByRole('button', { name: 'Create new panel' }),
    ).toBeInTheDocument();
  });

  /**
   * The schema caps nothing; the screen does. A protocol authored elsewhere —
   * by hand, or by a tool that did not know — can therefore hold three, and
   * hiding the add button says nothing about the three already there: the
   * stage opened, rendered all of them, and saved them straight back.
   *
   * Refused rather than trimmed, because deleting a panel a researcher wrote
   * is their decision, and every panel here has a delete beside it. Architect
   * caps the same list at two (`components/sections/NodePanels/panelSlots.ts`)
   * and shows only the first two, so a stage saved from here is one Architect
   * can show as well.
   */
  it('refuses a stage carrying more panels than it can show', async () => {
    const harness = renderStageEditor({
      stage: nameGeneratorWith([
        { id: 'panel-1', title: 'First panel', dataSource: 'existing' },
        { id: 'panel-2', title: 'Second panel', dataSource: 'existing' },
        { id: 'panel-3', title: 'Third panel', dataSource: 'existing' },
      ]),
      sections: panels,
    });

    expect(await screen.findByText('Third panel')).toBeInTheDocument();

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        'This stage has more side panels than a name generator can show. Delete panels until two are left.',
      ),
    ).toBeInTheDocument();
    // And it is this section's refusal rather than the schema's: the schema
    // caps nothing, so nothing below would have said so.
    expect(screen.queryByText(SCHEMA_REFUSAL)).toBeNull();

    // And it is a refusal the researcher can act on: every panel on screen
    // has a remove beside it, the extra one included.
    const remove = screen.getAllByRole('button', { name: 'Remove panel' })[2];
    if (remove === undefined) throw new Error('the third panel has no remove');
    await harness.user.click(remove);
    await harness.user.click(
      await screen.findByRole('button', { name: 'Delete panel' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Third panel')).not.toBeInTheDocument(),
    );
    expect(panelsOf(await harness.submit())).toHaveLength(2);
  });

  /**
   * A panel's filter asks about a node type, and its rules are chosen from
   * that type's attributes — so until the stage says what it works with there
   * is nothing for a panel to be about, and the section says so rather than
   * offering rules over an empty codebook. Every sibling section on these
   * stages waits the same way.
   */
  it('waits for a node type before offering panels', async () => {
    renderStageEditor({
      stage: {
        id: 'name-generator-without-a-type',
        type: 'NameGenerator',
        fields: {
          label: 'Name Generator',
          form: {
            title: 'Add a person',
            fields: [{ variable: 'name', prompt: 'What is their name?' }],
          },
          prompts: [{ id: 'prompt-1', text: 'Who are the people you know?' }],
        },
      },
      sections: panels,
    });

    expect(
      await screen.findByText(
        'Choose what this stage works with before adding side panels.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Side panels' })).toBeDisabled();
  });

  /**
   * A panel filter is optional, and most panels have none — a panel that
   * listed everyone is what "no filter" means. So it is a capability like
   * every other one in the builder: off until asked for, and destroying what
   * it holds asks first.
   */
  it('keeps the filter out of the way until the researcher asks for one', async () => {
    const harness = renderStageEditor({
      stage: nameGeneratorWith([
        {
          id: 'panel-1',
          title: 'People you named earlier',
          dataSource: 'existing',
        },
      ]),
      sections: panels,
    });

    const dialog = await openPanel(harness, 'Edit panel');
    const filterSwitch = dialog.getByRole('switch', { name: 'Panel filter' });
    expect(filterSwitch).not.toBeChecked();
    expect(
      dialog.queryByRole('button', { name: 'Add new filter rule' }),
    ).not.toBeInTheDocument();

    await harness.user.click(filterSwitch);

    expect(
      await dialog.findByRole('button', { name: 'Add new filter rule' }),
    ).toBeInTheDocument();
  });

  it('opens the filter for a panel that has one, and asks before clearing it', async () => {
    const harness = renderStageEditor({
      stage: nameGeneratorWith([panelWithAnEdgeRule]),
      sections: panels,
    });

    const dialog = await openPanel(harness, 'Edit panel');
    const filterSwitch = dialog.getByRole('switch', { name: 'Panel filter' });
    expect(filterSwitch).toBeChecked();

    // Refused: the rules stay, and so does the switch.
    await harness.user.click(filterSwitch);
    await harness.user.click(
      await screen.findByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() => expect(filterSwitch).toBeChecked());

    await harness.user.click(filterSwitch);
    await harness.user.click(
      await screen.findByRole('button', { name: 'Clear filter' }),
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    expect(panelsOf(await harness.submit())[0]).toEqual({
      id: 'panel-1',
      title: 'People you named earlier',
      dataSource: 'existing',
    });
  });

  /**
   * A rule about the participant themselves is a rule a panel over the
   * interview's own network can really be narrowed by: the schema validates a
   * panel filter with ego rules enabled, and the interview hands that filter
   * the session's real ego. Reported as unusable, it would hold the panel's
   * dialog shut over an edit that has nothing to do with the rule.
   */
  it('saves an unrelated edit to a panel narrowed by a rule about the participant', async () => {
    const harness = renderStageEditor({
      stage: nameGeneratorWith([panelWithAnEgoRule]),
      sections: panels,
    });

    const dialog = await openPanel(harness, 'Edit panel');
    expect(
      dialog.queryByText(
        'This rule is about the ego, which these rules cannot ask about. Edit or delete the rule.',
      ),
    ).not.toBeInTheDocument();

    const title = dialog.getByRole('textbox', { name: 'Panel title' });
    await harness.user.clear(title);
    await harness.user.type(title, 'People you already know');
    await saveTheRow(harness, dialog);

    expect(panelsOf(await harness.submit())[0]).toEqual({
      ...panelWithAnEgoRule,
      title: 'People you already know',
    });
  });

  /**
   * Reordering is committed as the move it actually was, so both panels — and
   * every key inside them, including a filter no control on this row renders —
   * survive it whole.
   */
  it('keeps both panels whole when they are reordered', async () => {
    const harness = renderStageEditor({
      stage: nameGeneratorWith([
        { id: 'panel-1', title: 'First panel', dataSource: 'existing' },
        {
          id: 'panel-2',
          title: 'Second panel',
          dataSource: 'existing',
          filter: {
            join: 'AND',
            rules: [
              {
                id: 'rule-1',
                type: 'edge',
                options: { type: 'knows', operator: 'EXISTS' },
              },
            ],
          },
        },
      ]),
      sections: panels,
    });

    const handle = await screen.findByRole('button', {
      name: 'Reorder panel 1 of 2',
    });
    handle.focus();
    await harness.user.keyboard('{ArrowDown}');

    const saved = panelsOf(await harness.submit());
    expect(saved.map((panel) => panel.id)).toEqual(['panel-2', 'panel-1']);
    expect(saved[0]).toMatchObject({
      title: 'Second panel',
      filter: { join: 'AND' },
    });
  });

  /**
   * The same state a source change asks about, arriving already made. A
   * protocol authored elsewhere can hold a panel that reads an imported file
   * AND carries a rule about connections, and the confirmation above never
   * fires for it: nothing changed. An imported file has no edges, so the rule
   * could never match and the panel would silently show nobody — which is why
   * the save has to be refused rather than the state saved.
   *
   * The refusal is the stage's own schema now (`panelsSchema` refines it,
   * reading nothing but the stage), so the editor meets it at save rather than
   * letting it through to publication.
   */
  it('refuses a panel that arrives reading a file with a connection rule', async () => {
    const harness = renderStageEditor({
      stage: nameGeneratorWith([
        { ...panelWithAnEdgeRule, dataSource: 'roster_data' },
      ]),
      sections: panels,
    });

    expect(
      await screen.findByText('People you named earlier'),
    ).toBeInTheDocument();

    expect(await harness.submit()).toBeNull();
    // Said where the researcher can act on it: the schema anchors the problem
    // at the panel's own rule, so it belongs to the section holding it rather
    // than to one sentence at the top of the page.
    expect(
      harness.outline().find((section) => section.title === 'Side panels')
        ?.state,
    ).toContain(
      'External-data panel filters cannot use edge rules; rules must target node attributes.',
    );
  });

  /**
   * A network imported in this edit is not in the protocol's manifest yet: it
   * is promoted with the stage's save. The summary has to look at what the
   * edit has staged as well, or a researcher is told the file they have just
   * imported is one this protocol does not hold.
   */
  it('names a network imported in this edit in the panel summary', async () => {
    const harness = renderStageEditor({
      stage: nameGeneratorWith([
        { id: 'panel-1', title: 'First panel', dataSource: 'existing' },
      ]),
      sections: panels,
    });

    const dialog = await openPanel(harness, 'Edit panel');
    await importNetworkFile(harness, dialog, 'community.json');
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    expect(
      await screen.findByText('Lists community.json.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/no longer in this protocol/),
    ).not.toBeInTheDocument();
  });

  /**
   * The codebook is not this stage's section, so a collaborator may add an
   * entity type while a panel's rules are open in front of the researcher. A
   * rule may be about any node type, so the new one has to be offered.
   */
  it('follows a codebook change made elsewhere', async () => {
    const harness = renderStageEditor({
      stage: nameGeneratorWith([
        { id: 'panel-1', title: 'First panel', dataSource: 'existing' },
      ]),
      sections: panels,
    });

    const dialog = await openPanel(harness, 'Edit panel');
    await harness.user.click(
      dialog.getByRole('switch', { name: 'Panel filter' }),
    );
    await harness.user.click(
      await dialog.findByRole('button', { name: 'Add new filter rule' }),
    );
    await harness.user.click(
      await screen.findByRole('radio', {
        name: 'Node - match a node type or one of its attributes.',
      }),
    );
    expect(await screen.findByRole('radio', { name: 'person' })).toBeVisible();
    expect(screen.queryByRole('radio', { name: 'place' })).toBeNull();

    harness.receiveCodebookUpdate({
      node: {
        place: {
          name: 'place',
          color: 'node-color-seq-2',
          icon: 'add-a-place',
          shape: { default: 'square' },
          variables: {},
        },
      },
    });

    // The revision reaches the rule builder over the protocol channel, which
    // is a microtask rather than the call above.
    expect(
      await screen.findByRole('radio', { name: 'place' }),
    ).toBeInTheDocument();
  });
});

/** Saves the row the dialog has open and waits for it to close. */
const saveTheRow = async (
  harness: Harness,
  dialog: ReturnType<typeof within>,
) => {
  await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0));
};

/** Points a panel at a file already staged in this session. */
const pickTheStagedFile = async (
  harness: Harness,
  dialog: ReturnType<typeof within>,
  fileName: string,
) => {
  await harness.user.click(
    dialog.getByRole('radio', { name: 'Use an imported data file' }),
  );
  await harness.user.click(
    await screen.findByRole('button', { name: fileName }),
  );
};

const STILL_IN_USE =
  'This resource is still used elsewhere on this stage, so it was not discarded.';

const ONE_PANEL = [
  { id: 'panel-1', title: 'First panel', dataSource: 'existing' },
];
const TWO_PANELS = [
  ...ONE_PANEL,
  { id: 'panel-2', title: 'Second panel', dataSource: 'existing' },
];

/**
 * One imported network file, through the whole life a panel dialog can give
 * it, asked the only question that destroys anything: may these bytes go?
 *
 * Discarding drops the file for the entire editing session, and a row dialog
 * is the one place where the stage has TWO answers about what names it — the
 * draft on screen, which a save would commit, and the row as it stands
 * committed, which a cancel would leave. Both are futures the researcher still
 * has, so a reference in either is a reference the discard would leave
 * dangling, and the count that gates the discard has to see both. Every case
 * below differs only in which of them holds the file.
 */
describe('discarding an imported network from a panel dialog', () => {
  type Lifecycle = Readonly<{
    /** What holds the file when the researcher asks to discard it. */
    holder: string;
    seeded: SectionDoc[];
    /** Leaves a panel dialog open, showing the imported file. */
    reach: (harness: Harness) => Promise<ReturnType<typeof within>>;
    /** Whether the bytes may go. */
    discarded: boolean;
  }>;

  const lifecycle: readonly Lifecycle[] = [
    {
      holder: 'only the dialog that imported it',
      seeded: ONE_PANEL,
      discarded: true,
      reach: async (harness) => {
        const dialog = await openPanel(harness, 'Edit panel');
        await importNetworkFile(harness, dialog, 'community.json');
        return dialog;
      },
    },
    {
      /**
       * The row's own committed copy. Written over rather than counted
       * alongside the draft, it read as a single reference: the discard was
       * allowed, the bytes went, and the dialog-local clear that came with
       * them was undone by cancelling the row — leaving the stage naming a
       * file the host had deleted.
       */
      holder: 'the saved copy of the row the dialog has open',
      seeded: ONE_PANEL,
      discarded: false,
      reach: async (harness) => {
        const dialog = await openPanel(harness, 'Edit panel');
        await importNetworkFile(harness, dialog, 'community.json');
        await saveTheRow(harness, dialog);
        return openPanel(harness, 'Edit panel');
      },
    },
    {
      /**
       * The panel next door. Its pick is in the stage form; this dialog's is
       * not, so a count blind to the asking field read the neighbour's lone
       * reference as "only this field uses it".
       */
      holder: 'the other panel',
      seeded: TWO_PANELS,
      discarded: false,
      reach: async (harness) => {
        const first = await openPanel(harness, 'Edit panel', 0);
        await importNetworkFile(harness, first, 'community.json');
        await saveTheRow(harness, first);
        const second = await openPanel(harness, 'Edit panel', 1);
        await pickTheStagedFile(harness, second, 'community.json');
        return second;
      },
    },
  ];

  it.each(lifecycle)(
    'is refused while $holder names it',
    async ({ seeded, reach, discarded }) => {
      const harness = renderStageEditor({
        stage: nameGeneratorWith(seeded),
        sections: panels,
      });

      const dialog = await reach(harness);
      await harness.user.click(
        await dialog.findByRole('button', { name: 'Discard this resource' }),
      );

      if (discarded) {
        await waitFor(async () => {
          expect(await stagedInTheHost(harness)).toEqual([]);
        });
        expect(dialog.queryByRole('alert')).toBeNull();
        return;
      }

      expect(await dialog.findByRole('alert')).toHaveTextContent(STILL_IN_USE);
      // The bytes are still staged, so every reference to them still
      // resolves — which is the whole point of the refusal.
      expect(await stagedInTheHost(harness)).not.toEqual([]);
    },
  );

  /**
   * And the refusal leaves a stage that saves. This is the state the discard
   * used to reach: the file gone, the dialog's own field cleared, and the
   * committed row still naming it the moment the researcher cancelled.
   */
  it('leaves the panel naming a file the save can still promote', async () => {
    const harness = renderStageEditor({
      stage: nameGeneratorWith(ONE_PANEL),
      sections: panels,
    });

    const dialog = await openPanel(harness, 'Edit panel');
    await importNetworkFile(harness, dialog, 'community.json');
    await saveTheRow(harness, dialog);
    const staged = (await stagedInTheHost(harness))[0];
    if (staged === undefined) throw new Error('the import staged nothing');

    const reopened = await openPanel(harness, 'Edit panel');
    await harness.user.click(
      await reopened.findByRole('button', { name: 'Discard this resource' }),
    );
    expect(await reopened.findByRole('alert')).toHaveTextContent(STILL_IN_USE);
    await harness.user.click(reopened.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    const request = await harness.submit();
    expect(panelsOf(request)[0]).toMatchObject({ dataSource: staged.id });
    // Promoted with the stage, so the reference the panel keeps resolves in
    // the saved protocol rather than pointing at nothing.
    expect(
      Object.keys(
        harness.protocolSections()[sectionId({ kind: 'assets' })] ?? {},
      ),
    ).toContain(staged.id);
  });

  /**
   * The dismissal question is asked of the row as the dialog OPENED on it.
   * Asked of the live value instead, the picker's own choice becomes its own
   * baseline the moment it is made: nothing reads as changed, and Cancel,
   * Escape, the close button and a click outside all take the switch away
   * without a word.
   */
  it('asks before losing a source switch the researcher has not saved', async () => {
    const harness = renderStageEditor({
      stage: nameGeneratorWith(ONE_PANEL),
      sections: panels,
    });

    const dialog = await openPanel(harness, 'Edit panel');
    await chooseImportedNetwork(harness, dialog);
    await harness.user.click(dialog.getByRole('button', { name: 'Cancel' }));

    expect(
      await screen.findByRole('button', { name: 'Keep editing' }),
    ).toBeVisible();
    await harness.user.click(
      screen.getByRole('button', { name: 'Keep editing' }),
    );
    expect(
      await dialog.findByRole('radio', { name: 'Use an imported data file' }),
    ).toBeChecked();
  });
});
