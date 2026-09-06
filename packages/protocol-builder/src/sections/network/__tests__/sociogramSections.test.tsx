import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

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
 */
const deleteLayoutVariable = (harness: StageEditorHarness): void => {
  const protocolSections = harness.session.getSnapshot().protocolSections;
  const person = protocolSections[PERSON_SECTION];
  if (person === undefined) throw new Error('the fixture has no person type');
  const variables =
    typeof person.variables === 'object' && person.variables !== null
      ? (person.variables as Record<string, unknown>)
      : {};
  const { layout: _deleted, ...kept } = variables;
  const manifestRevision = { sequence: 7n, hash: 'revision-7' };

  act(() => {
    harness.session.receiveAuthoritativeUpdate({
      protocolSections: {
        ...protocolSections,
        [PERSON_SECTION]: { ...person, variables: kept },
      },
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

    const [first] = screen.getAllByRole('button', { name: 'Edit prompt' });
    await harness.user.click(first as HTMLElement);
    await harness.user.click(
      await screen.findByRole('option', { name: /Nothing/ }),
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
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

    const [first] = screen.getAllByRole('button', { name: 'Edit prompt' });
    await harness.user.click(first as HTMLElement);
    await harness.user.click(
      await screen.findByRole('option', { name: /Mark the node/ }),
    );
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Attribute marked' }),
      'highlighted',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
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

    const editButtons = screen.getAllByRole('button', { name: 'Edit prompt' });
    await harness.user.click(editButtons[1] as HTMLElement);
    await harness.user.click(
      await screen.findByRole('option', { name: /Create a connection/ }),
    );
    await harness.user.click(
      await screen.findByRole('radio', { name: /family_edge/ }),
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
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

    deleteLayoutVariable(harness);

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
        revision: { sequence: 7n, hash: 'revision-7' },
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

const openWithSortOrder = () => ({
  stage: {
    type: 'Sociogram' as const,
    fields: {
      label: 'Sociogram',
      subject: { entity: 'node', type: 'person' },
      background: { concentricCircles: 4, skewedTowardCenter: true },
      behaviours: { automaticLayout: true },
      prompts: [SORTED_PROMPT],
    },
  },
  sections,
});

const openPrompt = async (harness: StageEditorHarness): Promise<void> => {
  const [first] = screen.getAllByRole('button', { name: 'Edit prompt' });
  await harness.user.click(first as HTMLElement);
  await screen.findByRole('dialog');
};

/**
 * The attribute ids a sort rule is currently offering to order by.
 *
 * The placeholder is dropped: it is the cell's "nothing chosen yet" rather
 * than a property on offer, and counting it would let an empty list pass.
 */
const sortPropertyOptions = (): string[] =>
  [
    ...screen
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

describe('the order a sociogram hands unplaced nodes over in', () => {
  /**
   * An order the prompt already has opens switched ON, holding its rules.
   * Switched off it would look exactly like a prompt that never had one — and
   * closing a `Section` clears the fields inside it, so saving the prompt from
   * there would drop the rules without saying so.
   */
  it('opens a prompt’s sort order switched on, holding the rule it was saved with', async () => {
    const harness = renderStageEditor(openWithSortOrder());

    await openPrompt(harness);

    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Sort unplaced nodes' }),
      ).toBeChecked(),
    );
    expect(screen.getByRole('combobox', { name: 'Property' })).toHaveValue(
      'name',
    );
    expect(screen.getByRole('combobox', { name: 'Direction' })).toHaveValue(
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

    await openPrompt(harness);

    const sortable = personVariables(harness)
      .filter(([, variable]) => variable.type !== 'layout')
      .map(([id]) => id);
    expect(sortable).toContain('name');
    expect(sortPropertyOptions()).toEqual(['*', ...sortable]);
  });

  it('saves a rule the researcher added to a prompt that had none', async () => {
    const harness = renderStageEditor(openEditor());

    await openPrompt(harness);
    await harness.user.click(
      screen.getByRole('switch', { name: 'Sort unplaced nodes' }),
    );
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Add a rule for the order unplaced nodes are handed over in',
      }),
    );
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Property' }),
      'age',
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Direction' }),
      'desc',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(prompts(request?.stageDocument ?? {})[0]?.sortOrder).toEqual([
      { property: 'age', direction: 'desc' },
    ]);
  });

  /**
   * Opening a prompt and saving it is not a decision about its sort order, so
   * the order has to come back out of the dialog exactly as it went in.
   */
  it('keeps a sort order the researcher opened the prompt on and left alone', async () => {
    const harness = renderStageEditor(openWithSortOrder());

    await openPrompt(harness);
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    // Its own rules, and the layout attribute they are read against: a save
    // from the dialog rebuilds the row out of the fields it rendered, so both
    // are claims about what the dialog put back.
    const saved = prompts(request?.stageDocument ?? {})[0];
    expect(saved?.sortOrder).toEqual(SORTED_PROMPT.sortOrder);
    expect(saved?.layout).toEqual(SORTED_PROMPT.layout);
  });

  /**
   * Switching the group off is how a researcher says the stack has no order
   * they care about, and the schema spells that as no key at all rather than
   * an empty list.
   */
  it('drops the sort order when the researcher switches it off', async () => {
    const harness = renderStageEditor(openWithSortOrder());

    await openPrompt(harness);
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Sort unplaced nodes' }),
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(prompts(request?.stageDocument ?? {})[0]).not.toHaveProperty(
      'sortOrder',
    );
  });
});
