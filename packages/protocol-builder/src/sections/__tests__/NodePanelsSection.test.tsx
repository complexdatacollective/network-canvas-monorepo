import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import NodePanelsSection from '../NodePanelsSection.tsx';

const panels = <NodePanelsSection />;

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

const openPanel = async (
  harness: ReturnType<typeof renderStageEditor>,
  name: string,
  index = 0,
) => {
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

/** Points a panel at an imported file, the way a researcher does. */
const chooseImportedNetwork = async (
  harness: ReturnType<typeof renderStageEditor>,
  dialog: ReturnType<typeof within>,
) => {
  await harness.user.click(
    dialog.getByRole('radio', { name: 'Use an imported data file' }),
  );
  await harness.user.click(
    await screen.findByRole('button', { name: 'Roster' }),
  );
};

const panelsOf = (
  request: Awaited<ReturnType<ReturnType<typeof renderStageEditor>['submit']>>,
): Record<string, unknown>[] => {
  const value = request?.stageDocument.panels;
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
};

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
   * A collaborator's codebook change is not this session's edit. It reaches the
   * rule builder's targets, and must not be echoed back as a command of ours —
   * doing so would write their change into this stage's pending batches.
   */
  it('follows a codebook change without claiming it', async () => {
    const harness = renderStageEditor({
      stage: nameGeneratorWith([
        { id: 'panel-1', title: 'First panel', dataSource: 'existing' },
      ]),
      sections: panels,
    });

    const before = harness.pendingCommands().length;
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

    expect(await screen.findByText('First panel')).toBeInTheDocument();
    expect(harness.pendingCommands()).toHaveLength(before);
  });
});
