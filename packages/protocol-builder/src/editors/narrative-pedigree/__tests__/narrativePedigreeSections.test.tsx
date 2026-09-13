import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  attributeField,
  offeredAttributes,
} from '../../../testing/attributePicker.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import { narrativePedigreeStageEditor } from '../NarrativePedigreeStageEditor.ts';
import {
  addDisease,
  familyMemberCodebook,
  fixtureDisease,
  narrativePedigreeHolding,
  openDisease,
  receiveSection,
  reorderStages,
  sourcePedigreeDocument,
  SOURCE_STAGE_SECTION,
  stageOrder,
} from './narrativePedigreeFixtures.tsx';

/**
 * What the attribute picker says when it can offer nothing.
 *
 * Reached two ways — a pedigree that records no condition, and one whose
 * conditions are all mapped already — so the sentence names neither cause.
 */
const NOTHING_LEFT_TO_MAP = /There is no attribute for this disease to map/;

const openFixture = (): StageEditorHarness =>
  renderStageEditor({
    stageId: 'narrative-pedigree-1',
    registry: narrativePedigreeStageEditor,
  });

const sourceSelect = () =>
  screen.getByRole('combobox', { name: 'Source stage' });

/**
 * The pedigrees the source control is offering, read out of the DOM.
 *
 * By role everywhere else; from the document only here, where the question the
 * researcher is answering makes the page behind it inert and the control is
 * deliberately out of the accessibility tree.
 */
const offeredSources = (): string[] =>
  [...document.querySelectorAll('[data-name="sourceStageId"] option')]
    .filter(
      (option): option is HTMLOptionElement =>
        !(option as HTMLOptionElement).disabled,
    )
    .map((option) => option.value);

/**
 * The attributes one disease's affected-status picker is offering, by the ids
 * choosing one would store.
 *
 * The picker is a trigger and a window now, so reading what it offers means
 * opening the window and closing it again — which is what `offeredAttributes`
 * does. Scoped to the open row dialog, because a stage with several diseases
 * has a field of this name in each of them.
 */
const offeredAttributesOf = (harness: StageEditorHarness): Promise<string[]> =>
  offeredAttributes(
    harness.user,
    attributeField('Node attribute', screen.getByRole('dialog')),
  );

/** The source pedigree with its only nomination prompt taken away. */
const pedigreeRecordingNothing = () => {
  const { nominationPrompts: _prompts, ...rest } = sourcePedigreeDocument();
  return rest;
};

/**
 * The source pedigree recording MORE than the one condition it starts with,
 * and a codebook that has the attributes behind them.
 *
 * The fixture pedigree records exactly one, which its one disease already
 * maps — so a picker asked what else it would offer has nothing to answer
 * with, and every exclusion below would read as vacuously true.
 *
 * `added` names attributes the codebook does not carry yet, by the type each
 * one records. `alsoPrompted` names attributes it already carries: a prompt
 * writing one of those is how an exclusion that is NOT about being recorded —
 * the type, the pedigree's own slots — is asked a question it can fail.
 */
const alsoRecording = (
  harness: StageEditorHarness,
  added: Readonly<Record<string, string>>,
  alsoPrompted: readonly string[] = [],
) => {
  const pedigree = sourcePedigreeDocument();
  const prompts = Array.isArray(pedigree.nominationPrompts)
    ? pedigree.nominationPrompts
    : [];
  receiveSection(harness, SOURCE_STAGE_SECTION, {
    ...pedigree,
    nominationPrompts: [
      ...prompts,
      ...[...Object.keys(added), ...alsoPrompted].map((variableId) => ({
        id: `nomination-${variableId}`,
        text: 'Who?',
        variable: variableId,
      })),
    ],
  });
  harness.receiveCodebookUpdate({
    node: {
      family_member: familyMemberCodebook({
        add: Object.fromEntries(
          Object.entries(added).map(([variableId, type]) => [
            variableId,
            { name: variableId, type },
          ]),
        ),
      }),
    },
  });
};

