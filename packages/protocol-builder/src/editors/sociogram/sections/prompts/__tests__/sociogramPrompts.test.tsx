import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  MISSING_SORT_PROPERTY_MESSAGE,
  missingSortPropertyLabel,
} from '../../../../../fields/sortOrderOptions.ts';
import { validatedElsewhereMessage } from '../../../../../form/arrayFields/crossClassPick.ts';
import { enIntl, readMessage } from '../../../../../testing/i18n.ts';
import { renderStageEditor } from '../../../../../testing/renderStageEditor.tsx';
import { sociogramPromptMessages } from '../sociogramPromptMessages.ts';
import {
  collectInAForm,
  openPrompt,
  personVariables,
  promptsOf,
  sociogramHolding,
  sociogramSections,
} from './canvasFixtures.tsx';

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

const openEditor = () => ({
  stageId: 'sociogram-1' as const,
  sections: sociogramSections,
});

describe('the tasks a sociogram sets', () => {
  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor(openEditor());

    // The stage's name and the type it arranges belong to sections this mount
    // does not include.
    await harness.roundTrip({ unowned: ['label', 'subject'] });
  });

  it('lists what the stage already holds', async () => {
    const harness = renderStageEditor(openEditor());

    await waitFor(() => expect(harness.outline()).toHaveLength(3));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Prompts',
      'Node layout',
      'Background',
    ]);
    expect(
      screen.getByText('Place the people who know each other close together'),
    ).toBeInTheDocument();
  });

  /**
   * Tapping a node either draws a connection or marks the node; the schema
   * refuses a prompt that does both, and the interview would silently let edge
   * creation win. So choosing one has to take the other away.
   */
  it('stops creating connections when tapping is asked to do nothing', async () => {
    const harness = renderStageEditor(openEditor());

    const prompt = await openPrompt(harness);
    await harness.user.click(prompt.getByRole('option', { name: /Nothing/ }));
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    expect(promptsOf(saved?.stageDocument ?? {})[0]).toEqual({
      id: 'sociogram-prompt-1',
      text: 'Place the people who know each other close together',
      layout: { layoutVariable: 'layout' },
      edges: { display: ['knows'] },
      highlight: { allowHighlighting: false },
    });
  });

  it('marks nodes with the attribute the researcher chose', async () => {
    const harness = renderStageEditor(openEditor());

    const prompt = await openPrompt(harness);
    await harness.user.click(
      prompt.getByRole('option', { name: /Mark the node/ }),
    );
    await harness.user.selectOptions(
      await prompt.findByRole('combobox', { name: 'Attribute marked' }),
      'highlighted',
    );
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    const first = promptsOf(saved?.stageDocument ?? {})[0];
    expect(first?.highlight).toEqual({
      allowHighlighting: true,
      variable: 'highlighted',
    });
    expect(first?.edges).toEqual({ display: ['knows'] });
  });

  /**
   * Drawing a connection the participant cannot see is not something a
   * researcher can have meant, and the interview draws it regardless.
   */
  it('shows the kind of connection it lets the participant draw', async () => {
    const harness = renderStageEditor(openEditor());

    const prompt = await openPrompt(harness, 1);
    await harness.user.click(
      prompt.getByRole('option', { name: /Create a connection/ }),
    );
    await harness.user.click(
      await prompt.findByRole('radio', { name: /family_edge/ }),
    );
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    expect(promptsOf(saved?.stageDocument ?? {})[1]?.edges).toEqual({
      display: ['knows', 'family_edge'],
      create: 'family_edge',
    });
  });
});

/**
 * Tapping a node WRITES the attribute it marks, without the codebook's
 * validation rules running — so a prompt may not mark one a form collects.
 *
 * The picker enforces that by never offering such an attribute, and the
 * codebook is read live: a collaborator adding the form field while the dialog
 * is open drops the attribute from the option list and leaves the pick sitting
 * in the form. Nothing then refused the row, so Save committed a prompt the
 * protocol reports as a writer conflict.
 */
