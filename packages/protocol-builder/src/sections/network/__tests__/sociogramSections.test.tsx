import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  MISSING_SORT_PROPERTY_MESSAGE,
  missingSortPropertyLabel,
} from '../../../fields/sortOrderOptions.ts';
import { validatedElsewhereMessage } from '../../../form/arrayFields/crossClassPick.ts';
import type { ManifestRevision } from '../../../session.ts';
import { enIntl, readMessage } from '../../../testing/i18n.ts';
import type { StageEditorHarness } from '../../../testing/renderStageEditor.tsx';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import AutomaticLayoutSection from '../AutomaticLayoutSection.tsx';
import BackgroundSection from '../BackgroundSection.tsx';
import SociogramPromptsSection from '../SociogramPromptsSection.tsx';

const sections = (
  <>
    <SociogramPromptsSection />
    <AutomaticLayoutSection />
    <BackgroundSection allowsImage />
  </>
);

const openEditor = () => ({ stageId: 'sociogram-1', sections });

const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });

const prompts = (stage: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(stage.prompts)
    ? stage.prompts.filter(
        (row): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

/**
 * Deletes the attribute every prompt positions its nodes with, as a
 * collaborator would — with the change attributed to them, in one authoritative
 * revision.
 *
 * The deletion reaches the HOST first, which issues that revision, and the
 * session is told about the result under it: one change to one protocol, seen
 * from both ends, the way `harness.receiveCodebookUpdate` seeds one. A helper
 * that told the session alone, under a number of its own, leaves the host
 * holding an attribute the researcher can no longer see — so a later compound
 * edit is refused as stale against a base the host does not recognise, and the
 * next arrival the host issues is older than what the session holds and is
 * dropped in silence.
 *
 * The host cannot carry the attribution, which is why this is not simply
 * `receiveCodebookUpdate`: whose change it was is the session's to record, and
 * it has to name the revision the protocol is actually at, so it is written
 * against the one the host just issued.
 */
const deleteLayoutVariable = (
  harness: StageEditorHarness,
): ManifestRevision => {
  const person = harness.host.getSnapshot().protocolSections[PERSON_SECTION];
  if (person === undefined) throw new Error('the fixture has no person type');
  const variables =
    typeof person.variables === 'object' && person.variables !== null
      ? (person.variables as Record<string, unknown>)
      : {};
  const { layout: _deleted, ...kept } = variables;
  const applied = harness.host.receiveAuthoritativeSections({
    [PERSON_SECTION]: { ...person, variables: kept },
  });
  const manifestRevision = applied.manifestRevision;

  act(() => {
    harness.session.receiveAuthoritativeUpdate({
      protocolSections: applied.protocolSections,
      manifestRevision,
      attribution: {
        [PERSON_SECTION]: {
          sessionId: 'other-tab',
          displayName: 'Dana',
          revision: manifestRevision,
        },
      },
    });
  });

  // Answered with the revision the HOST issued, so the test can name the one
  // the protocol is actually at rather than restating a number written here.
  // A literal expectation would go on passing if the deletion stopped reaching
  // the host at all.
  return manifestRevision;
};

describe('the tasks a sociogram sets', () => {
  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor(openEditor());

    // The stage's name and the type it arranges belong to sections this
    // mount does not include.
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

    const request = await harness.submit();
    expect(prompts(request?.stageDocument ?? {})[0]).toEqual({
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

    const request = await harness.submit();
    const first_ = prompts(request?.stageDocument ?? {})[0];
    expect(first_?.highlight).toEqual({
      allowHighlighting: true,
      variable: 'highlighted',
    });
    expect(first_?.edges).toEqual({ display: ['knows'] });
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

    const request = await harness.submit();
    expect(prompts(request?.stageDocument ?? {})[1]?.edges).toEqual({
      display: ['knows', 'family_edge'],
      create: 'family_edge',
    });
  });

  it('hands the arranging back to the participant', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      await screen.findByRole('option', { name: /Manual mode/ }),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.behaviours).toEqual({
      automaticLayout: false,
    });
  });

  /**
   * A stage cannot store positions in an attribute the codebook no longer has.
   * The editor has to say so as soon as the deletion arrives — and say WHOSE
   * change caused it, because nothing the researcher did to this stage did.
   */
  it('reports the deletion of its position attribute, and who made it', async () => {
    const harness = renderStageEditor(openEditor());
    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('valid'),
    );

    const deletion = deleteLayoutVariable(harness);

    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('invalid'),
    );
    const issues = harness.session.getSnapshot().validation.issues;
    const blamed = issues.filter(
      (issue) => issue.attributedChange !== undefined,
    );
    expect(blamed.length).toBeGreaterThan(0);
    expect(blamed[0]?.attributedChange).toEqual({
      sectionId: PERSON_SECTION,
      attribution: {
        sessionId: 'other-tab',
        displayName: 'Dana',
        // The revision the protocol is actually at, not a number this test
        // wrote down: that is what attribution is matched by, so an issue
        // naming any other one is blamed on a change nobody made.
        revision: deletion,
      },
    });
    expect(blamed.some((issue) => issue.path.includes('layoutVariable'))).toBe(
      true,
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
const SORTED_PROMPT = {
  id: 'sociogram-prompt-1',
  text: 'Place the people who know each other close together',
  layout: { layoutVariable: 'layout' },
  sortOrder: [{ property: 'name', direction: 'asc' }],
};

const sociogramHolding = (prompt: Record<string, unknown>) => ({
  stage: {
    type: 'Sociogram' as const,
    fields: {
      label: 'Sociogram',
      subject: { entity: 'node', type: 'person' },
      background: { concentricCircles: 4, skewedTowardCenter: true },
      behaviours: { automaticLayout: true },
      prompts: [prompt],
    },
  },
  sections,
});

const openWithSortOrder = () => sociogramHolding(SORTED_PROMPT);

/**
 * A sort rule left pointing at an attribute a collaborator has since deleted.
 *
 * `SortRuleSchema.property` is `existence: 'unchecked'`, so the protocol keeps
 * this stage rather than refusing it — which is right, because deleting an
 * attribute must not make somebody else's stage unopenable. The editor is
 * what has to say the reference is dangling.
 */
const ORPHANED_PROPERTY = 'nickname';

const openWithOrphanedSortRule = () =>
  sociogramHolding({
    ...SORTED_PROMPT,
    sortOrder: [{ property: ORPHANED_PROPERTY, direction: 'asc' }],
  });

/**
 * Opens one prompt's dialog and answers with the dialog itself.
 *
 * Every query inside a prompt editor is made through this, so a wait covers
 * ONE thing: the dialog arriving. A `findByRole('combobox')` at document level
 * would be waiting for the editor to boot AND the dialog to open AND that
 * control's own data, and a failure could not say which of the three did not
 * happen — nor could it tell a control inside the dialog from one of the same
 * name on the stage behind it.
 */
const openPrompt = async (
  harness: StageEditorHarness,
  index = 0,
): Promise<ReturnType<typeof within>> => {
  const editButtons = screen.getAllByRole('button', { name: 'Edit prompt' });
  await harness.user.click(editButtons[index] as HTMLElement);
  return within(await screen.findByRole('dialog'));
};

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

/** Every attribute of the type this sociogram collects, as the fixture holds it. */
const personVariables = (
  harness: StageEditorHarness,
): [string, { type?: unknown }][] => {
  const person = harness.session.getSnapshot().protocolSections[PERSON_SECTION];
  const variables = person?.variables;
  if (typeof variables !== 'object' || variables === null) {
    throw new Error('the fixture person type has no attributes');
  }
  return Object.entries(variables) as [string, { type?: unknown }][];
};

/**
 * A form somewhere else in the protocol, started while this dialog is open.
 *
 * The arrival is the collaborator's, through the host and back under the
 * revision it issued, exactly as `deleteLayoutVariable` above: a stage the
 * host does not hold is a base every later compound edit is refused against.
 */
const collectInAForm = (
  harness: StageEditorHarness,
  variableId: string,
): void => {
  const id = sectionId({ kind: 'stage', stageId: 'alter-form-1' });
  const stage = harness.host.getSnapshot().protocolSections[id];
  if (stage === undefined) throw new Error('the fixture has no alter form');
  const form = stage.form;
  const fields =
    typeof form === 'object' &&
    form !== null &&
    Array.isArray((form as Record<string, unknown>).fields)
      ? ((form as Record<string, unknown>).fields as unknown[])
      : [];
  const applied = harness.host.receiveAuthoritativeSections({
    [id]: {
      ...stage,
      form: {
        fields: [...fields, { variable: variableId, prompt: 'Is this so?' }],
      },
    },
  });
  act(() => {
    harness.session.receiveAuthoritativeUpdate({
      protocolSections: applied.protocolSections,
      manifestRevision: applied.manifestRevision,
      attribution: {
        [id]: {
          sessionId: 'other-tab',
          displayName: 'Dana',
          revision: applied.manifestRevision,
        },
      },
    });
  });
};

/**
 * Tapping a node WRITES the attribute it marks, without the codebook's
 * validation rules running — so a prompt may not mark one a form collects.
 *
 * The picker enforces that by never offering such an attribute, and the
 * codebook reaches this editor live: a collaborator adding the form field
 * while the dialog is open drops the attribute from the option list and leaves
 * the pick sitting in the form. Nothing then refused the row, so Save
 * committed a prompt the protocol reports as a writer conflict.
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
    harness: StageEditorHarness;
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
    const request = await harness.submit();
    expect(prompts(request?.stageDocument ?? {})[0]?.edges).toEqual({
      display: ['knows', LOST_EDGE],
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

    const request = await harness.submit();
    expect(prompts(request?.stageDocument ?? {})[0]?.edges).toEqual({
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
const DISPLAY_ONLY_PROMPT = {
  id: 'sociogram-prompt-1',
  text: 'Place the people who know each other close together',
  layout: { layoutVariable: 'layout' },
  highlight: { variable: 'highlighted', allowHighlighting: false },
};

describe('a prompt that only colours its nodes', () => {
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

    const request = await harness.submit();
    expect(prompts(request?.stageDocument ?? {})[0]).toEqual(
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

    const request = await harness.submit();
    const saved = prompts(request?.stageDocument ?? {})[0];
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

describe('the order a sociogram hands unplaced nodes over in', () => {
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
   * saved. The researcher then sees an empty required cell with no way to
   * find out what it points at, and the dangling reference outlives every
   * attempt to fix it.
   *
   * Both halves belong to `SortOrderRows`, not to this family: the sociogram
   * hands it the attributes and the words and nothing else. So this asserts
   * the wording the shared module owns rather than restating it — a literal
   * copy here would keep passing if the sociogram grew its own orphan
   * handling again, because a family's local labelling and the shared one
   * read identically. What such a copy could NOT do is refuse the save, which
   * is why the refusal is what this test ends on.
   */
  it('shows a sort rule the attribute has been deleted out from under', async () => {
    const harness = renderStageEditor(openWithOrphanedSortRule());

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
    // each column, and the id it holds is the whole problem.
    // Read back through the same decode the render site uses: the refusal
    // travels as an ENCODED descriptor on a plain-string contract, so the
    // words in the DOM are the formatted ones and searching for the encoding
    // would find nothing.
    await prompt.findByText(readMessage(MISSING_SORT_PROPERTY_MESSAGE));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  /**
   * And the other side of the same rule: a stage that has not been told what it
   * collects reports NO rule as dangling.
   *
   * `SortOrderRows` judges "no longer in the codebook" against the properties
   * the family hands it, and it tells two answers apart — an empty list is a
   * subject with nothing to sort by, where a rule certainly is dangling, and
   * `undefined` is a family that does not know yet. A sociogram whose subject
   * names no type is the second: there is no codebook to be missing from, and
   * answering `[]` would mark every rule the prompt holds as pointing at a
   * deleted attribute and refuse a save the researcher cannot fix — the type
   * they need to choose is in another section, and choosing it is what makes
   * the question answerable at all.
   *
   * Reachable because the prompts section opens on a subject that merely HAS a
   * `type`, while reading the codebook needs one that names a type the codebook
   * holds; a stage part-way through being told what it collects sits between
   * the two.
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
      sections,
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

    const request = await harness.submit();
    expect(prompts(request?.stageDocument ?? {})[0]?.sortOrder).toEqual([
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
   * about tapping came back saying it does not allow marking. An unanswered
   * question saved as an answer is content in the researcher's protocol that
   * the researcher did not write.
   */
  it('saves a prompt it opened and left alone exactly as it arrived', async () => {
    const harness = renderStageEditor(openWithSortOrder());

    const prompt = await openPrompt(harness);
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(prompts(request?.stageDocument ?? {})[0]).toEqual(SORTED_PROMPT);
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

    const request = await harness.submit();
    expect(prompts(request?.stageDocument ?? {})[0]).not.toHaveProperty(
      'sortOrder',
    );
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
const attributeCreator = async (): Promise<ReturnType<typeof within>> => {
  const name = await screen.findByRole('textbox', { name: 'Attribute name' });
  const dialog = name.closest('[role="dialog"]');
  if (dialog === null) {
    throw new Error('the attribute editor is not inside a dialog');
  }
  return within(dialog as HTMLElement);
};

/** Opens the position-attribute creator from inside the first prompt. */
const openAttributeCreator = async (
  harness: StageEditorHarness,
): Promise<ReturnType<typeof within>> => {
  const prompt = await openPrompt(harness);
  await harness.user.click(
    prompt.getByRole('button', { name: 'Create a new position attribute' }),
  );
  return attributeCreator();
};

/** The id the codebook now files an attribute of this name under. */
const personVariableIdByName = (
  harness: StageEditorHarness,
  name: string,
): string | undefined => {
  const person = harness.host.getSnapshot().protocolSections[PERSON_SECTION];
  const variables = person?.variables;
  if (typeof variables !== 'object' || variables === null) return undefined;
  return Object.entries(variables).find(
    ([, variable]) =>
      typeof variable === 'object' &&
      variable !== null &&
      Reflect.get(variable, 'name') === name,
  )?.[0];
};

describe('creating an attribute a prompt needs without leaving the stage', () => {
  /**
   * A lease taken back while the researcher is naming a new attribute.
   *
   * The name exists nowhere but this editor, so unmounting it to report the
   * lost lease throws the researcher's work away in order to say something the
   * editor says for itself once its own save is refused. The launch control
   * goes, because a create nobody may start is not on offer; the editor that
   * is already open stays, which is the rule the row dialog around
   * `AttributeCodebookControls` and the pedigree's `CreateVariableButton`
   * already follow.
   */
  it('keeps an open attribute draft when the lease is lost', async () => {
    const harness = renderStageEditor(openEditor());

    const creator = await openAttributeCreator(harness);
    await harness.user.type(
      creator.getByRole('textbox', { name: 'Attribute name' }),
      'seating',
    );

    harness.setReadOnly();

    await waitFor(() =>
      expect(
        screen.queryByRole('button', {
          name: 'Create a new position attribute',
        }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('textbox', { name: 'Attribute name' })).toHaveValue(
      'seating',
    );
    expect(
      screen.getByRole('button', { name: 'Create attribute' }),
    ).toBeDisabled();
  });

  /**
   * Holds the compound edit open, and hands back the release.
   *
   * The one window this dialog's guard is about: the host has the request and
   * has not answered, which is when a dismissal unmounts the editor and leaves
   * the answer with nobody to show it to.
   */
  const holdTheCompoundEdit = (harness: StageEditorHarness) => {
    const send = harness.session.requestCompoundEdit.bind(harness.session);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(harness.session, 'requestCompoundEdit').mockImplementation(
      async (request) => {
        await held;
        return send(request);
      },
    );
    return () => {
      release();
    };
  };

  /**
   * A refusal arriving after the dialog has gone is shown to nobody, and a
   * success arriving after it points the prompt at an attribute the researcher
   * watched no editor finish. The dialog therefore withholds every way out
   * until the host answers, exactly as the nested editors in
   * `AttributeCodebookControls` do.
   */
  it('withholds every way out until the codebook answers', async () => {
    const harness = renderStageEditor(openEditor());
    const release = holdTheCompoundEdit(harness);

    const creator = await openAttributeCreator(harness);
    await harness.user.type(
      creator.getByRole('textbox', { name: 'Attribute name' }),
      'seating',
    );
    await harness.user.click(
      creator.getByRole('button', { name: 'Create attribute' }),
    );

    // Escape and a press outside are the two routes left; the close button is
    // taken away rather than left on screen doing nothing.
    await harness.user.keyboard('{Escape}');
    expect(screen.getByRole('textbox', { name: 'Attribute name' })).toHaveValue(
      'seating',
    );
    expect(
      within(
        screen
          .getByRole('textbox', { name: 'Attribute name' })
          .closest('[role="dialog"]') as HTMLElement,
      ).queryAllByRole('button', { name: 'Close' }),
    ).toHaveLength(0);

    release();
    // And the answer lands on the surface that asked for it: the prompt now
    // positions its nodes with the attribute the codebook now holds.
    await waitFor(() =>
      expect(personVariableIdByName(harness, 'seating')).toEqual(
        expect.any(String),
      ),
    );
    const prompt = within(await screen.findByRole('dialog'));
    expect(
      prompt.getByRole('combobox', { name: 'Position attribute' }),
    ).toHaveValue(personVariableIdByName(harness, 'seating'));
  });
});
