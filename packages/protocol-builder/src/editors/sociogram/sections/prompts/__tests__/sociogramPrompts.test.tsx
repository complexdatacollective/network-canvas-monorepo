import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { missingSortPropertyLabel } from '../../../../../fields/sortOrderOptions.ts';
import { validatedElsewhereMessage } from '../../../../../form/arrayFields/crossClassPick.ts';
import {
  attributeField,
  chooseAttributeById,
  inventAttribute,
} from '../../../../../testing/attributePicker.ts';
import { enIntl, readMessage } from '../../../../../testing/i18n.ts';
import {
  fixtureLayoutId,
  fixtureTypeId,
  fixtureVariableId,
  loadFixtureStage,
} from '../../../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../../../testing/renderStageEditor.tsx';
import {
  testId,
  testTypeId,
  testVariableId,
} from '../../../../../testing/testId.ts';
import { sociogramPromptMessages } from '../sociogramPromptMessages.ts';
import {
  collectInAForm,
  openPrompt,
  promptAttributeField,
  promptsOf,
  sociogramHolding,
  sociogramSections,
} from './canvasFixtures.tsx';

const PERSON = fixtureTypeId('node', 'person');
const KNOWS = fixtureTypeId('edge', 'knows');
const FAMILY_EDGE = fixtureTypeId('edge', 'family_edge');
const personVariable = (name: string) =>
  fixtureVariableId({ entity: 'node', typeName: 'person' }, name);
const HIGHLIGHTED = personVariable('highlighted');

/**
 * The attribute ids a sort rule is currently offering to order by.
 *
 * The placeholder is dropped: it is the cell's "nothing chosen yet" rather
 * than a property on offer, and counting it would let an empty list pass.
 */
const sortPropertyOptions = (prompt: ReturnType<typeof within>): string[] =>
  [
    ...prompt
      .getByRole('combobox', { name: 'Property' })
      .querySelectorAll('option'),
  ]
    .map((option) => option.value)
    .filter((value) => value !== '');

/** Chooses the task that a prompt sets. */
const chooseTask = async (
  harness: ReturnType<typeof renderStageEditor>,
  prompt: ReturnType<typeof within>,
  name: RegExp,
): Promise<void> => {
  await harness.user.click(await prompt.findByRole('option', { name }));
};

const saveDialog = async (
  harness: ReturnType<typeof renderStageEditor>,
  prompt: ReturnType<typeof within>,
): Promise<void> => {
  await harness.user.click(prompt.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
};

/** The fixture's prompts, read from the fixture itself. */
const fixturePrompts = (): Record<string, unknown>[] =>
  promptsOf({ prompts: loadFixtureStage('sociogram-1').fields.prompts });

const openEditor = () => ({
  stageId: 'sociogram-1' as const,
  sections: sociogramSections,
});

/** The id the fixture gives its first prompt, read from the fixture itself. */
const fixturePromptId = (): unknown => {
  const [first] = [loadFixtureStage('sociogram-1').fields.prompts].flat();
  return typeof first === 'object' && first !== null && 'id' in first
    ? first.id
    : undefined;
};

describe('the tasks a sociogram sets', () => {
  it('lists what the stage already holds', async () => {
    const harness = renderStageEditor(openEditor());

    await waitFor(() => expect(harness.outline()).toHaveLength(4));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Layout',
      'Prompt collection',
      'Node layout',
      'Background',
    ]);
    expect(
      screen.getByText('Place the people who know each other close together'),
    ).toBeInTheDocument();
  });

  it('offers the three tasks', async () => {
    const harness = renderStageEditor(openEditor());

    const prompt = await openPrompt(harness);
    const options = within(
      prompt.getByRole('listbox', { name: 'Task type' }),
    ).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining('Position nodes'),
      expect.stringContaining('Highlight nodes'),
      expect.stringContaining('Connect nodes'),
    ]);
    // The fixture's first prompt is a connect task.
    expect(
      prompt.getByRole('option', { name: /Connect nodes/ }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it("switching task drops the other task's fields", async () => {
    const harness = renderStageEditor(openEditor());

    // The connect task becomes a highlight task: its created edge type goes.
    let prompt = await openPrompt(harness);
    await chooseTask(harness, prompt, /Highlight nodes/);
    await chooseAttributeById(
      harness.user,
      await promptAttributeField('Boolean attribute'),
      HIGHLIGHTED,
    );
    await saveDialog(harness, prompt);

    // The highlight task becomes a layout task: its highlight entry goes.
    prompt = await openPrompt(harness, 1);
    await chooseTask(harness, prompt, /Position nodes/);
    await saveDialog(harness, prompt);

    const [first, second] = promptsOf(
      (await harness.submit())?.stageDocument ?? {},
    );
    expect(first).toEqual({
      id: fixturePromptId(),
      task: 'highlight',
      text: { 'en-US': 'Place the people who know each other close together' },
      edges: { display: [KNOWS] },
      highlight: [
        { id: expect.any(String), type: PERSON, variable: HIGHLIGHTED },
      ],
    });
    expect(second).toMatchObject({ task: 'layout' });
    expect(second).not.toHaveProperty('highlight');
    expect(second?.edges).toEqual({ display: [KNOWS] });
  });

  it.each([
    [
      'a connect task without a kind of connection',
      1,
      /Connect nodes/,
      sociogramPromptMessages.promptCreateEdgeRequired,
    ],
    [
      'a highlight task without an attribute',
      0,
      /Highlight nodes/,
      sociogramPromptMessages.promptHighlightRequired,
    ],
  ] as const)(
    'refuses %s and keeps the prompt it had',
    async (_name, index, task, refusal) => {
      const harness = renderStageEditor(openEditor());

      const prompt = await openPrompt(harness, index);
      await chooseTask(harness, prompt, task);
      await harness.user.click(prompt.getByRole('button', { name: 'Save' }));

      expect(
        await prompt.findByText(enIntl.formatMessage(refusal)),
      ).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await harness.user.click(prompt.getByRole('button', { name: 'Cancel' }));
      await harness.user.click(
        await screen.findByRole('button', { name: /Discard/ }),
      );
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );

      const saved = promptsOf((await harness.submit())?.stageDocument ?? {});
      expect(saved[index]).toEqual(fixturePrompts()[index]);
    },
  );

  it('keeps the id of a highlight entry it saves again', async () => {
    const harness = renderStageEditor(openEditor());

    const prompt = await openPrompt(harness, 1);
    await saveDialog(harness, prompt);

    const saved = promptsOf((await harness.submit())?.stageDocument ?? {})[1];
    expect(saved?.highlight).toEqual(fixturePrompts()[1]?.highlight);
  });

  /**
   * Drawing a connection the participant cannot see is not something a
   * researcher can have meant, and the interview draws it regardless.
   */
  it('shows the kind of connection it lets the participant draw', async () => {
    const harness = renderStageEditor(openEditor());

    const prompt = await openPrompt(harness, 1);
    await chooseTask(harness, prompt, /Connect nodes/);
    await harness.user.click(
      await prompt.findByRole('radio', { name: /family_edge/ }),
    );
    await saveDialog(harness, prompt);

    const saved = promptsOf((await harness.submit())?.stageDocument ?? {})[1];
    expect(saved?.edges).toEqual({
      display: [KNOWS, FAMILY_EDGE],
      create: FAMILY_EDGE,
    });
    expect(saved).not.toHaveProperty('highlight');
  });
});

