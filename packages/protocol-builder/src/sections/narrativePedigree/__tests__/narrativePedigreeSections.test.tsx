import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import {
  fixtureProtocolSections,
  fixtureStageIds,
  loadFixtureStage,
  recordingTheFixtureDisease,
  sourcePedigreeDocument,
} from '../../../testing/protocolFixture.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import AtRiskStatusesSection from '../AtRiskStatusesSection.tsx';
import DiseasesSection from '../DiseasesSection.tsx';
import SourceStageSection from '../SourceStageSection.tsx';

const narrativePedigreeSections = (
  <>
    <SourceStageSection />
    <DiseasesSection />
    <AtRiskStatusesSection />
  </>
);

/**
 * The fixture narrative pedigree, with whatever the test needs replaced.
 *
 * Built from the fixture stage rather than from a hand-written one, so a test
 * still fails when the fixture and the schema disagree about what a narrative
 * pedigree holds.
 */
function narrativePedigreeStageWith(extra: SectionDoc): Readonly<{
  id: string;
  type: 'NarrativePedigree';
  fields: SectionDoc;
}> {
  const seeded = loadFixtureStage('narrative-pedigree-1');
  if (seeded.type !== 'NarrativePedigree') {
    throw new Error(
      'The fixture stage "narrative-pedigree-1" changed interface.',
    );
  }
  return {
    id: seeded.id,
    type: 'NarrativePedigree',
    fields: { ...seeded.fields, ...extra },
  };
}

const openFixture = () => ({
  stageId: 'narrative-pedigree-1',
  sections: narrativePedigreeSections,
});

/**
 * Chooses one option of a listbox select.
 *
 * The source stage and the inheritance pattern are rendered with the styled
 * select, which is a button and a listbox popup rather than a native control —
 * so a test drives it the way a researcher does, by opening it and choosing.
 */
async function chooseOption(
  harness: Readonly<{ user: { click(element: Element): Promise<void> } }>,
  name: string,
  optionLabel: string,
): Promise<void> {
  await harness.user.click(screen.getByRole('combobox', { name }));
  await harness.user.click(
    await screen.findByRole('option', { name: optionLabel }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument(),
  );
}

/** The attributes a picker is currently offering, by their ids. */
const optionsOf = (name: string): string[] =>
  [...screen.getByRole('combobox', { name }).querySelectorAll('option')]
    .map((option) => option.value)
    .filter((value) => value !== '');

/**
 * The source pedigree's node type as a collaborator has just left it.
 *
 * Read from the fixture's own definition rather than written out here, so a
 * test cannot quietly assert against a node type the protocol does not have.
 * `add` puts an attribute there that the fixture does not carry; `remove`
 * takes one away, which is how a collaborator's deletion arrives.
 */
function familyMemberCodebook(
  change: Readonly<{
    add?: Readonly<Record<string, SectionDoc>>;
    remove?: string;
  }>,
): SectionDoc {
  const definition =
    fixtureProtocolSections()[
      sectionId({ kind: 'codebookNode', typeId: 'family_member' })
    ];
  if (definition === undefined) {
    throw new Error('The fixture protocol has no "family_member" node type.');
  }
  const variables = definition.variables;
  if (typeof variables !== 'object' || variables === null) {
    throw new Error('The fixture "family_member" node type has no attributes.');
  }
  const next: Record<string, unknown> = { ...variables, ...change.add };
  if (change.remove !== undefined) delete next[change.remove];
  return { ...definition, variables: next };
}

const STAGE_ORDER_SECTION = sectionId({ kind: 'stageOrder' });

/**
 * The interview re-ordered, as an authoritative update.
 *
 * The change goes to the HOST, which issues the revision for it, and the
 * session is told about the result under that same revision — the route
 * `receiveCodebookUpdate` takes for the codebook, taken here for the one
 * section a move touches. Told to the session alone, under a number nobody
 * issued, every later compound edit is refused against a base the host does
 * not recognise.
 */
function reorderStages(
  harness: StageEditorHarness,
  reorder: (stages: string[]) => string[],
): void {
  const held = harness.host.getSnapshot().protocolSections;
  const order = held[STAGE_ORDER_SECTION]?.stages;
  const stages = Array.isArray(order)
    ? order.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const moved = reorder([...stages]);
  if (moved.length !== stages.length) {
    throw new Error('Re-ordering the interview must not add or drop a stage.');
  }
  const applied = harness.host.receiveAuthoritativeSections({
    [STAGE_ORDER_SECTION]: { stages: moved },
  });
  act(() => {
    harness.session.receiveAuthoritativeUpdate({
      protocolSections: applied.protocolSections,
      manifestRevision: applied.manifestRevision,
    });
  });
}

/**
 * The source pedigree replaced, as a collaborator's change arriving mid-edit.
 *
 * The same route `reorderStages` takes, for the one section a change to the
 * pedigree touches: the HOST issues the revision and the session is told about
 * the result under it, so a later compound edit is still judged against a base
 * the host recognises.
 */
function replaceSourcePedigree(
  harness: StageEditorHarness,
  pedigree: SectionDoc,
): void {
  const applied = harness.host.receiveAuthoritativeSections({
    [sectionId({ kind: 'stage', stageId: 'family-pedigree-1' })]: pedigree,
  });
  act(() => {
    harness.session.receiveAuthoritativeUpdate({
      protocolSections: applied.protocolSections,
      manifestRevision: applied.manifestRevision,
    });
  });
}

/** The fixture's only pedigree, moved to the end of the interview. */
const movePedigreeLast = (stages: string[]): string[] => [
  ...stages.filter((id) => id !== 'family-pedigree-1'),
  'family-pedigree-1',
];

/**
 * How the source control names the fixture's only pedigree.
 *
 * Every option carries the number the stage will have in the finished
 * interview, so two pedigrees a researcher gave one name can still be told
 * apart. Read off the fixture's own order rather than written down, because
 * the number is a fact about the fixture and not about this rule.
 *
 * One number, whatever this stage is: every pedigree this control offers runs
 * BEFORE the stage being edited, and a stage inserted after them does not move
 * them. The number is what the researcher matches against the timeline, so a
 * different one for a stage being created would point them at the wrong
 * pedigree.
 */
const fixturePedigreeOption = (): string =>
  `Stage ${fixtureStageIds().indexOf('family-pedigree-1') + 1} — Family Pedigree`;

/** What the confirmation before a source change offers as its answer. */
const CONFIRM_SOURCE_CHANGE = 'Change the pedigree';

/**
 * Chooses a source pedigree on a stage that has diseases to lose, and agrees
 * to losing them.
 *
 * Every disease names an attribute of the current pedigree's family members,
 * so a different pedigree leaves none of them usable and the reset that
 * follows the choice throws them all away. That is asked about first, which
 * means a test driving this stage answers the question the researcher is
 * asked rather than skipping it.
 */
async function chooseSourcePedigree(
  harness: StageEditorHarness,
  optionLabel: string,
): Promise<void> {
  await chooseOption(harness, 'Source stage', optionLabel);
  await harness.user.click(
    await screen.findByRole('button', { name: CONFIRM_SOURCE_CHANGE }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: CONFIRM_SOURCE_CHANGE }),
    ).not.toBeInTheDocument(),
  );
}