describe('the pedigree a narrative pedigree reads', () => {
  it('offers the pedigrees that run before it, numbered as the timeline is', async () => {
    openFixture();

    const select = await screen.findByRole('combobox', {
      name: 'Source stage',
    });
    // The fixture's own pedigree is stage 16 of the interview, and the option
    // says so: two Family Pedigree stages may carry the same name.
    expect(
      [...select.querySelectorAll('option')].map((option) => option.label),
    ).toContain('Stage 16 — Family Pedigree');
  });

  it('saves an edit to every key it owns', async () => {
    const harness = openFixture();

    await harness.user.click(
      await screen.findByRole('switch', {
        name: 'Show possible (at-risk) statuses',
      }),
    );
    const dialog = await openDisease(harness);
    const name = dialog.getByRole('textbox', { name: 'Disease label' });
    await harness.user.clear(name);
    await harness.user.type(name, 'Condition Y');
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));

    const saved = await harness.submit();
    expect(saved?.stageDocument.showAtRiskStatuses).toBe(true);
    expect(saved?.stageDocument.diseases).toEqual([
      { ...fixtureDisease(), label: 'Condition Y' },
    ]);
  });

  /**
   * A narrative pedigree with no disease draws an unmarked family, which the
   * schema also refuses — but only at the save, and against a path.
   */
  it('refuses to save a narrative pedigree with no disease', async () => {
    const harness = renderStageEditor(
      narrativePedigreeHolding({ diseases: [] }),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        /Add at least one disease\. A narrative pedigree with none/,
      ),
    ).toBeInTheDocument();
  });
});

describe('a source pedigree that stops being usable', () => {
  it('refuses a source the interview has moved below this stage', async () => {
    const harness = openFixture();
    await screen.findByRole('combobox', { name: 'Source stage' });

    reorderStages(harness, (stages) => [
      ...stages.filter((id) => id !== 'family-pedigree-1'),
      'family-pedigree-1',
    ]);

    expect(
      await screen.findByText(/now runs after it, so the family would still/),
    ).toBeInTheDocument();
    expect(await harness.submit()).toBeNull();
  });

  it('reports a source that has left the interview', async () => {
    const harness = openFixture();
    await screen.findByRole('combobox', { name: 'Source stage' });

    reorderStages(harness, (stages) =>
      stages.filter((id) => id !== 'family-pedigree-1'),
    );

    expect(
      await screen.findByText(/no longer part of the interview/),
    ).toBeInTheDocument();
    expect(await harness.submit()).toBeNull();
  });

  /**
   * The verdict is not a warning to read past, and it is not permanent
   * either: put the pedigree back where it was and the stage saves again.
   */
  it('saves again once the pedigree is moved back before it', async () => {
    const harness = openFixture();
    await screen.findByRole('combobox', { name: 'Source stage' });
    const order = stageOrder(harness);

    reorderStages(harness, (stages) => [
      ...stages.filter((id) => id !== 'family-pedigree-1'),
      'family-pedigree-1',
    ]);
    // Waited for, not assumed: the re-ordered section reaches this editor over
    // the protocol channel, so a submit asked before it arrived would be a
    // submit of a stage whose source was still usable — and would pass here
    // while proving nothing.
    await screen.findByText(/now runs after it/);
    expect(await harness.submit()).toBeNull();

    reorderStages(harness, () => order);

    // The verdict is re-asked the moment the order arrives, so the standing
    // refusal going is the editor's own answer that the source is usable
    // again — waited for before the submit, so the submit is asked once.
    await waitFor(() =>
      expect(screen.queryByText(/now runs after it/)).toBeNull(),
    );
    expect(await harness.submit()).not.toBeNull();
  });
});