describe('a highlight attribute a form starts collecting mid-edit', () => {
  it('refuses the row rather than closing on the conflict', async () => {
    const harness = renderStageEditor(openEditor());

    const prompt = await openPrompt(harness);
    await harness.user.click(
      prompt.getByRole('option', { name: /Mark the node/ }),
    );
    await harness.user.selectOptions(
      await prompt.findByRole('combobox', { name: 'Attribute marked' }),
      'highlighted',
    );

    collectInAForm(harness, 'highlighted');
    // The picker is built from the live codebook, so the attribute leaving its
    // options IS the collaborator's change arriving — and that is the state
    // the row's own gate has to refuse from. Waited for rather than assumed:
    // a save clicked before the change lands is refused by nothing, which is
    // the defect this test exists for.
    await prompt.findByRole('option', {
      name: 'highlighted — this attribute is not available here',
    });

    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));

    // The dialog staying open IS the refusal, and the reason is the one the
    // codebook editor gives for the same conflict — read back through the same
    // decode the render site uses, because it travels encoded on a
    // plain-string contract.
    await prompt.findByText(
      readMessage(validatedElsewhereMessage('highlighted')),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  /**
   * And the other half: a conflict the protocol ALREADY holds does not make
   * the prompt that holds it unsaveable. The researcher cannot be asked to fix
   * a stage by editing a form in another one they may not even be able to
   * reach.
   */
  it('still saves a prompt whose attribute the protocol already collects', async () => {
    const harness = renderStageEditor(openEditor());
    // The prompt that already marks `highlighted`, and the form field that
    // conflicts with it, arriving before anything is edited.
    collectInAForm(harness, 'highlighted');

    const prompt = await openPrompt(harness, 1);
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
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
  const LOST_EDGE = 'former_edge';

  const DISPLAYING_A_LOST_TYPE = {
    id: 'sociogram-prompt-1',
    text: 'Place the people who know each other close together',
    layout: { layoutVariable: 'layout' },
    edges: { display: ['knows', LOST_EDGE] },
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
      display: ['knows', LOST_EDGE],
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
    await harness.user.click(prompt.getByRole('checkbox', { name: 'Former' }));

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
      display: ['knows'],
      create: 'knows',
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
      display: ['knows'],
    });
  });
});

/**
 * A prompt that COLOURS its nodes by an attribute without letting the
 * participant change it.
 *
 * `highlight.variable` alone is display-only by the schema's own reading —
 * `entity-attribute-reference` tags the site `usageRequiresSibling:
 * 'allowHighlighting'`, and the interview gates its tap-to-toggle branch on
 * the flag while reading `variable` for the colour regardless. So the
 * attribute is one this stage READS, and nothing the participant does here
 * writes it.
 */