/** The pedigrees the source control is currently offering, by their labels. */
async function offeredSources(harness: StageEditorHarness): Promise<string[]> {
  await harness.user.click(
    screen.getByRole('combobox', { name: 'Source stage' }),
  );
  const listbox = await screen.findByRole('listbox');
  return [...listbox.querySelectorAll('[role="option"]')].map(
    (option) => option.textContent ?? '',
  );
}

const A_SECOND_BOOLEAN = {
  hasConditionY: { name: 'hasConditionY', type: 'boolean' },
} as const;

/** The same, recording the second boolean the codebook updates add too. */
const recordingBothConditions = {
  'family-pedigree-1': sourcePedigreeDocument({
    records: ['hasConditionX', 'hasConditionY'],
  }),
};

/**
 * The fixture narrative pedigree over a pedigree that RECORDS the disease it
 * maps.
 *
 * The fixture protocol's own Family Pedigree has no nomination prompts at all,
 * so the attribute its narrative pedigree draws is one nothing ever sets — a
 * stage the disease list now refuses to save, and rightly. Every test below
 * that asserts a save therefore states the source pedigree the stage would
 * need, rather than asserting a save the editor declines.
 */
const openRecordedFixture = () => ({
  ...openFixture(),
  otherStages: recordingTheFixtureDisease(),
});

describe('the pedigree a narrative pedigree draws', () => {
  it('opens on the stage as the protocol holds it', async () => {
    const harness = renderStageEditor(openFixture());

    expect(
      screen.getByRole('combobox', { name: 'Source stage' }),
    ).toHaveTextContent('Family Pedigree');
    expect(screen.getByText('Condition X')).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Show possible (at-risk) statuses' }),
    ).not.toBeChecked();
    await waitFor(() =>
      expect(harness.outline().map((section) => section.title)).toEqual([
        'Pedigree source',
        'Diseases',
        'At-risk statuses',
      ]),
    );
  });

  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor(openRecordedFixture());

    // The stage's name belongs to a section this mount does not include.
    await harness.roundTrip({ unowned: ['label'] });
  });

  it('saves an edit to every key it owns', async () => {
    const harness = renderStageEditor(openRecordedFixture());

    await harness.user.click(
      screen.getByRole('switch', { name: 'Show possible (at-risk) statuses' }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit disease' }),
    );
    // Scoped to the dialog: `screen` would compute an accessible name for
    // every control in the editor behind it to answer a question about one
    // inside it.
    const disease = within(await screen.findByRole('dialog'));
    const label = disease.getByRole('textbox', { name: 'Disease name' });
    await harness.user.clear(label);
    await harness.user.type(label, 'Huntington’s');
    await chooseOption(harness, 'Inheritance pattern', 'X-linked recessive');
    await harness.user.click(disease.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.showAtRiskStatuses).toBe(true);
    expect(request?.stageDocument.diseases).toEqual([
      {
        id: 'disease-1',
        label: 'Huntington’s',
        color: 'node-color-seq-1',
        variable: 'hasConditionX',
        inheritancePattern: 'xLinkedRecessive',
      },
    ]);
  });

  it('refuses to save a narrative pedigree that marks nothing', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.user.click(
      screen.getByRole('button', { name: 'Remove disease' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove disease' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Condition X')).not.toBeInTheDocument(),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        'Add at least one disease. A narrative pedigree with none shows the participant an unmarked family.',
      ),
    ).toBeInTheDocument();
  });

  it('leaves nothing pending when the researcher cancels', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.user.click(
      screen.getByRole('switch', { name: 'Show possible (at-risk) statuses' }),
    );
    await harness.cancel();

    expect(harness.pendingCommands()).toEqual([]);
  });
});

/**
 * A stage being created is not in the interview's order, so where it runs is
 * something only the host knows — and it says so when it opens the session.
 * The pedigrees this stage may read are the ones that will run BEFORE it once
 * it exists, which for a stage inserted at the top of an interview is none of
 * them: read as arriving last instead, a new first stage was offered every
 * pedigree in the interview, including the ones the participant would not
 * reach until after it.
 */