describe('the diseases a narrative pedigree defines', () => {
  /**
   * A nomination prompt is put on `is_ego` deliberately. Without one it is an
   * attribute the pedigree does not record, and the recorded rule alone keeps
   * it out — so the claim this case is named for would hold with the
   * interface-slot exclusion deleted.
   */
  it('never offers an attribute the source pedigree derives for itself', async () => {
    const harness = openFixture();
    alsoRecording(harness, { hasConditionZ: 'boolean' }, ['is_ego']);

    await addDisease(harness);
    // The prompt and the codebook both arrive over the protocol's own channel,
    // so the window is read until it has been told about the attribute this
    // case turns on rather than once, before either landed.
    const offered = await waitFor(async () => {
      const list = await offeredAttributesOf(harness);
      expect(list).toContain('hasConditionZ');
      return list;
    });
    // `is_ego` is the pedigree's participant marker, so a disease mapped to it
    // would paint the participant as affected in every interview;
    // `hasConditionX` is already mapped by the disease this stage holds.
    expect(offered).not.toContain('is_ego');
    expect(offered).not.toContain('hasConditionX');
  });

  /**
   * A disease is drawn from an affected-or-not answer, and a recorded
   * attribute that is not one cannot carry it. The prompt is what makes the
   * type the only thing keeping it out of the list.
   */
  it('never offers a recorded attribute that cannot hold a yes-or-no answer', async () => {
    const harness = openFixture();
    alsoRecording(harness, {
      hasConditionZ: 'boolean',
      conditionNotes: 'text',
    });

    await addDisease(harness);
    const offered = await waitFor(async () => {
      const list = await offeredAttributesOf(harness);
      expect(list).toContain('hasConditionZ');
      return list;
    });
    expect(offered).not.toContain('conditionNotes');
  });

  /**
   * A disease only READS its attribute, so one no nomination prompt of the
   * source pedigree writes is one nothing ever marks anybody with.
   */
  it('offers only what the source pedigree records', async () => {
    const harness = renderStageEditor(
      narrativePedigreeHolding({ diseases: [] }),
    );
    receiveSection(harness, SOURCE_STAGE_SECTION, pedigreeRecordingNothing());

    const dialog = await addDisease(harness);
    expect(await dialog.findByText(NOTHING_LEFT_TO_MAP)).toBeInTheDocument();
    // The picker is gone, not merely empty: its trigger is the only way into
    // the window, so a control that still offered one would be a door onto an
    // empty list. Asked by the trigger's own name, because the control stopped
    // being a select when the window replaced it.
    expect(
      dialog.queryByRole('button', { name: 'Select attribute' }),
    ).toBeNull();
  });

  /**
   * The fixture's own disease already maps the one condition the pedigree
   * records, so a second row is offered nothing at all — which is the
   * exclusion, seen from the only state the fixture can be in.
   *
   * The same sentence as the case above, and deliberately: the pedigree here
   * DOES record a condition, so a sentence saying it records nothing would be
   * a false account of why this row has nothing to choose from. What the two
   * states share is the remedy, and that is what the picker says.
   */
  it('never offers an attribute a sibling disease already maps', async () => {
    const harness = openFixture();

    const dialog = await addDisease(harness);
    expect(await dialog.findByText(NOTHING_LEFT_TO_MAP)).toBeInTheDocument();
  });

  it('keeps a mapping the protocol already holds saveable', async () => {
    const harness = openFixture();

    const dialog = await openDisease(harness);
    await dialog.findByText('Node attribute', { selector: 'label' });
    expect(await offeredAttributesOf(harness)).toContain('hasConditionX');
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));

    expect(await harness.submit()).not.toBeNull();
  });

  /**
   * The picker never offers an attribute a sibling row already maps, so this
   * state cannot be reached by choosing one: it arrives with an import, or
   * with a row a collaborator wrote. The save-time twin of that exclusion is
   * the only thing standing between it and a saved stage that gives the
   * pedigree two inheritance patterns for one affected set.
   */
  it('refuses a second disease that reuses an attribute', async () => {
    const harness = renderStageEditor(
      narrativePedigreeHolding({
        diseases: [
          fixtureDisease(),
          {
            id: 'disease-2',
            label: 'Condition X, again',
            color: 'node-color-seq-2',
            variable: 'hasConditionX',
            inheritancePattern: 'unknown',
          },
        ],
      }),
    );

    const dialog = await openDisease(harness, 1);
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        /This attribute is already mapped by another disease/,
      ),
    ).toBeInTheDocument();
  });

  it('refuses a second disease that reuses a name', async () => {
    const harness = renderStageEditor(
      narrativePedigreeHolding({
        diseases: [
          fixtureDisease(),
          {
            id: 'disease-2',
            label: 'Condition Z',
            color: 'node-color-seq-2',
            variable: 'hasConditionZ',
            inheritancePattern: 'unknown',
          },
        ],
      }),
    );
    alsoRecording(harness, { hasConditionZ: 'boolean' });

    const dialog = await openDisease(harness, 1);
    const name = dialog.getByRole('textbox', { name: 'Disease label' });
    await harness.user.clear(name);
    await harness.user.type(name, 'Condition X');
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(/Another disease already uses this name/),
    ).toBeInTheDocument();
  });
});