describe('a prompt that only colours its nodes', () => {
  const DISPLAY_ONLY_PROMPT = {
    id: 'sociogram-prompt-1',
    text: 'Place the people who know each other close together',
    layout: { layoutVariable: 'layout' },
    highlight: { variable: 'highlighted', allowHighlighting: false },
  };

  /**
   * Opening the dialog and saving it is not a decision about anything, and the
   * one it must not make is this one: classified by `highlight.variable` alone,
   * the prompt opened on "mark the node" and an effect wrote
   * `allowHighlighting: true` behind it — so merely looking at a display-only
   * prompt handed the participant a switch that writes to an attribute the
   * researcher had reserved for reading, and the data collected changed.
   */
  it('does not start writing the attribute it only reads', async () => {
    const harness = renderStageEditor(sociogramHolding(DISPLAY_ONLY_PROMPT));

    const prompt = await openPrompt(harness);
    // Tapping does nothing, which is exactly what this prompt says: the
    // colours are drawn from an attribute the participant cannot toggle.
    expect(prompt.getByRole('option', { name: /Nothing/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    expect(promptsOf(saved?.stageDocument ?? {})[0]).toEqual(
      DISPLAY_ONLY_PROMPT,
    );
  });

  /**
   * And choosing what tapping does leaves the colouring alone.
   *
   * The chooser owns the two things a TAP can do, so it clears the side it is
   * leaving and nothing else. Clearing both of the other two on every change
   * threw away a `highlight.variable` that had never been on screen — the
   * researcher was answering a question about tapping, and the answer took the
   * prompt's colours with it.
   */
  it('keeps the colouring when the researcher says what tapping does', async () => {
    const harness = renderStageEditor(sociogramHolding(DISPLAY_ONLY_PROMPT));

    const prompt = await openPrompt(harness);
    await harness.user.click(
      prompt.getByRole('option', { name: /Create a connection/ }),
    );
    await harness.user.click(
      await prompt.findByRole('radio', { name: /family_edge/ }),
    );
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = promptsOf((await harness.submit())?.stageDocument ?? {})[0];
    expect(saved?.highlight).toEqual({
      variable: 'highlighted',
      allowHighlighting: false,
    });
    expect(saved?.edges).toEqual({
      create: 'family_edge',
      display: ['family_edge'],
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
    id: 'sociogram-prompt-1',
    text: 'Place the people who know each other close together',
    layout: { layoutVariable: 'layout' },
    edges: { create: 'knows', display: [] },
  };

  it('saves it exactly as it arrived', async () => {
    const harness = renderStageEditor(
      sociogramHolding(COLLECTS_WITHOUT_SHOWING),
    );

    const prompt = await openPrompt(harness);
    expect(
      prompt.getByRole('option', { name: /Create a connection/ }),
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
      create: 'knows',
      display: ['knows'],
    });
  });
});

/**
 * What tapping a node does, and what the prompt saves for it.
 *
 * `highlight.allowHighlighting` is the flag the interview gates tap-to-mark
 * on, and `highlight.variable` is read for the node's COLOUR whatever the flag
 * holds. So the two are different configurations, and one rule decides both
 * halves of this family: the FLAG says whether the prompt writes the
 * attribute, and the attribute alone never does.
 *
 * Enumerated rather than asserted case by case, because each of the three tap
 * choices has to be right against each of the three committed prompts — no
 * highlight at all, one that only colours, one that already marks — and the
 * two failures this replaces were each one cell of that table. A prompt sent
 * to "mark the node" and back kept the `true` written on the way in beside an
 * attribute the chooser had just cleared; and a colouring prompt switched to
 * marking escaped the writer-conflict check as an unchanged pick, because the
 * check read the attribute and not the flag.
 */
describe('what tapping a node does, against what the prompt already said', () => {
  const HIGHLIGHT_ATTRIBUTE = 'highlighted';

  const promptSaying = (
    highlight?: Record<string, unknown>,
  ): Record<string, unknown> => ({
    id: 'sociogram-prompt-1',
    text: 'Place the people who know each other close together',
    layout: { layoutVariable: 'layout' },
    ...(highlight === undefined ? {} : { highlight }),
  });

  const NOTHING = /Nothing/;
  const CREATE_EDGE = /Create a connection/;
  const MARK = /Mark the node/;

  type Case = Readonly<{
    /** What the protocol holds for this prompt's `highlight`. */
    committed?: Record<string, unknown>;
    /** Whether a form elsewhere collects the attribute, making it validated. */
    collected?: boolean;
    /** The tap choices the researcher makes, in order. */
    taps: readonly RegExp[];
    /** An attribute chosen while "mark the node" is the current choice. */
    marks?: string;
    /** An edge type chosen while "create a connection" is the current choice. */
    draws?: string;
    /** The prompt's `highlight` after the save, or a refusal instead. */
    expected: Record<string, unknown> | undefined | 'refused';
  }>;

  const cases: Readonly<Record<string, Case>> = {
    'a prompt with no highlight, marked': {
      taps: [MARK],
      marks: HIGHLIGHT_ATTRIBUTE,
      expected: { allowHighlighting: true, variable: HIGHLIGHT_ATTRIBUTE },
    },
    'a prompt with no highlight, marked and then left alone again': {
      taps: [MARK, NOTHING],
      expected: undefined,
    },
    'a prompt with no highlight, marked and then set to draw instead': {
      taps: [MARK, CREATE_EDGE],
      draws: 'family_edge',
      expected: undefined,
    },
    'a colouring prompt, opened and saved': {
      committed: { variable: HIGHLIGHT_ATTRIBUTE, allowHighlighting: false },
      taps: [],
      expected: { variable: HIGHLIGHT_ATTRIBUTE, allowHighlighting: false },
    },
    'a colouring prompt whose attribute a form collects, switched to marking': {
      committed: { variable: HIGHLIGHT_ATTRIBUTE, allowHighlighting: false },
      collected: true,
      taps: [MARK],
      expected: 'refused',
    },
    'a marking prompt whose attribute a form already collects, opened and saved':
      {
        committed: { variable: HIGHLIGHT_ATTRIBUTE, allowHighlighting: true },
        collected: true,
        taps: [],
        expected: { variable: HIGHLIGHT_ATTRIBUTE, allowHighlighting: true },
      },
    'a marking prompt, told to do nothing': {
      committed: { variable: HIGHLIGHT_ATTRIBUTE, allowHighlighting: true },
      taps: [NOTHING],
      expected: { allowHighlighting: false },
    },
  };

  it.each(Object.entries(cases))('%s', async (_name, scenario) => {
    const harness = renderStageEditor(
      sociogramHolding(promptSaying(scenario.committed)),
    );
    if (scenario.collected === true) {
      collectInAForm(harness, HIGHLIGHT_ATTRIBUTE);
    }

    const prompt = await openPrompt(harness);
    for (const tap of scenario.taps) {
      await harness.user.click(prompt.getByRole('option', { name: tap }));
      if (tap === MARK && scenario.marks !== undefined) {
        await harness.user.selectOptions(
          await prompt.findByRole('combobox', { name: 'Attribute marked' }),
          scenario.marks,
        );
      }
      if (tap === CREATE_EDGE && scenario.draws !== undefined) {
        await harness.user.click(
          await prompt.findByRole('radio', { name: scenario.draws }),
        );
      }
    }
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));

    if (scenario.expected === 'refused') {
      // The dialog staying open IS the refusal, and the reason is the one the
      // codebook editor gives for the same conflict.
      await prompt.findByText(
        readMessage(validatedElsewhereMessage(HIGHLIGHT_ATTRIBUTE)),
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      return;
    }

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    const saved = promptsOf((await harness.submit())?.stageDocument ?? {})[0];
    if (scenario.expected === undefined) {
      // Absent, not empty: an unanswered question saved as an answer is
      // content in the researcher's protocol that the researcher did not
      // write.
      expect(saved).not.toHaveProperty('highlight');
      return;
    }
    expect(saved?.highlight).toEqual(scenario.expected);
  });
});

/**
 * The attribute a prompt needs, created from inside the prompt's own dialog.
 *
 * Two dialogs are then open at once — the prompt's, and the editor for the
 * attribute — so the inner one is reached through the control it owns rather
 * than by asking for "the dialog": which of the two `getByRole` answers with
 * is not this test's to depend on.
 */
describe('creating an attribute a prompt needs without leaving the stage', () => {
  it('binds the prompt to the attribute the codebook now holds', async () => {
    const harness = renderStageEditor(openEditor());

    const prompt = await openPrompt(harness);
    await harness.user.click(
      prompt.getByRole('button', { name: 'Create a new position attribute' }),
    );
    const name = await screen.findByRole('textbox', {
      name: 'Attribute name',
    });
    const creator = within(name.closest('[role="dialog"]') as HTMLElement);
    await harness.user.type(name, 'second_canvas');
    await harness.user.click(
      creator.getByRole('button', { name: 'Create attribute' }),
    );

    await waitFor(() => {
      const person = harness.hostCodebook().node?.person;
      expect(
        Object.values(person?.variables ?? {}).some(
          (variable) => variable.name === 'second_canvas',
        ),
      ).toBe(true);
    });

    // Created and BOUND: the picker holds the new attribute, so the prompt the
    // researcher was writing is the one the attribute was created for.
    const created = Object.entries(
      harness.hostCodebook().node?.person?.variables ?? {},
    ).find(([, variable]) => variable.name === 'second_canvas')?.[0];
    await waitFor(() =>
      expect(
        prompt.getByRole('combobox', { name: 'Position attribute' }),
      ).toHaveValue(created),
    );
  });
});

/**
 * The stack of nodes the participant has not placed yet is handed to them in
 * an order, and `sociogramPromptSchema.sortOrder` is where a prompt says what
 * that order is. It is the one place in a sociogram a researcher can decide
 * who the participant is asked about first, so a stage that holds one and an
 * editor that cannot show it is an editor that quietly discards a decision.
 */
describe('the order a sociogram hands unplaced nodes over in', () => {
  const SORTED_PROMPT = {
    id: 'sociogram-prompt-1',
    text: 'Place the people who know each other close together',
    layout: { layoutVariable: 'layout' },
    sortOrder: [{ property: 'name', direction: 'asc' }],
  };

  const openWithSortOrder = () => sociogramHolding(SORTED_PROMPT);

  /**
   * An order the prompt already has opens switched ON, holding its rules.
   * Switched off it would look exactly like a prompt that never had one — and
   * closing a `Section` clears the fields inside it, so saving the prompt from
   * there would drop the rules without saying so.
   */
  it('opens a prompt’s sort order switched on, holding the rule it was saved with', async () => {
    const harness = renderStageEditor(openWithSortOrder());

    const prompt = await openPrompt(harness);
    expect(
      prompt.getByRole('switch', { name: 'Sort unplaced nodes' }),
    ).toBeChecked();
    expect(prompt.getByRole('combobox', { name: 'Property' })).toHaveValue(
      'name',
    );
    expect(prompt.getByRole('combobox', { name: 'Direction' })).toHaveValue(
      'asc',
    );
  });

  it('saves a rule the researcher added to a prompt that had none', async () => {
    const harness = renderStageEditor(openEditor());

    const prompt = await openPrompt(harness);
    await harness.user.click(
      prompt.getByRole('switch', { name: 'Sort unplaced nodes' }),
    );
    await harness.user.click(
      await prompt.findByRole('button', {
        name: 'Add a rule for the order unplaced nodes are handed over in',
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
      { property: 'age', direction: 'desc' },
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
   * A rule READS an attribute rather than writing one, so nothing this stage
   * collects is off limits to it — with one exception. A `layout` attribute
   * holds where a node sits on the canvas, which is a pair of coordinates
   * rather than a value one node can be ordered before another by; offering it
   * would let a researcher build a rule the interview cannot apply.
   *
   * Asserted as the whole list rather than as the absence of `layout` alone,
   * because the exclusion is a filter on the attribute's TYPE: one written
   * against the wrong key would take every attribute out with it, and an
   * absence-only claim would call that a pass.
   */
  it('offers every attribute of the type it collects as a sort key, except the one holding positions', async () => {
    const harness = renderStageEditor(openWithSortOrder());

    const prompt = await openPrompt(harness);

    const sortable = personVariables(harness)
      .filter(([, variable]) => variable.type !== 'layout')
      .map(([id]) => id);
    expect(sortable).toContain('name');
    expect(sortPropertyOptions(prompt)).toEqual(['*', ...sortable]);
  });

  /**
   * A rule whose attribute has been deleted still has to be readable, and
   * still has to be impossible to save as it stands.
   *
   * The cell renders from the option list, so an id no option carries leaves
   * the control blank — while the value behind it is still there and still
   * saved. The researcher then sees an empty required cell with no way to find
   * out what it points at, and the dangling reference outlives every attempt
   * to fix it.
   *
   * Both halves belong to `SortOrderRows`, not to this family: the sociogram
   * hands it the attributes and the words and nothing else. So this asserts
   * the wording the shared module owns rather than restating it — a literal
   * copy here would keep passing if the sociogram grew its own orphan
   * handling again. What such a copy could NOT do is refuse the save, which is
   * why the refusal is what this test ends on.
   */
  it('shows a sort rule the attribute has been deleted out from under', async () => {
    const ORPHANED_PROPERTY = 'nickname';
    const harness = renderStageEditor(
      sociogramHolding({
        ...SORTED_PROMPT,
        sortOrder: [{ property: ORPHANED_PROPERTY, direction: 'asc' }],
      }),
    );

    const prompt = await openPrompt(harness);

    const property = prompt.getByRole('combobox', { name: 'Property' });
    expect(property).toHaveValue(ORPHANED_PROPERTY);
    expect(
      within(property).getByRole('option', {
        name: missingSortPropertyLabel(ORPHANED_PROPERTY, enIntl),
      }),
    ).toBeDisabled();

    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));
    // Not "every row needs a value in each column": the row HAS a value in
    // each column, and the id it holds is the whole problem. Read back through
    // the same decode the render site uses, because the refusal travels as an
    // encoded descriptor on a plain-string contract.
    await prompt.findByText(readMessage(MISSING_SORT_PROPERTY_MESSAGE));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
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
        type: 'Sociogram' as const,
        fields: {
          label: 'Sociogram',
          subject: { entity: 'node', type: '' },
          prompts: [
            {
              ...SORTED_PROMPT,
              sortOrder: [{ property: 'nickname', direction: 'asc' }],
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
        name: missingSortPropertyLabel('nickname', enIntl),
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

  /**
   * Switching the group off is how a researcher says the stack has no order
   * they care about, and the schema spells that as no key at all rather than
   * an empty list.
   */
  it('drops the sort order when the researcher switches it off', async () => {
    const harness = renderStageEditor(openWithSortOrder());

    const prompt = await openPrompt(harness);
    await harness.user.click(
      prompt.getByRole('switch', { name: 'Sort unplaced nodes' }),
    );
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    expect(promptsOf(saved?.stageDocument ?? {})[0]).not.toHaveProperty(
      'sortOrder',
    );
  });
});