describe('a narrative pedigree the host is creating', () => {
  const createAt = (position: number) => ({
    create: { type: 'NarrativePedigree' as const, position },
    sections: narrativePedigreeSections,
  });

  it('offers no pedigree the participant has not reached yet', () => {
    renderStageEditor(createAt(0));

    // The control stays on screen with nothing in it, beside the alert saying
    // why: it is what the outline reads this section's state from, and what
    // the researcher comes back to once a pedigree runs before this stage.
    expect(
      screen.getByRole('combobox', { name: 'Source stage' }),
    ).toBeDisabled();
    expect(screen.getByText('No pedigree to read')).toBeInTheDocument();
  });

  /**
   * Numbered as the timeline already numbers them, because a stage appended
   * after them moves none of them. Shifting every offered pedigree by one
   * called the fixture's "Stage 3" pedigree "Stage 4", which is the wrong
   * stage to point a researcher at — and pointing at the right one is the
   * whole reason the number is there.
   */
  it('offers the pedigrees it will run after, numbered as they run', async () => {
    const harness = renderStageEditor(createAt(fixtureStageIds().length));

    expect(await offeredSources(harness)).toEqual([fixturePedigreeOption()]);
  });

  /**
   * The empty state is not a finished section. `ProtocolField` is also what
   * registers a field with the outline, so a section that renders the alert
   * INSTEAD of the control has registered nothing — and a section with no
   * fields and no issues reads as "Finished", which is the one thing this
   * stage is not: it cannot be saved until a pedigree runs before it.
   */
  it('reports the source it still needs as unfinished', async () => {
    const harness = renderStageEditor(createAt(0));

    await waitFor(() =>
      expect(
        harness.outline().find((section) => section.title === 'Pedigree source')
          ?.state,
      ).toBe('Not finished'),
    );
    expect(await harness.submit()).toBeNull();
  });

  /**
   * Read from the fixture's own order rather than written down, so a fixture
   * that grows a stage above the pedigree does not quietly turn this into the
   * case above.
   */
  it('counts a pedigree it displaces as running after it', () => {
    renderStageEditor(createAt(fixtureStageIds().indexOf('family-pedigree-1')));

    expect(
      screen.getByRole('combobox', { name: 'Source stage' }),
    ).toBeDisabled();
    expect(screen.getByText('No pedigree to read')).toBeInTheDocument();
  });
});

/**
 * A source that has been deleted, re-typed or moved below this stage is not a
 * notice to read past: the stage cannot run, so the save has to stop.
 *
 * The moved case is the one nothing else catches. A pedigree that has been
 * moved still resolves a node type, so every disease mapping beside it still
 * validates and the whole stage saved happily with an order the interview
 * cannot execute — the participant would be shown a family they have not
 * built yet.
 */
describe('saving a narrative pedigree whose source cannot be used', () => {
  const openFixtureStage = () =>
    renderStageEditor({
      stage: narrativePedigreeStageWith({}),
      sections: narrativePedigreeSections,
      // See `openRecordedFixture`: the fixture's own pedigree records nothing,
      // and one of these claims is that the stage saves once the pedigree is
      // back before it.
      otherStages: recordingTheFixtureDisease(),
    });

  it('refuses a source that now runs after this stage', async () => {
    const harness = openFixtureStage();

    reorderStages(harness, movePedigreeLast);

    expect(
      await screen.findByText(
        'The Family Pedigree stage this one reads now runs after it, so the family would still be empty. Move it earlier in the interview, or choose a pedigree that runs before this stage.',
      ),
    ).toBeInTheDocument();
    expect(await harness.submit()).toBeNull();
  });

  /**
   * The same refusal for a stage the schema itself refuses.
   *
   * A narrative pedigree an import left with no diseases is one
   * `protocolContextFromSections` cannot read, so it is absent from
   * `orderedStages` — and read from that list alone it looked like a stage the
   * interview does not hold at all, placed as a new one arriving last. Every
   * pedigree was then offered to it, the one that now runs AFTER it included,
   * with nothing said. The interview's own order still names it, and that is
   * where it runs.
   */
  it('refuses a later source on a stage the schema cannot read', async () => {
    const harness = renderStageEditor({
      stage: narrativePedigreeStageWith({ diseases: [] }),
      sections: narrativePedigreeSections,
    });

    reorderStages(harness, movePedigreeLast);

    expect(
      await screen.findByText(
        'The Family Pedigree stage this one reads now runs after it, so the family would still be empty. Move it earlier in the interview, or choose a pedigree that runs before this stage.',
      ),
    ).toBeInTheDocument();
  });

  it('refuses a source that has left the interview', async () => {
    const harness = renderStageEditor({
      stage: narrativePedigreeStageWith({
        sourceStageId: 'a-pedigree-that-was-deleted',
      }),
      sections: narrativePedigreeSections,
    });

    expect(await harness.submit()).toBeNull();
  });

  it('saves again once the pedigree is moved back before it', async () => {
    const harness = openFixtureStage();
    reorderStages(harness, movePedigreeLast);
    expect(await harness.submit()).toBeNull();

    reorderStages(harness, (stages) => [
      'family-pedigree-1',
      ...stages.filter((id) => id !== 'family-pedigree-1'),
    ]);

    await waitFor(() =>
      expect(screen.queryByText(/now runs after it/)).not.toBeInTheDocument(),
    );
    expect(await harness.submit()).not.toBeNull();
  });
});