describe('a disease the source pedigree stopped recording', () => {
  it('marks the row, refuses the save and names the disease', async () => {
    const harness = openFixture();
    await screen.findByText('Condition X');

    receiveSection(harness, SOURCE_STAGE_SECTION, pedigreeRecordingNothing());

    expect(
      await screen.findByText('Nothing records this attribute'),
    ).toBeInTheDocument();
    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(/Condition X maps an attribute the source pedigree/),
    ).toBeInTheDocument();
  });

  /**
   * The dialog lets the row be saved, and the LIST is what refuses the stage.
   * A mapping a collaborator invalidated is not the researcher's mistake to
   * be trapped by: they may still be renaming it, or changing the colour it is
   * marked in, on their way to adding the nomination prompt that repairs it.
   * The row's own committed attribute is what escapes the dialog's rule —
   * everything the researcher picks anew is still judged by it.
   */
  it('lets a row the pedigree stopped recording be saved, and refuses the stage', async () => {
    const harness = openFixture();
    await screen.findByText('Condition X');
    receiveSection(harness, SOURCE_STAGE_SECTION, pedigreeRecordingNothing());

    const dialog = await openDisease(harness);
    const name = dialog.getByRole('textbox', { name: 'Disease label' });
    await harness.user.clear(name);
    await harness.user.type(name, 'Condition Y');
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(/Condition Y maps an attribute the source pedigree/),
    ).toBeInTheDocument();
  });

  it('saves again once the pedigree records it again', async () => {
    const harness = openFixture();
    await screen.findByText('Condition X');

    receiveSection(harness, SOURCE_STAGE_SECTION, pedigreeRecordingNothing());
    expect(await harness.submit()).toBeNull();

    receiveSection(harness, SOURCE_STAGE_SECTION, sourcePedigreeDocument());

    // The row's own badge is the same verdict the list refuses on, so its
    // going is the editor saying the mapping records somebody again.
    await waitFor(() =>
      expect(screen.queryByText('Nothing records this attribute')).toBeNull(),
    );
    expect(await harness.submit()).not.toBeNull();
  });

  /**
   * The attribute itself going is a different failure from nothing recording
   * it, and it has no committed-value escape: nothing can be recorded under
   * an attribute that is not there.
   */
  it('refuses a disease whose attribute a collaborator deleted', async () => {
    const harness = openFixture();
    await screen.findByText('Condition X');

    harness.receiveCodebookUpdate({
      node: {
        family_member: familyMemberCodebook({ remove: 'hasConditionX' }),
      },
    });

    const dialog = await openDisease(harness);
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(/no longer in the codebook/),
    ).toBeInTheDocument();
  });

  it('refuses a disease whose attribute a collaborator retyped', async () => {
    const harness = openFixture();
    await screen.findByText('Condition X');

    harness.receiveCodebookUpdate({
      node: {
        family_member: familyMemberCodebook({
          add: { hasConditionX: { name: 'hasConditionX', type: 'text' } },
        }),
      },
    });

    const dialog = await openDisease(harness);
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(/no longer records a yes-or-no answer/),
    ).toBeInTheDocument();
  });
});

/**
 * The three things a collaborator can do to the CODEBOOK that leave a disease
 * mapping unusable. None of them is the researcher's own doing, and none of
 * them is a fact about this stage: what an attribute is, and whether it is
 * there at all, belongs to the codebook. So each is reported on the row and
 * the save is taken — a draft may be invalid across sections while the
 * researcher works out which side to repair, and publication is where that is
 * enforced. The dialog still refuses the same picks, which is the same rule
 * asked of a decision the researcher is making now.
 *
 * All three assertions are made every time, because any two of them hold while
 * the third breaks: a row marked invalid under an outline that reads
 * "Finished" is a problem nobody scrolling the section list would find, and a
 * save refused for one of these traps the researcher in a stage they cannot
 * leave.
 */