/**
 * Tapping a node in a highlight task WRITES the attribute it marks, without
 * the codebook's validation rules running, so a prompt may not mark one that a
 * form collects.
 *
 * The picker never offers such an attribute, and the codebook is read live: a
 * collaborator adding the form field while the dialog is open marks the
 * attribute unavailable and leaves the pick in the form. The row's own gate
 * refuses it.
 */
describe('a highlight attribute a form starts collecting mid-edit', () => {
  it('refuses the row rather than closing on the conflict', async () => {
    const harness = renderStageEditor(openEditor());

    const prompt = await openPrompt(harness);
    await chooseTask(harness, prompt, /Highlight nodes/);
    await chooseAttributeById(
      harness.user,
      await promptAttributeField('Boolean attribute'),
      HIGHLIGHTED,
    );

    collectInAForm(harness, HIGHLIGHTED);
    await within(await promptAttributeField('Boolean attribute')).findByText(
      'The “Alter Form” stage collects this attribute and validates each answer, so it cannot also be set here without validation.',
    );

    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));

    await prompt.findByText(
      readMessage(validatedElsewhereMessage('highlighted')),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  /**
   * A conflict that the protocol ALREADY contains does not make the prompt
   * unsaveable. The researcher cannot be asked to fix a stage by editing a
   * form in another stage.
   */
  it('still saves a prompt whose attribute the protocol already collects', async () => {
    const harness = renderStageEditor(openEditor());
    collectInAForm(harness, HIGHLIGHTED);

    const prompt = await openPrompt(harness, 1);
    await saveDialog(harness, prompt);
  });
});

/**
 * No stage before this one places nodes in its layout, so a first prompt that
 * is not a positioning task meets only unplaced nodes, which it cannot use.
 */
describe('the warning about a first prompt that places no nodes', () => {
  const FRESH_LAYOUT = testId('fresh-layout');
  const WARNING_TITLE = enIntl.formatMessage(
    sociogramPromptMessages.firstUseTitle,
  );
  const CONNECT_PROMPT = {
    id: testId('sociogram-prompt-1'),
    task: 'connect',
    text: { 'en-US': 'Link the people who know each other' },
    edges: { create: KNOWS, display: [KNOWS] },
  };

  it('first-use alert appears when the first prompt is not a layout task', async () => {
    const harness = renderStageEditor(
      sociogramHolding(CONNECT_PROMPT, {
        layout: FRESH_LAYOUT,
        behaviours: {},
      }),
    );

    expect(await screen.findByText(WARNING_TITLE)).toBeInTheDocument();
    expect(harness.outline()).toHaveLength(4);
  });

  it('no first-use alert when automatic layout is on', async () => {
    const harness = renderStageEditor(
      sociogramHolding(CONNECT_PROMPT, {
        layout: FRESH_LAYOUT,
        behaviours: { automaticLayout: true },
      }),
    );

    await waitFor(() => expect(harness.outline()).toHaveLength(4));
    expect(
      screen.getByText('Link the people who know each other'),
    ).toBeInTheDocument();
    expect(screen.queryByText(WARNING_TITLE)).not.toBeInTheDocument();
  });

  it('no first-use alert when the first prompt is a layout task', async () => {
    const harness = renderStageEditor(
      sociogramHolding(
        { ...CONNECT_PROMPT, task: 'layout', edges: { display: [KNOWS] } },
        { layout: FRESH_LAYOUT, behaviours: {} },
      ),
    );

    await waitFor(() => expect(harness.outline()).toHaveLength(4));
    expect(screen.queryByText(WARNING_TITLE)).not.toBeInTheDocument();
  });

  it('no first-use alert when an earlier stage places nodes in the layout', async () => {
    const harness = renderStageEditor(
      sociogramHolding(CONNECT_PROMPT, {
        layout: fixtureLayoutId('layout'),
        behaviours: {},
      }),
    );

    await waitFor(() => expect(harness.outline()).toHaveLength(4));
    expect(
      screen.getByText('Link the people who know each other'),
    ).toBeInTheDocument();
    expect(screen.queryByText(WARNING_TITLE)).not.toBeInTheDocument();
  });

  it('warns as soon as a saved stage is given a layout no earlier stage uses', async () => {
    const harness = renderStageEditor(
      sociogramHolding(CONNECT_PROMPT, {
        layout: fixtureLayoutId('layout'),
        behaviours: {},
      }),
    );
    await waitFor(() => expect(harness.outline()).toHaveLength(4));
    expect(screen.queryByText(WARNING_TITLE)).not.toBeInTheDocument();

    await inventAttribute(
      harness.user,
      await waitFor(() => attributeField('Layout')),
      'unused_canvas',
    );

    // Judged on the unsaved layout, not on the one the stage was saved with.
    expect(await screen.findByText(WARNING_TITLE)).toBeInTheDocument();
  });

  it('judges a new stage at the position it is being created at', async () => {
    renderStageEditor({
      create: {
        type: 'Sociogram',
        position: 0,
        fields: {
          subject: { entity: 'node', types: [PERSON] },
          background: { concentricCircles: 4 },
          behaviours: {},
          layout: fixtureLayoutId('layout'),
          prompts: [CONNECT_PROMPT],
        },
      },
      sections: sociogramSections,
    });

    expect(await screen.findByText(WARNING_TITLE)).toBeInTheDocument();
  });

  it('warns as soon as the first prompt is changed to a connect task', async () => {
    const harness = renderStageEditor(
      sociogramHolding(
        { ...CONNECT_PROMPT, task: 'layout', edges: { display: [KNOWS] } },
        { layout: FRESH_LAYOUT, behaviours: {} },
      ),
    );

    const prompt = await openPrompt(harness);
    await chooseTask(harness, prompt, /Connect nodes/);
    await harness.user.click(
      await prompt.findByRole('radio', { name: /knows/ }),
    );
    await saveDialog(harness, prompt);

    expect(await screen.findByText(WARNING_TITLE)).toBeInTheDocument();
  });
});

/**
 * A prompt naming an edge type this protocol does not define.
 *
 * A collaborator deleted the type, or the stage was authored against a
 * different codebook. The tick list renders from the codebook and the value
 * does not, so the id stayed in the prompt with no box to untick: the
 * researcher could not see the reference, could not remove it, and the
 * interview was left asking for a kind of connection that does not exist. The
 * schema does not refuse it — `entityTypeReference` is a tag rather than an
 * existence check — so nothing else was going to report it either.
 */
describe('a connection type this protocol does not define', () => {
  const LOST_EDGE = testTypeId('former_edge');

  const DISPLAYING_A_LOST_TYPE = {
    id: testId('sociogram-prompt-1'),
    task: 'layout',
    text: { 'en-US': 'Place the people who know each other close together' },
    edges: { display: [KNOWS, LOST_EDGE] },
  };

  const LOST_EDGE_CHOICE = `${LOST_EDGE} — this edge type is no longer in the codebook`;

  const openLostEdgePrompt = async (): Promise<{
    harness: ReturnType<typeof renderStageEditor>;
    prompt: ReturnType<typeof within>;
  }> => {
    const harness = renderStageEditor(sociogramHolding(DISPLAYING_A_LOST_TYPE));
    return { harness, prompt: await openPrompt(harness) };
  };

  /**
   * Shown, and shown as CHOSEN, because it is: the value the prompt holds is
   * what the stage saves. Both halves are asserted, since a box that appeared
   * unticked would read as a type the researcher had never picked.
   */
  it('shows the lost type, named by the id nothing describes any more', async () => {
    const { harness, prompt } = await openLostEdgePrompt();

    expect(
      prompt.getByRole('checkbox', { name: LOST_EDGE_CHOICE }),
    ).toBeChecked();

    // And leaving it alone changes nothing — which is what made the missing
    // box a dead end rather than a harmless omission: the reference survives
    // every save until somebody can reach it.
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    const saved = await harness.submit();
    expect(promptsOf(saved?.stageDocument ?? {})[0]?.edges).toEqual({
      display: [KNOWS, LOST_EDGE],
    });
  });

  /**
   * And the same for a type the researcher ticks HERE, which a collaborator
   * then deletes.
   *
   * Derived from the committed list alone, the repair could not see it: the
   * tick list dropped the box while the live field kept the id, so Save wrote
   * a display reference the researcher could neither see nor remove.
   */
  it('shows a type the researcher ticked and a collaborator then deleted', async () => {
    const harness = renderStageEditor(openEditor());
    // A connection type a collaborator adds while this dialog is open reaches
    // the tick list without the dialog asking for it, which is what makes it
    // tickable and then losable.
    harness.receiveCodebookUpdate({
      edge: { [LOST_EDGE]: { name: 'Former' } },
    });

    const prompt = await openPrompt(harness);
    await harness.user.click(
      prompt.getByRole('checkbox', {
        name: 'Former',
        label: { 'en-US': 'Former' },
      }),
    );

    harness.receiveCodebookUpdate({ edge: { [LOST_EDGE]: null } });

    const lost = await prompt.findByRole('checkbox', {
      name: LOST_EDGE_CHOICE,
    });
    expect(lost).toBeChecked();

    await harness.user.click(lost);
    // Unticking must not take the box away mid-gesture: the researcher has to
    // be able to see what they have just done.
    expect(
      prompt.getByRole('checkbox', { name: LOST_EDGE_CHOICE }),
    ).not.toBeChecked();
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    expect(promptsOf(saved?.stageDocument ?? {})[0]?.edges).toEqual({
      display: [KNOWS],
      create: KNOWS,
    });
  });

  it('lets the researcher untick it, which repairs the prompt', async () => {
    const { harness, prompt } = await openLostEdgePrompt();

    await harness.user.click(
      prompt.getByRole('checkbox', { name: LOST_EDGE_CHOICE }),
    );
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    expect(promptsOf(saved?.stageDocument ?? {})[0]?.edges).toEqual({
      display: [KNOWS],
    });
  });
});

/**
 * A prompt that collects a connection without drawing it.
 *
 * `edges.create` and `edges.display` are independent: the interview's canvas
 * selector filters the ties it renders strictly by `edges.display`, so a
 * prompt naming a type to create and showing none collects that tie invisibly.
 * It is a configuration researchers use — `edges-full-matrix`, the end-to-end
 * scenario covering these two keys, has a prompt of exactly this shape and
 * asserts the tie does not appear — so an editor that repaired it on sight
 * changed what a participant experiences, silently, on a stage nobody meant to
 * alter.
 */
describe('a prompt that draws a connection it does not show', () => {
  const COLLECTS_WITHOUT_SHOWING = {
    id: testId('sociogram-prompt-1'),
    task: 'connect',
    text: { 'en-US': 'Place the people who know each other close together' },
    edges: { create: KNOWS, display: [] },
  };

  it('saves it exactly as it arrived', async () => {
    const harness = renderStageEditor(
      sociogramHolding(COLLECTS_WITHOUT_SHOWING),
    );

    const prompt = await openPrompt(harness);
    expect(
      prompt.getByRole('option', { name: /Connect nodes/ }),
    ).toHaveAttribute('aria-selected', 'true');
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    expect(promptsOf(saved?.stageDocument ?? {})[0]).toEqual(
      COLLECTS_WITHOUT_SHOWING,
    );
  });

  /**
   * And the tick box for it is neither locked nor spoken for. The notice
   * saying the created type is always shown belongs to the type the researcher
   * has just chosen, which the editor does put in the list; said over a stored
   * create-only prompt it was a false claim beside a box that was unticked and
   * could not be ticked.
   */
  it('lets the researcher show that connection after all', async () => {
    const harness = renderStageEditor(
      sociogramHolding(COLLECTS_WITHOUT_SHOWING),
    );

    const prompt = await openPrompt(harness);
    expect(
      prompt.queryByText(
        enIntl.formatMessage(
          sociogramPromptMessages.promptCreatedEdgeAlwaysShown,
        ),
      ),
    ).not.toBeInTheDocument();
    const box = prompt.getByRole('checkbox', { name: /knows/ });
    expect(box).not.toBeChecked();
    expect(box).toBeEnabled();

    await harness.user.click(box);
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    expect(promptsOf(saved?.stageDocument ?? {})[0]?.edges).toEqual({
      create: KNOWS,
      display: [KNOWS],
    });
  });
});

/** Opening a prompt and cancelling it without a change asks nothing. */
describe('a prompt opened and cancelled untouched', () => {
  const DISCARD_TITLE = 'Discard your changes?';
  const FRIEND = testTypeId('friend');

  const promptSetting = (
    task: Record<string, unknown>,
  ): Record<string, unknown> => ({
    id: testId('sociogram-prompt-1'),
    text: 'Place the people who know each other close together',
    ...task,
  });

  it.each([
    ['a positioning task', { task: 'layout' }],
    [
      'a highlight task',
      {
        task: 'highlight',
        highlight: [
          {
            id: testId('highlight-entry'),
            type: PERSON,
            variable: HIGHLIGHTED,
          },
        ],
      },
    ],
    [
      'a connect task',
      { task: 'connect', edges: { create: FRIEND, display: [FRIEND] } },
    ],
  ])('closes without asking, for %s', async (_name, task) => {
    const harness = renderStageEditor(sociogramHolding(promptSetting(task)));

    const prompt = await openPrompt(harness);
    await harness.user.click(prompt.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(screen.queryByText(DISCARD_TITLE)).not.toBeInTheDocument();
  });

  // The guard that the cases above expect silence from does speak: without
  // this, a Cancel that never consulted it would pass them all.
  it('asks once the researcher has changed something', async () => {
    const harness = renderStageEditor(
      sociogramHolding(promptSetting({ task: 'layout' })),
    );

    const prompt = await openPrompt(harness);
    await chooseTask(harness, prompt, /Connect nodes/);
    await harness.user.click(prompt.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText(DISCARD_TITLE)).toBeInTheDocument();
  });
});

/**
 * The attribute a prompt needs, invented from inside the prompt's own picker.
 *
 * A position attribute is finished the moment it is named — there is no list
 * of values and no control a participant answers it through — so the create
 * row holds it and the window closes on the new pill. No second dialog, and
 * no sibling button: looking for the attribute and finding it does not exist
 * are one act, in one control.
 */
describe('creating an attribute a prompt needs without leaving the stage', () => {
  it('stores positions in a layout created from the stage’s own picker', async () => {
    const harness = renderStageEditor(openEditor());

    await inventAttribute(
      harness.user,
      await waitFor(() => attributeField('Layout')),
      'second_canvas',
    );

    await waitFor(() =>
      expect(
        within(attributeField('Layout')).getByText('second_canvas'),
      ).toBeInTheDocument(),
    );

    // The editor has the layout, and the protocol does not until the stage
    // is saved.
    const created = Object.entries(harness.editorCodebook().layouts ?? {}).find(
      ([, layout]) => layout.name === 'second_canvas',
    )?.[0];
    expect(created).toBeDefined();
    expect(
      Object.values(harness.hostCodebook().layouts ?? {}).some(
        (layout) => layout.name === 'second_canvas',
      ),
    ).toBe(false);

    const saved = await harness.submit();
    expect(
      Object.values(harness.hostCodebook().layouts ?? {}).some(
        (layout) => layout.name === 'second_canvas',
      ),
    ).toBe(true);
    expect(saved?.stageDocument.layout).toBe(created);
    // A layout belongs to the codebook, not to a node type.
    expect(
      Object.values(
        harness.hostCodebook().node?.[PERSON]?.variables ?? {},
      ).some((variable) => variable.name === 'second_canvas'),
    ).toBe(false);
  });

  /**
   * The other slot a sociogram prompt fills, and the same act: deciding to
   * mark these people and inventing the flag to mark them with is one thought.
   *
   * A boolean is finished by a name too, so this one is held with the stage as
   * well — and it is made as the flag the tap will set rather
   * than as whatever kind of answer happened to be handy, which is the only
   * thing the slot decides on the researcher's behalf.
   */
  it('invents the flag a tap marks a node with', async () => {
    const harness = renderStageEditor(openEditor());

    const prompt = await openPrompt(harness);
    await chooseTask(harness, prompt, /Highlight nodes/);
    await inventAttribute(
      harness.user,
      await promptAttributeField('Boolean attribute'),
      'spoke_to_recently',
    );

    await waitFor(() =>
      expect(
        within(attributeField('Boolean attribute')).getByText(
          'spoke_to_recently',
        ),
      ).toBeInTheDocument(),
    );

    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    const created = Object.entries(
      harness.editorCodebook().node?.[PERSON]?.variables ?? {},
    ).find(([, variable]) => variable.name === 'spoke_to_recently');
    if (created === undefined) throw new Error('the flag was not created');
    expect(created[1].type).toBe('boolean');
    expect(harness.hostCodebook().node?.[PERSON]?.variables).not.toHaveProperty(
      created[0],
    );
    const saved = await harness.submit();
    expect(harness.hostCodebook().node?.[PERSON]?.variables).toHaveProperty(
      created[0],
    );
    expect(promptsOf(saved?.stageDocument ?? {})[0]?.highlight).toEqual([
      { id: expect.any(String), type: PERSON, variable: created[0] },
    ]);
  });
});

/**
 * The stack of nodes the participant has not placed yet is handed to them in
 * an order, and `sociogramPromptSchema.sortOrder` is where a prompt says what
 * that order is. It is the one place in a sociogram a researcher can decide
 * who the participant is asked about first, so a stage that holds one and an
 * editor that cannot show it is an editor that quietly discards a decision.
 */
/**
 * A tick list whose choices all come from the codebook can have none, and a
 * fieldset with no boxes in it reads as an editor that failed to draw rather
 * than as a protocol with nothing to offer. The released Architect disabled
 * the whole section instead; the package says why.
 */
describe('a connections list with nothing in it', () => {
  it('says why, rather than rendering an empty fieldset', async () => {
    const harness = renderStageEditor(
      sociogramHolding({
        id: testId('sociogram-prompt-1'),
        task: 'layout',
        text: {
          'en-US': 'Place the people who know each other close together',
        },
      }),
    );

    // Every edge type gone, so the prompt's own list has nothing to offer and
    // holds no reference of its own to report as lost.
    harness.receiveCodebookUpdate({
      edge: { [KNOWS]: null, [FAMILY_EDGE]: null },
    });

    const prompt = await openPrompt(harness);

    expect(
      await prompt.findByText(
        'Nothing to choose from yet. Create what this list offers in the codebook first.',
      ),
    ).toBeInTheDocument();
    expect(prompt.queryByRole('checkbox')).toBeNull();

    // Inside the field's own group, which still answers to the label. A
    // sentence rendered in place of the group instead leaves the field with
    // no accessible name at all — the `<label for>` above it can name a
    // fieldset through `aria-labelledby`, and names nothing at all when what
    // is there is a paragraph.
    const list = prompt.getByRole('group', { name: 'Edge types' });
    expect(
      within(list).getByText(
        'Nothing to choose from yet. Create what this list offers in the codebook first.',
      ),
    ).toBeInTheDocument();
  });
});

describe('the order a sociogram hands unplaced nodes over in', () => {
  const NICKNAME = testVariableId('nickname');
  const SORTED_PROMPT = {
    id: testId('sociogram-prompt-1'),
    task: 'layout',
    text: { 'en-US': 'Place the people who know each other close together' },
    sortOrder: [
      {
        id: testId('sort-name'),
        type: PERSON,
        property: personVariable('name'),
        direction: 'asc',
      },
    ],
  };

  const openWithSortOrder = () => sociogramHolding(SORTED_PROMPT);

  it('saves a rule the researcher added to a prompt that had none', async () => {
    const harness = renderStageEditor(openEditor());

    const prompt = await openPrompt(harness);
    await harness.user.click(
      prompt.getByRole('switch', { name: 'Sort unplaced nodes' }),
    );
    await harness.user.click(
      await prompt.findByRole('button', {
        name: 'Add new sort rule',
      }),
    );
    await harness.user.selectOptions(
      await prompt.findByRole('combobox', { name: 'Property' }),
      'age',
    );
    await harness.user.selectOptions(
      prompt.getByRole('combobox', { name: 'Direction' }),
      'desc',
    );
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    expect(promptsOf(saved?.stageDocument ?? {})[0]?.sortOrder).toEqual([
      {
        id: expect.any(String),
        type: PERSON,
        property: personVariable('age'),
        direction: 'desc',
      },
    ]);
  });

  /**
   * Opening a prompt and saving it is not a decision about anything, so the
   * row has to come back out of the dialog exactly as it went in — key for
   * key, and no key it did not arrive with.
   *
   * Asserted as the WHOLE row rather than as the keys the dialog rendered,
   * because the failure this catches is an invention: the dialog wrote the
   * tap-behaviour flag on mount, so a prompt that had never said anything
   * about tapping came back saying it does not allow marking.
   */
  it('saves a prompt it opened and left alone exactly as it arrived', async () => {
    const harness = renderStageEditor(openWithSortOrder());

    const prompt = await openPrompt(harness);
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    expect(promptsOf(saved?.stageDocument ?? {})[0]).toEqual(SORTED_PROMPT);
  });

  /**
   * And the other side of the same rule: a stage that has not been told what
   * it collects reports NO rule as dangling.
   *
   * `SortOrderRows` judges "no longer in the codebook" against the properties
   * the family hands it, and it tells two answers apart — an empty list is a
   * subject with nothing to sort by, where a rule certainly is dangling, and
   * `undefined` is a family that does not know yet. A sociogram whose subject
   * names no type is the second: answering `[]` would mark every rule the
   * prompt holds as pointing at a deleted attribute and refuse a save the
   * researcher cannot fix — the type they need to choose is in another
   * section, and choosing it is what makes the question answerable at all.
   */
  it('judges no sort rule while the stage has not been told what it collects', async () => {
    const harness = renderStageEditor({
      stage: {
        id: testId('Sociogram-stage'),
        type: 'Sociogram' as const,
        fields: {
          label: { 'en-US': 'Sociogram' },
          subject: { entity: 'node', types: [''] },
          prompts: [
            {
              ...SORTED_PROMPT,
              sortOrder: [
                {
                  id: testId('sort-nickname'),
                  type: PERSON,
                  property: NICKNAME,
                  direction: 'asc',
                },
              ],
            },
          ],
        },
      },
      sections: sociogramSections,
    });

    const prompt = await openPrompt(harness);

    // The fixed "keep the source order" choice and nothing else: no codebook
    // to draw from, and — the point — no orphan option manufactured out of the
    // rule's own id.
    expect(sortPropertyOptions(prompt)).toEqual(['*']);
    expect(
      prompt.queryByRole('option', {
        name: missingSortPropertyLabel(NICKNAME, enIntl),
      }),
    ).not.toBeInTheDocument();

    // And the save is not refused for it. This is what a list of `[]` would
    // cost: the same prompt, unopenable-to-fix, over an attribute that may
    // well exist on the type the researcher is about to choose.
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });
});

describe('a sociogram that shows several node types', () => {
  const FAMILY = fixtureTypeId('node', 'family member');
  const familyVariable = (name: string) =>
    fixtureVariableId({ entity: 'node', typeName: 'family member' }, name);
  const HAS_CONDITION = familyVariable('hasConditionX');

  const severalTypes = (prompt: Record<string, unknown>) =>
    sociogramHolding(prompt, {
      subject: { entity: 'node', types: [PERSON, FAMILY] },
    });

  const HIGHLIGHT_PROMPT = {
    id: testId('several-highlight'),
    task: 'highlight',
    text: { 'en-US': 'Tap the people you trust' },
    highlight: [
      { id: testId('highlight-person'), type: PERSON, variable: HIGHLIGHTED },
    ],
  };

  const SORTED_PROMPT = {
    id: testId('several-sorted'),
    task: 'layout',
    text: { 'en-US': 'Place everyone' },
    sortOrder: [
      {
        id: testId('sort-person'),
        type: PERSON,
        property: personVariable('name'),
        direction: 'asc',
      },
      {
        id: testId('sort-family'),
        type: FAMILY,
        property: familyVariable('fm_name'),
        direction: 'desc',
      },
    ],
    nodeTypeOrder: [FAMILY, PERSON],
  };

  it('saves a highlight entry for each node type the prompt marks', async () => {
    const harness = renderStageEditor(severalTypes(HIGHLIGHT_PROMPT));

    await openPrompt(harness);
    await chooseAttributeById(
      harness.user,
      await promptAttributeField('Boolean attribute for family member'),
      HAS_CONDITION,
    );
    await saveDialog(harness, within(screen.getByRole('dialog')));

    const saved = await harness.submit();
    // The whole prompt, so an order nobody chose cannot creep in.
    expect(promptsOf(saved?.stageDocument ?? {})[0]).toEqual({
      ...HIGHLIGHT_PROMPT,
      highlight: [
        { id: testId('highlight-person'), type: PERSON, variable: HIGHLIGHTED },
        { id: expect.any(String), type: FAMILY, variable: HAS_CONDITION },
      ],
    });
  });

  it('saves a highlight prompt with no node type order exactly as it arrived', async () => {
    const harness = renderStageEditor(severalTypes(HIGHLIGHT_PROMPT));

    await openPrompt(harness);
    await saveDialog(harness, within(screen.getByRole('dialog')));

    const saved = await harness.submit();
    const [first] = promptsOf(saved?.stageDocument ?? {});
    expect(first).toEqual(HIGHLIGHT_PROMPT);
    expect(first).not.toHaveProperty('nodeTypeOrder');
  });

  it('lets the researcher stop highlighting one node type', async () => {
    const harness = renderStageEditor(severalTypes(HIGHLIGHT_PROMPT));

    const prompt = await openPrompt(harness);
    const family = await promptAttributeField(
      'Boolean attribute for family member',
    );
    await chooseAttributeById(harness.user, family, HAS_CONDITION);
    await harness.user.click(
      await prompt.findByRole('button', {
        name: 'Do not highlight nodes of type family member',
      }),
    );
    await waitFor(() =>
      expect(
        prompt.queryByRole('button', {
          name: 'Do not highlight nodes of type family member',
        }),
      ).toBeNull(),
    );
    await saveDialog(harness, prompt);

    const saved = await harness.submit();
    expect(promptsOf(saved?.stageDocument ?? {})[0]).toEqual(HIGHLIGHT_PROMPT);
  });

  it('refuses a highlight pick for a later node type that a form collects', async () => {
    const harness = renderStageEditor(severalTypes(HIGHLIGHT_PROMPT));

    const prompt = await openPrompt(harness);
    await chooseAttributeById(
      harness.user,
      await promptAttributeField('Boolean attribute for family member'),
      HAS_CONDITION,
    );
    collectInAForm(harness, HAS_CONDITION, FAMILY);
    await within(
      await promptAttributeField('Boolean attribute for family member'),
    ).findByText(
      'The “Alter Form” stage collects this attribute and validates each answer, so it cannot also be set here without validation.',
    );
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));

    const family = await promptAttributeField(
      'Boolean attribute for family member',
    );
    await within(family).findByText(
      readMessage(validatedElsewhereMessage('hasConditionX')),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('still saves a later node type pick that the protocol already collects', async () => {
    const prompt = {
      ...HIGHLIGHT_PROMPT,
      highlight: [
        ...HIGHLIGHT_PROMPT.highlight,
        {
          id: testId('highlight-family'),
          type: FAMILY,
          variable: HAS_CONDITION,
        },
      ],
    };
    const harness = renderStageEditor(severalTypes(prompt));
    collectInAForm(harness, HAS_CONDITION, FAMILY);

    await openPrompt(harness);
    await saveDialog(harness, within(screen.getByRole('dialog')));

    const saved = await harness.submit();
    expect(promptsOf(saved?.stageDocument ?? {})[0]).toEqual(prompt);
  });

  it('refuses a highlight task that marks no node type', async () => {
    const harness = renderStageEditor(severalTypes(SORTED_PROMPT));

    const prompt = await openPrompt(harness);
    await chooseTask(harness, prompt, /Highlight nodes/u);
    // Each type's picker is optional on its own.
    await promptAttributeField('Boolean attribute for family member');
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));

    expect(
      await prompt.findByText(
        enIntl.formatMessage(
          sociogramPromptMessages.promptHighlightRequiredSeveral,
        ),
      ),
    ).toBeInTheDocument();
  });

  it('saves a prompt it opened and left alone exactly as it arrived', async () => {
    const harness = renderStageEditor(severalTypes(SORTED_PROMPT));

    const prompt = await openPrompt(harness);
    // One sort group for each type, each opened on that type's own rules.
    expect(
      prompt.getByRole('switch', {
        name: 'Sort unplaced nodes of type person',
      }),
    ).toBeChecked();
    expect(
      prompt.getByRole('switch', {
        name: 'Sort unplaced nodes of type family member',
      }),
    ).toBeChecked();
    await saveDialog(harness, prompt);

    const saved = await harness.submit();
    expect(promptsOf(saved?.stageDocument ?? {})[0]).toEqual(SORTED_PROMPT);
  });

  it('saves the order the researcher moves the node types into', async () => {
    const harness = renderStageEditor(severalTypes(SORTED_PROMPT));

    const prompt = await openPrompt(harness);
    const handle = prompt.getByRole('button', { name: 'Reorder item 1 of 2' });
    handle.focus();
    await harness.user.keyboard('{ArrowDown}');
    await saveDialog(harness, prompt);

    const saved = await harness.submit();
    expect(promptsOf(saved?.stageDocument ?? {})[0]?.nodeTypeOrder).toEqual([
      PERSON,
      FAMILY,
    ]);
  });

  it('completes a saved node type order that misses a type the stage shows', async () => {
    const PLACE = testTypeId('place');
    const harness = renderStageEditor(
      sociogramHolding(SORTED_PROMPT, {
        subject: { entity: 'node', types: [PERSON, FAMILY, PLACE] },
      }),
    );
    harness.receiveCodebookUpdate({
      node: {
        [PLACE]: {
          name: 'place',
          color: 'node-color-seq-3',
          shape: { default: 'square' },
          variables: {},
        },
      },
    });

    const prompt = await openPrompt(harness);
    await saveDialog(harness, prompt);

    const saved = await harness.submit();
    expect(promptsOf(saved?.stageDocument ?? {})[0]?.nodeTypeOrder).toEqual([
      FAMILY,
      PERSON,
      PLACE,
    ]);
  });

  it('saves a rule added for one type as a rule about that type', async () => {
    const harness = renderStageEditor(severalTypes(HIGHLIGHT_PROMPT));

    const prompt = await openPrompt(harness);
    await harness.user.click(
      prompt.getByRole('switch', {
        name: 'Sort unplaced nodes of type family member',
      }),
    );
    await harness.user.click(
      await prompt.findByRole('button', { name: 'Add new sort rule' }),
    );
    await harness.user.selectOptions(
      await prompt.findByRole('combobox', { name: 'Property' }),
      familyVariable('fm_name'),
    );
    await harness.user.selectOptions(
      prompt.getByRole('combobox', { name: 'Direction' }),
      'asc',
    );
    await saveDialog(harness, prompt);

    const saved = await harness.submit();
    expect(promptsOf(saved?.stageDocument ?? {})[0]?.sortOrder).toEqual([
      {
        id: expect.any(String),
        type: FAMILY,
        property: familyVariable('fm_name'),
        direction: 'asc',
      },
    ]);
  });

  it('keeps showing the edge type a prompt holds after its rules stop fitting the stage', async () => {
    const harness = renderStageEditor(
      sociogramHolding({
        id: testId('connect'),
        task: 'connect',
        text: { 'en-US': 'Who knows whom?' },
        edges: { create: KNOWS, display: [KNOWS] },
      }),
    );
    harness.receiveCodebookUpdate({
      edge: {
        [KNOWS]: {
          name: 'knows',
          color: 'edge-color-seq-1',
          endpointRules: [{ sourceType: FAMILY, targetType: FAMILY }],
        },
      },
    });

    const prompt = await openPrompt(harness);
    const created = within(
      prompt.getByRole('radiogroup', { name: 'Created edge type' }),
    );
    await waitFor(() =>
      expect(created.getByRole('radio', { name: 'knows' })).toBeChecked(),
    );
  });

  it('does not offer an edge type that no pair of the stage’s node types may have', async () => {
    const harness = renderStageEditor(
      sociogramHolding({
        id: testId('connect'),
        task: 'connect',
        text: { 'en-US': 'Who knows whom?' },
        edges: { create: FAMILY_EDGE, display: [FAMILY_EDGE] },
      }),
    );
    harness.receiveCodebookUpdate({
      edge: {
        [KNOWS]: {
          name: 'knows',
          color: 'edge-color-seq-1',
          endpointRules: [{ sourceType: FAMILY, targetType: FAMILY }],
        },
      },
    });

    const prompt = await openPrompt(harness);
    const created = within(
      prompt.getByRole('radiogroup', { name: 'Created edge type' }),
    );
    expect(created.getByRole('radio', { name: 'family_edge' })).toBeChecked();
    await waitFor(() =>
      expect(created.queryByRole('radio', { name: 'knows' })).toBeNull(),
    );
  });
});