/**
 * A disease row is edited through a dialog of its own, and the two rules that
 * decide whether it may be saved are asked of the LIVE rows: one attribute per
 * disease, and one name per disease.
 */
describe('the diseases a narrative pedigree defines', () => {
  it('never offers an attribute the source pedigree derives', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit disease' }),
    );
    await screen.findByRole('combobox', {
      name: 'Affected-status attribute',
    });
    // `is_ego` is the source pedigree's participant marker: mapping it as a
    // disease would paint the participant as affected in every interview.
    expect(optionsOf('Affected-status attribute')).toEqual(['hasConditionX']);
  });

  it('refuses a second disease that reuses a name', async () => {
    const harness = renderStageEditor({
      ...openFixture(),
      otherStages: recordingBothConditions,
    });
    harness.receiveCodebookUpdate({
      node: { family_member: familyMemberCodebook({ add: A_SECOND_BOOLEAN }) },
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new disease' }),
    );
    const disease = within(await screen.findByRole('dialog'));
    await harness.user.type(
      disease.getByRole('textbox', { name: 'Disease name' }),
      'condition x ',
    );
    await harness.user.selectOptions(
      disease.getByRole('combobox', { name: 'Color' }),
      'node-color-seq-2',
    );
    await harness.user.selectOptions(
      disease.getByRole('combobox', { name: 'Affected-status attribute' }),
      'hasConditionY',
    );
    await chooseOption(harness, 'Inheritance pattern', 'Autosomal recessive');
    await harness.user.click(disease.getByRole('button', { name: 'Add' }));

    // Compared by the schema's own key — trimmed and case-folded — so a name
    // this editor accepts is one the saved protocol is still valid under.
    expect(
      await screen.findByText(
        'Another disease already uses this name. Give this one a name participants can tell apart.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('never offers an attribute a sibling disease already maps', async () => {
    const harness = renderStageEditor({
      ...openFixture(),
      otherStages: recordingBothConditions,
    });
    harness.receiveCodebookUpdate({
      node: { family_member: familyMemberCodebook({ add: A_SECOND_BOOLEAN }) },
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new disease' }),
    );
    await screen.findByRole('combobox', {
      name: 'Affected-status attribute',
    });

    expect(optionsOf('Affected-status attribute')).toEqual(['hasConditionY']);
  });

  /**
   * A disease mapping writes its attribute from the pedigree, unvalidated, so
   * it may not take one a form elsewhere collects — the mapping would bypass
   * that form field's validation, and the saved protocol carries a role
   * conflict the schema reports.
   */
  it('never offers an attribute a form elsewhere collects', async () => {
    const harness = renderStageEditor({
      stage: narrativePedigreeStageWith({ diseases: [] }),
      sections: narrativePedigreeSections,
      // The pedigree both nominates `hasConditionX` and collects it through a
      // form field — a protocol a merge or an import can produce, and the one
      // arrangement in which the form rule is the ONLY thing keeping the
      // attribute off the list. Given a source that merely fails to nominate
      // it, this test would pass with the form rule deleted.
      otherStages: {
        'family-pedigree-1': sourcePedigreeDocument({
          records: ['hasConditionX', 'hasConditionY'],
          collects: 'hasConditionX',
        }),
      },
    });
    harness.receiveCodebookUpdate({
      node: { family_member: familyMemberCodebook({ add: A_SECOND_BOOLEAN }) },
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new disease' }),
    );
    await screen.findByRole('combobox', {
      name: 'Affected-status attribute',
    });

    expect(optionsOf('Affected-status attribute')).toEqual(['hasConditionY']);
  });

  /**
   * The same rule, from the other side. An attribute this row ALREADY maps
   * stays on offer and stays saveable however the protocol came to hold it:
   * the conflict is not one this edit introduced, and a row that will not
   * close is a researcher who cannot rename their own disease.
   *
   * The escape is anchored to the row's COMMITTED attribute, found by the
   * row's id — anchored to the row's position instead, a reordered or deleted
   * sibling would move the anchor and refuse an untouched pick.
   */
  it('keeps a mapping the protocol already holds saveable', async () => {
    const harness = renderStageEditor({
      stageId: 'narrative-pedigree-1',
      sections: narrativePedigreeSections,
      otherStages: {
        'family-pedigree-1': sourcePedigreeDocument({
          collects: 'hasConditionX',
        }),
      },
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit disease' }),
    );
    const disease = within(await screen.findByRole('dialog'));
    expect(optionsOf('Affected-status attribute')).toEqual(['hasConditionX']);
    const label = disease.getByRole('textbox', { name: 'Disease name' });
    await harness.user.clear(label);
    await harness.user.type(label, 'Condition Z');
    await harness.user.click(disease.getByRole('button', { name: 'Save' }));

    // The dialog closing IS the acceptance: a refused pick keeps it open with
    // the refusal under the picker.
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(await screen.findByText('Condition Z')).toBeInTheDocument();
  });

  /**
   * The defect this rule exists for. A Family Pedigree writes a family
   * member's disease boolean in one place only — a nomination prompt, where the
   * participant is asked who a question applies to and everyone they name is
   * marked. An attribute no nomination prompt records is therefore never `true`,
   * and the genetics engine treats only an explicit `true` as affected: a
   * disease mapped to one draws an unmarked family in every interview, and
   * nothing — not the schema, not the editor — says so.
   *
   * So the picker offers what the source pedigree RECORDS, and the dialog
   * carries no create-an-attribute affordance: an attribute created from here
   * is by definition one nothing collects. The empty message is what sends the
   * researcher to the place it can come from.
   */
  it('offers nothing, and no way to create one, when the pedigree records nothing', async () => {
    const harness = renderStageEditor({
      stage: narrativePedigreeStageWith({ diseases: [] }),
      sections: narrativePedigreeSections,
    });
    harness.receiveCodebookUpdate({
      node: { family_member: familyMemberCodebook({ add: A_SECOND_BOOLEAN }) },
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new disease' }),
    );
    const disease = within(await screen.findByRole('dialog'));

    expect(
      disease.queryByRole('combobox', { name: 'Affected-status attribute' }),
    ).not.toBeInTheDocument();
    expect(
      disease.getByText(
        'The source pedigree does not record who is affected by anything yet. Add a nomination prompt to it asking who has this condition, and it can be mapped here.',
      ),
    ).toBeInTheDocument();
    expect(
      disease.queryByRole('button', { name: /Create.*attribute/ }),
    ).not.toBeInTheDocument();
  });

  /**
   * The save gate says the same thing as the picker, for the row the picker
   * never judged: the nomination prompt recording this attribute was removed
   * while the dialog was open, so the pick is one nothing collects by the time
   * it is saved. Its own committed attribute still escapes — that is the test
   * above this one.
   */
  it('refuses a mapping the pedigree stopped recording while the dialog was open', async () => {
    const harness = renderStageEditor({
      stage: narrativePedigreeStageWith({ diseases: [] }),
      sections: narrativePedigreeSections,
      otherStages: recordingBothConditions,
    });
    harness.receiveCodebookUpdate({
      node: { family_member: familyMemberCodebook({ add: A_SECOND_BOOLEAN }) },
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new disease' }),
    );
    const disease = within(await screen.findByRole('dialog'));
    await harness.user.type(
      disease.getByRole('textbox', { name: 'Disease name' }),
      'Condition Y',
    );
    await harness.user.selectOptions(
      disease.getByRole('combobox', { name: 'Color' }),
      'node-color-seq-2',
    );
    await harness.user.selectOptions(
      disease.getByRole('combobox', { name: 'Affected-status attribute' }),
      'hasConditionY',
    );
    await chooseOption(harness, 'Inheritance pattern', 'Autosomal recessive');

    replaceSourcePedigree(
      harness,
      sourcePedigreeDocument({ records: ['hasConditionX'] }),
    );
    await harness.user.click(disease.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText(
        'Nothing records this attribute, so nobody would be marked with it. Add a nomination prompt to the source pedigree asking who has this condition, then map it here.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

/**
 * A disease only READS: the Family Pedigree writes a family member's disease
 * boolean in exactly one place, a nomination prompt of the source pedigree.
 * An attribute no prompt of it records is therefore never `true`, and the
 * genetics engine treats only an explicit `true` as affected — so a disease
 * mapped to one draws an unmarked family in every interview, with nothing in
 * the protocol schema to say so.
 *
 * The picker keeps such an attribute off the list and `onBeforeSave` refuses a
 * pick that stops qualifying while the dialog is open. Neither sees a row that
 * is already there: `onBeforeSave` runs only when a row dialog is saved, and
 * it lets the row's own committed attribute through. So the LIST has to state
 * the rule as well — for the row a collaborator invalidated while this editor
 * sat untouched, and for the row an import brought in.
 */
describe('a disease the source pedigree stopped recording', () => {
  it('refuses the save and names the disease', async () => {
    const harness = renderStageEditor(openRecordedFixture());
    expect(
      screen.queryByText('Nothing records this attribute'),
    ).not.toBeInTheDocument();

    // The collaborator's pedigree records nothing at all, which is the shape
    // the fixture's own pedigree has: the prompt behind this disease is gone.
    replaceSourcePedigree(harness, sourcePedigreeDocument({}));

    // The section is reported as having a problem straight away — that is what
    // the re-run validation is for — and the researcher reads the sentence
    // under the list when they try to save.
    await waitFor(() =>
      expect(
        harness.outline().find((section) => section.title === 'Diseases')
          ?.state,
      ).toBe('Has a problem'),
    );
    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        'Condition X maps an attribute the source pedigree does not record, so nobody in the family would be marked with it. Add a nomination prompt to that pedigree asking who has it, or remove the disease.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * The refusal names the rows; the row is where the researcher acts. The
   * badge is on screen the moment the prompt goes, rather than at the next
   * submit.
   */
  it('marks the row it is about', async () => {
    const harness = renderStageEditor(openRecordedFixture());

    replaceSourcePedigree(harness, sourcePedigreeDocument({}));

    expect(
      await screen.findByText('Nothing records this attribute'),
    ).toBeInTheDocument();
  });

  /** And it lets go again once the pedigree records the attribute anew. */
  it('saves again once the pedigree records it again', async () => {
    const harness = renderStageEditor(openRecordedFixture());
    replaceSourcePedigree(harness, sourcePedigreeDocument({}));
    expect(await harness.submit()).toBeNull();

    replaceSourcePedigree(
      harness,
      sourcePedigreeDocument({ records: ['hasConditionX'] }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText('Nothing records this attribute'),
      ).not.toBeInTheDocument(),
    );
    expect(await harness.submit()).not.toBeNull();
  });
});

/**
 * The source stage is a reference to something a collaborator can move,
 * re-type or delete while this editor is open. None of that may throw: the
 * editor keeps showing the stored choice and says what is wrong with it.
 */
describe('a source stage that is no longer usable', () => {
  const withMissingSource = () => ({
    stage: narrativePedigreeStageWith({
      sourceStageId: 'a-pedigree-that-was-deleted',
    }),
    sections: narrativePedigreeSections,
  });

  it('says what is wrong instead of failing to render', () => {
    renderStageEditor(withMissingSource());

    expect(
      screen.getByText(
        'The Family Pedigree stage this one reads is no longer part of the interview. Choose another one, or restore it, before this stage can be saved.',
      ),
    ).toBeInTheDocument();
    // The stored choice is still shown as the current one: blanking the
    // control would hide the very reference the researcher has to resolve.
    expect(
      screen.getByRole('combobox', { name: 'Source stage' }),
    ).toHaveTextContent('a-pedigree-that-was-deleted');
  });

  /**
   * The reset is destructive and a listbox option is one click away, so the
   * researcher is asked first.
   *
   * Undo is not an answer to this: it is a way back from a change the
   * researcher meant to make, and what this prevents is the one they did not —
   * a stray choice taking every disease with it, with nothing said, and
   * choosing the old pedigree again bringing none of them back. The question
   * is the same seam the pedigree's own type chips ask through
   * (`useEntityTypeChangeConfirmation`), asked of the very field the reset
   * discards.
   */
  it('asks before a different source discards the diseases', async () => {
    const harness = renderStageEditor(withMissingSource());

    await chooseOption(harness, 'Source stage', fixturePedigreeOption());

    expect(
      await screen.findByText('This will remove every disease'),
    ).toBeInTheDocument();
    // Nothing has moved while the question stands: the choice is held back
    // rather than made and offered back.
    expect(harness.session.getSnapshot().editedSection.fields).toMatchObject({
      sourceStageId: 'a-pedigree-that-was-deleted',
      diseases: [{ id: 'disease-1', label: 'Condition X' }],
    });
    expect(harness.pendingCommands()).toEqual([]);
  });

  it('leaves the stage exactly as it was when the researcher says no', async () => {
    const harness = renderStageEditor(withMissingSource());

    await chooseOption(harness, 'Source stage', fixturePedigreeOption());
    await harness.user.click(
      await screen.findByRole('button', { name: 'Cancel' }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: CONFIRM_SOURCE_CHANGE }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Condition X')).toBeInTheDocument();
    // The control is back on the stored choice too, rather than showing a
    // pedigree the stage does not read.
    expect(
      screen.getByRole('combobox', { name: 'Source stage' }),
    ).toHaveTextContent('a-pedigree-that-was-deleted');
    expect(harness.pendingCommands()).toEqual([]);
  });

  /**
   * The question is awaited, and the interview does not hold still while it
   * stands.
   *
   * What resumes when the researcher answers is a closure from the render that
   * asked, holding the pedigree they picked — while a collaborator can delete
   * it, re-type it, or move it below this stage. Applied anyway, the answer
   * costs them every disease the question warned about AND leaves the stage
   * pointing at a pedigree it may not read: the control's own latest render
   * has already stopped offering it. The same live-read-at-write family the
   * shared confirm reads the codebook back through.
   */
  it('refuses a confirmed source the interview has moved in the meantime', async () => {
    const harness = renderStageEditor(withMissingSource());

    await chooseOption(harness, 'Source stage', fixturePedigreeOption());
    await screen.findByRole('button', { name: CONFIRM_SOURCE_CHANGE });
    // The collaborator's move, arriving while the question stands: the
    // pedigree now runs after this stage, so it is not one this stage may
    // read and the control has stopped offering it.
    reorderStages(harness, movePedigreeLast);
    await harness.user.click(
      screen.getByRole('button', { name: CONFIRM_SOURCE_CHANGE }),
    );

    // The stage is as it was: the choice was not applied, and nothing it was
    // carrying was thrown away for it.
    await waitFor(() =>
      expect(harness.session.getSnapshot().editedSection.fields).toMatchObject({
        sourceStageId: 'a-pedigree-that-was-deleted',
        diseases: [{ id: 'disease-1', label: 'Condition X' }],
      }),
    );
    expect(screen.getByText('Condition X')).toBeInTheDocument();
    expect(harness.pendingCommands()).toEqual([]);
    // And the researcher is told what did not happen, rather than left to
    // notice that their answer did nothing.
    expect(
      await screen.findByText(
        'What you chose is no longer one of the options here, so nothing has changed. Choose again.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * Every disease names an attribute of the source pedigree's node type, so a
   * different source invalidates all of them at once. They go rather than
   * being left to fail validation later, and they go as the loss of a whole
   * key — absence is how the schema spells "not configured".
   *
   * The choice that caused the loss has to survive it. The removal is a write
   * to the same draft the form is showing, and a write the shell cannot tell
   * from a draft arriving from elsewhere is written back over every control —
   * putting the source select back to the stage the researcher just left.
   */
  it('drops the diseases that described it when another source is chosen', async () => {
    const harness = renderStageEditor(withMissingSource());

    await chooseSourcePedigree(harness, fixturePedigreeOption());

    await waitFor(() =>
      expect(screen.queryByText('Condition X')).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('combobox', { name: 'Source stage' }),
    ).toHaveTextContent('Family Pedigree');
    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        'Add at least one disease. A narrative pedigree with none shows the participant an unmarked family.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * A stage created from the template carries `diseases: []`, which the
   * reset removes like any other value the path holds — so this is the case
   * where the draft moves under the form at the very moment the researcher is
   * choosing. It has to be the form's own move and be recognised as one, or
   * the re-seed writes the choice back to the source they just left.
   */
  it('keeps the first source chosen on a stage that has mapped nothing', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'narrative-pedigree-new',
        type: 'NarrativePedigree',
        fields: getInterfaceTemplate('NarrativePedigree'),
      },
      sections: narrativePedigreeSections,
    });

    await chooseOption(harness, 'Source stage', fixturePedigreeOption());

    // Nothing was asked: a stage with no disease has nothing to lose, and a
    // question about nothing is one a researcher learns to dismiss unread.
    expect(
      screen.queryByRole('button', { name: CONFIRM_SOURCE_CHANGE }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Source stage' }),
    ).toHaveTextContent('Family Pedigree');
    // And the section it unlocks is asking, rather than still waiting.
    await waitFor(() =>
      expect(
        harness.outline().find((section) => section.title === 'Diseases')
          ?.state,
      ).not.toBe('Not available yet'),
    );
  });

  /**
   * The first REAL choice is a choice like any other.
   *
   * A stage whose source is absent — a hand edit, a merge, an import that
   * dropped the key — still carries the diseases that described whatever it
   * used to read, and they name attributes of a node type the new pedigree may
   * not have. `useOnResearcherChange` is the one place the rule is stated: the
   * first OBSERVATION is not a change, and every reading after it is, the
   * transition out of `undefined` included. Reading that first choice as
   * another initial observation instead kept the stale rows, and they went to
   * the host with the save.
   */
  it('drops the diseases beside a source that had never been set', async () => {
    const seeded = loadFixtureStage('narrative-pedigree-1');
    const { sourceStageId: _neverSet, ...withoutSource } = seeded.fields;
    const harness = renderStageEditor({
      stage: {
        id: seeded.id,
        type: 'NarrativePedigree',
        fields: withoutSource,
      },
      sections: narrativePedigreeSections,
    });
    expect(screen.getByText('Condition X')).toBeInTheDocument();

    await chooseSourcePedigree(harness, fixturePedigreeOption());

    await waitFor(() =>
      expect(screen.queryByText('Condition X')).not.toBeInTheDocument(),
    );
    expect(
      harness.pendingCommands().flatMap((batch) => [...batch.commands]),
    ).toEqual([
      { op: 'set', key: 'sourceStageId', value: 'family-pedigree-1' },
      { op: 'unset', key: 'diseases' },
    ]);
  });

  it('waits for a source before asking about diseases', async () => {
    const harness = renderStageEditor(withMissingSource());

    await waitFor(() =>
      expect(
        harness.outline().find((section) => section.title === 'Diseases')
          ?.state,
      ).toBe('Not available yet'),
    );
  });
});

/**
 * The source pedigree's attributes are read from the editor's own protocol
 * context, so a collaborator's change to them appears here without this
 * section doing anything — and, above all, without it writing that change back
 * as if this session had made it.
 */
describe('a source pedigree that changes while this stage is open', () => {
  it('reruns validation against the arriving codebook, and says whose change it was', async () => {
    const harness = renderStageEditor(openFixture());
    expect(harness.pendingCommands()).toEqual([]);
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    // The attribute this stage's only disease maps has been deleted by
    // someone else.
    harness.receiveCodebookUpdate({
      node: {
        family_member: familyMemberCodebook({ remove: 'hasConditionX' }),
      },
    });

    await waitFor(() => {
      const { validation, attribution } = harness.session.getSnapshot();
      expect(validation.status).not.toBe('valid');
      expect(attribution).toBeDefined();
    });
    // Someone else's change is not this session's edit, and echoing it back
    // would save it as ours.
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
  });
});

/**
 * The reset a source change causes is a decision the SESSION holds, not a
 * clear the form makes on its own.
 *
 * `useDiscardStageValues` is the one seam that decision goes through, and it
 * makes it ONE batch: the chosen pedigree first, the diseases it invalidated
 * after it. Each part of that is a claim below, because a form-only clear
 * looks identical on screen and differs only in what the next edit is resolved
 * against and in what an undo can bring back.
 */
describe('the batch a source change makes', () => {
  const withMissingSource = () => ({
    stage: narrativePedigreeStageWith({
      sourceStageId: 'a-pedigree-that-was-deleted',
    }),
    sections: narrativePedigreeSections,
    // The pedigree these tests switch TO records the attribute the disease
    // they then describe is mapped to; without a nomination prompt recording it,
    // that attribute is one the picker rightly never offers.
    otherStages: recordingTheFixtureDisease(),
  });

  const draftOf = (harness: StageEditorHarness) =>
    harness.session.getSnapshot().editedSection.fields;

  /**
   * The source travels with the clears because it is an ordinary field, which
   * otherwise waits for the submit that flushes it: sent alone, the clears
   * would reach a host applying this session's edits live as a stage still
   * naming the OLD pedigree with none of the diseases that described it, which
   * is a stage nobody authored.
   */
  it('carries the chosen pedigree and the diseases it invalidated together', async () => {
    const harness = renderStageEditor(withMissingSource());

    await chooseSourcePedigree(harness, fixturePedigreeOption());

    await waitFor(() => expect(harness.pendingCommands()).toHaveLength(1));
    expect(
      harness.pendingCommands().flatMap((batch) => [...batch.commands]),
    ).toEqual([
      { op: 'set', key: 'sourceStageId', value: 'family-pedigree-1' },
      { op: 'unset', key: 'diseases' },
    ]);
  });

  /**
   * The defect a form-only clear leaves behind. A bound list resolves every
   * insertion against the draft the SESSION holds, so rows the session was
   * never told about are still there to be resolved against — and the next
   * disease the researcher describes arrives beside one about the pedigree
   * they just left.
   */
  it('does not bring the old diseases back with the next one added', async () => {
    const harness = renderStageEditor(withMissingSource());
    await chooseSourcePedigree(harness, fixturePedigreeOption());
    await waitFor(() =>
      expect(screen.queryByText('Condition X')).not.toBeInTheDocument(),
    );

    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new disease' }),
    );
    const disease = within(await screen.findByRole('dialog'));
    await harness.user.type(
      disease.getByRole('textbox', { name: 'Disease name' }),
      'Cystic fibrosis',
    );
    await harness.user.selectOptions(
      disease.getByRole('combobox', { name: 'Color' }),
      'Color 2',
    );
    await harness.user.selectOptions(
      disease.getByRole('combobox', { name: 'Affected-status attribute' }),
      'hasConditionX',
    );
    await chooseOption(harness, 'Inheritance pattern', 'Autosomal recessive');
    await harness.user.click(disease.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    expect(draftOf(harness).diseases).toEqual([
      {
        id: expect.any(String) as unknown as string,
        label: 'Cystic fibrosis',
        color: 'node-color-seq-2',
        variable: 'hasConditionX',
        inheritancePattern: 'autosomalRecessive',
      },
    ]);
  });

  /**
   * The same rule where the stage had no diseases to lose: the chosen pedigree
   * still travels, alone, in a batch of its own.
   *
   * Holding it back is the tempting reading — nothing was thrown away, so
   * nothing needs explaining — but it costs the researcher the choice itself.
   * The source is an ordinary field, so a batch that skips it is a batch that
   * never touches `sourceStageId` at all, and the choice sits in the form until
   * the submit. Undo restores a whole draft and is applied as the difference
   * from the live one, so a change written outside a step is not left
   * un-undoable: it is undone by whatever step comes NEXT, and the researcher
   * loses the pedigree they picked to an unrelated edit they wanted back.
   *
   * It reaches a live host at once because nothing here is staged: the hold
   * exists for a file this session has not saved, and there is none. That
   * last claim is the reason for `applyLive` — the harness buffers by default,
   * and `liveCommands()` over a buffering host is empty whether the session
   * released the batch or held it back, which would pass this assertion
   * either way.
   */
  it('sends the chosen pedigree alone when there were no diseases to lose', async () => {
    const seeded = loadFixtureStage('narrative-pedigree-1');
    const { diseases: _diseases, ...withoutDiseases } = seeded.fields;
    const harness = renderStageEditor({
      applyLive: true,
      stage: {
        id: seeded.id,
        type: 'NarrativePedigree',
        fields: {
          ...withoutDiseases,
          sourceStageId: 'a-pedigree-that-was-deleted',
        },
      },
      sections: narrativePedigreeSections,
    });

    await chooseOption(harness, 'Source stage', fixturePedigreeOption());

    expect(
      screen.queryByRole('button', { name: CONFIRM_SOURCE_CHANGE }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Source stage' }),
    ).toHaveTextContent('Family Pedigree');
    await waitFor(() => expect(harness.pendingCommands()).toHaveLength(1));
    expect(
      harness.pendingCommands().flatMap((batch) => [...batch.commands]),
    ).toEqual([
      { op: 'set', key: 'sourceStageId', value: 'family-pedigree-1' },
    ]);
    expect(harness.liveCommands()).toEqual([
      { op: 'set', key: 'sourceStageId', value: 'family-pedigree-1' },
    ]);
  });

  /**
   * Undo is the researcher's way back from a source they did not mean, and it
   * has to bring back both halves at once: the pedigree they left AND the
   * diseases that described it. One batch is what makes that a single step.
   */
  it('comes back whole, source included, when the session undoes it', async () => {
    const harness = renderStageEditor(withMissingSource());
    await chooseSourcePedigree(harness, fixturePedigreeOption());
    await waitFor(() =>
      expect(draftOf(harness).sourceStageId).toBe('family-pedigree-1'),
    );

    act(() => {
      harness.session.undo();
    });

    await waitFor(() =>
      expect(draftOf(harness)).toMatchObject({
        sourceStageId: 'a-pedigree-that-was-deleted',
        diseases: [{ id: 'disease-1', label: 'Condition X' }],
      }),
    );
    // And on screen: the controls are re-seeded from an arrival this form did
    // not make, so the researcher sees what the undo restored.
    expect(
      await screen.findByRole('combobox', { name: 'Source stage' }),
    ).toHaveTextContent('a-pedigree-that-was-deleted');
    await screen.findByText('Condition X');
  });
});

/**
 * The prose explaining at-risk statuses describes what the pedigree actually
 * draws, so a researcher reading it can predict the family tree in front of
 * them.
 *
 * The recessive example is the one that can be got wrong in a way nothing else
 * catches: the genetics engine marks a child of two obligate carriers
 * `atRiskAffected`, which the interview draws as "may develop", while "may
 * carry" is what a child with a single carrier parent is drawn as. Described
 * the other way round, the explanation contradicts the picture it explains.
 */
describe('the explanation of at-risk statuses', () => {
  it('gives the two-carrier child as an example of "may develop"', () => {
    renderStageEditor(openFixture());

    // Read off the paragraph as a whole: the two phrases the sentence turns on
    // are emphasised, so a text query matching only direct text nodes would
    // answer a question about half of it.
    expect(
      [...document.querySelectorAll('p')].map((node) => node.textContent),
    ).toContain(
      'At-risk statuses are not observed or diagnosed. They are inferred from the family structure together with each condition\u2019s inheritance pattern \u2014 the child of a parent affected by a dominant condition and the child of two carriers of a recessive condition are both shown as may develop it, while a child with only one carrier parent is shown as may carry it.',
    );
  });
});