describe('a disease whose attribute the codebook can no longer carry', () => {
  /** The collapsed row for one disease, by the name the researcher gave it. */
  const diseaseRow = (label: string): HTMLElement => {
    const row = screen.getByText(label).closest('li');
    if (row === null) throw new Error(`No row is showing "${label}".`);
    return row;
  };

  const diseasesOutline = (harness: StageEditorHarness) =>
    harness.outline().find((section) => section.title === 'Disease mappings')
      ?.state;

  it('reports an attribute a collaborator deleted, and saves the stage', async () => {
    const harness = openFixture();
    await screen.findByText('Condition X');
    expect(
      diseaseRow('Condition X').querySelector('[aria-invalid="true"]'),
    ).toBeNull();

    harness.receiveCodebookUpdate({
      node: {
        family_member: familyMemberCodebook({ remove: 'hasConditionX' }),
      },
    });

    expect(
      await screen.findByText(/no longer in the codebook/),
    ).toBeInTheDocument();
    const row = diseaseRow('Condition X');
    expect(row).toContainElement(screen.getByText(/no longer in the codebook/));
    expect(row.querySelector('[aria-invalid="true"]')).not.toBeNull();
    expect(diseasesOutline(harness)).toBe('Has a problem');
    expect((await harness.submit())?.stageDocument.diseases).toEqual([
      fixtureDisease(),
    ]);
  });

  it('reports an attribute a collaborator retyped, and saves the stage', async () => {
    const harness = openFixture();
    await screen.findByText('Condition X');

    harness.receiveCodebookUpdate({
      node: {
        family_member: familyMemberCodebook({
          add: { hasConditionX: { name: 'hasConditionX', type: 'text' } },
        }),
      },
    });

    expect(
      await screen.findByText(/no longer records a yes-or-no answer/),
    ).toBeInTheDocument();
    const row = diseaseRow('Condition X');
    expect(row).toContainElement(
      screen.getByText(/no longer records a yes-or-no answer/),
    );
    expect(row.querySelector('[aria-invalid="true"]')).not.toBeNull();
    expect(diseasesOutline(harness)).toBe('Has a problem');
    expect((await harness.submit())?.stageDocument.diseases).toEqual([
      fixtureDisease(),
    ]);
  });

  /**
   * A row mapping the pedigree's own participant marker, which the picker
   * never offered and an import brought in.
   *
   * The nomination prompt a collaborator adds is what makes this case about
   * the interface slot at all: without one, `is_ego` is also an attribute the
   * pedigree does not record, the list's "marks nobody" rule refuses the save
   * first, and the claim would hold with the slot rule deleted. So the prompt
   * arriving is waited for by the badge it clears, and what is left standing
   * afterwards is the slot rule alone.
   */
  it('reports an attribute the pedigree derives for itself, and saves the stage', async () => {
    const mappedToEgo = { ...fixtureDisease(), variable: 'is_ego' };
    const harness = renderStageEditor(
      narrativePedigreeHolding({ diseases: [mappedToEgo] }),
    );
    await screen.findByText('Condition X');

    alsoRecording(harness, {}, ['is_ego']);
    await waitFor(() =>
      expect(screen.queryByText('Nothing records this attribute')).toBeNull(),
    );

    const row = diseaseRow('Condition X');
    expect(row).toContainElement(
      screen.getByText(
        /is set by the Family Pedigree interface, which marks the participant/,
      ),
    );
    expect(row.querySelector('[aria-invalid="true"]')).not.toBeNull();
    expect(diseasesOutline(harness)).toBe('Has a problem');
    expect((await harness.submit())?.stageDocument.diseases).toEqual([
      mappedToEgo,
    ]);
  });
});

describe('changing which pedigree a stage reads', () => {
  it('asks before a different source discards the diseases', async () => {
    const harness = openFixture();
    await screen.findByText('Condition X');

    await harness.user.selectOptions(sourceSelect(), 'family-pedigree-1');

    // The fixture has one pedigree, so re-choosing it is the only change on
    // offer — and the question is asked whatever is currently chosen, because
    // what it costs is what the stage HOLDS.
    expect(
      await screen.findByText(/This will remove every disease/),
    ).toBeInTheDocument();
  });

  it('leaves the stage exactly as it was when the researcher says no', async () => {
    const harness = openFixture();
    await screen.findByText('Condition X');

    await harness.user.selectOptions(sourceSelect(), 'family-pedigree-1');
    await harness.user.click(
      await screen.findByRole('button', { name: 'Cancel' }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    await harness.roundTrip();
  });

  /**
   * Every disease names an attribute of the source pedigree's node type, so a
   * different source invalidates all of them at once — and they go rather than
   * being left to fail validation against a node type they were never about.
   *
   * The choice that caused the loss has to survive it: the discard writes to
   * the same draft the form is showing, and a write the shell read as a draft
   * arriving from elsewhere would be written back over every control, putting
   * the select back to the source the researcher just left.
   */
  it('drops the diseases that described the source it left', async () => {
    const harness = renderStageEditor(
      narrativePedigreeHolding({
        sourceStageId: 'a-pedigree-that-was-deleted',
      }),
    );
    expect(await screen.findByText('Condition X')).toBeInTheDocument();

    await harness.user.selectOptions(sourceSelect(), 'family-pedigree-1');
    await harness.user.click(
      await screen.findByRole('button', { name: 'Change the pedigree' }),
    );

    await waitFor(() =>
      expect(screen.queryByText('Condition X')).not.toBeInTheDocument(),
    );
    expect(sourceSelect()).toHaveValue('family-pedigree-1');
    // The stage is now one the save refuses, which is the point: the diseases
    // are gone rather than silently re-pointed at a family they never described.
    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(/Add at least one disease/),
    ).toBeInTheDocument();
  });

  /**
   * The question is awaited, so what resumes is a closure from the render that
   * asked it — while a collaborator can delete the pedigree it named, re-type
   * it, or move it below this stage. Applied anyway, the answer would cost the
   * researcher every disease the question warned about AND leave the stage
   * reading a pedigree it may not read.
   */
  it('refuses a confirmed source the interview has moved in the meantime', async () => {
    const harness = renderStageEditor(
      narrativePedigreeHolding({
        sourceStageId: 'a-pedigree-that-was-deleted',
      }),
    );
    expect(await screen.findByText('Condition X')).toBeInTheDocument();

    await harness.user.selectOptions(sourceSelect(), 'family-pedigree-1');
    await screen.findByRole('button', { name: 'Change the pedigree' });
    reorderStages(harness, (stages) => [
      ...stages.filter((id) => id !== 'family-pedigree-1'),
      'family-pedigree-1',
    ]);
    // The control has withdrawn it — read from the DOM, because the open
    // question makes the page behind it inert and so unreachable by role.
    await waitFor(() =>
      expect(offeredSources()).not.toContain('family-pedigree-1'),
    );

    await harness.user.click(
      screen.getByRole('button', { name: 'Change the pedigree' }),
    );

    // Said rather than swallowed, and it says what did NOT happen.
    expect(
      await screen.findByText(
        'The pedigree you chose is no longer one of the options here, so nothing has changed and no disease has been removed. Choose again.',
      ),
    ).toBeInTheDocument();
    await harness.user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Condition X')).toBeInTheDocument();
    expect(sourceSelect()).toHaveValue('a-pedigree-that-was-deleted');
  });

  /**
   * Nothing to lose, nothing to ask: a stage that has mapped no disease takes
   * its first source without a question.
   */
  it('keeps a first source chosen on a stage that has mapped nothing', async () => {
    const harness = renderStageEditor(
      narrativePedigreeHolding({ diseases: [], sourceStageId: '' }),
    );
    await screen.findByRole('combobox', { name: 'Source stage' });

    await harness.user.selectOptions(sourceSelect(), 'family-pedigree-1');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(sourceSelect()).toHaveValue('family-pedigree-1'),
    );
  });
});

describe('the explanation of at-risk statuses', () => {
  it('gives the two-carrier child as an example of "may develop"', async () => {
    openFixture();

    expect(
      await screen.findByText(
        /child of two carriers of a recessive condition are both shown as/,
      ),
    ).toBeInTheDocument();
  });

  /**
   * The convention this explanation describes is a published one, and the
   * released Architect cited it in both halves — the paragraph saying what a
   * filled symbol means, and the paragraph saying why inferred risk is off by
   * default. Without the citation a researcher reading "standard pedigree
   * nomenclature" has no way to go and check what the standard says, which is
   * exactly what a clinician-directed setting needs.
   */
  it('cites the nomenclature it follows, where Architect cited it', async () => {
    openFixture();

    expect(
      await screen.findByText(
        // The sentence around it is broken by the <em> marking "affected", so
        // the citation is matched in the text node it actually sits in.
        /\(per Bennett et al\., 2022 nomenclature\), so at-risk relatives/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Standard pedigree nomenclature \(Bennett et al\., 2022\) deliberately does not encode probabilistic risk/,
      ),
    ).toBeInTheDocument();
  });

  /**
   * The switch's own hint is Architect's, emphasis included: the word that
   * separates an inferred status from a recorded one is marked rather than
   * left to the reader.
   */
  it('marks the word that distinguishes a possible status from a certain one', async () => {
    openFixture();

    const emphasised = await screen.findByText('possible');
    expect(emphasised.tagName).toBe('STRONG');
    expect(
      screen.getByText(
        /\(at-risk\) statuses alongside the certain ones, inferred from family structure and inheritance patterns\./,
      ),
    ).toBeInTheDocument();
  });
});
