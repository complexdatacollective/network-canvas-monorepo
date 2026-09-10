import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
  optionsOf,
  receiveSection,
  reorderStages,
  sourcePedigreeDocument,
  SOURCE_STAGE_SECTION,
  stageOrder,
} from './narrativePedigreeFixtures.tsx';

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
    const name = dialog.getByRole('textbox', { name: 'Disease name' });
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

    const dialog = await addDisease(harness);
    const picker = await dialog.findByRole('combobox', {
      name: 'Affected-status attribute',
    });
    await waitFor(() => expect(optionsOf(picker)).toContain('hasConditionZ'));
    // `is_ego` is the pedigree's participant marker, so a disease mapped to it
    // would paint the participant as affected in every interview;
    // `hasConditionX` is already mapped by the disease this stage holds.
    expect(optionsOf(picker)).not.toContain('is_ego');
    expect(optionsOf(picker)).not.toContain('hasConditionX');
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

    const dialog = await addDisease(harness);
    const picker = await dialog.findByRole('combobox', {
      name: 'Affected-status attribute',
    });
    await waitFor(() => expect(optionsOf(picker)).toContain('hasConditionZ'));
    expect(optionsOf(picker)).not.toContain('conditionNotes');
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
    expect(
      await dialog.findByText(
        /The source pedigree does not record who is affected by anything yet/,
      ),
    ).toBeInTheDocument();
    expect(
      dialog.queryByRole('combobox', { name: 'Affected-status attribute' }),
    ).toBeNull();
  });

  /**
   * The fixture's own disease already maps the one condition the pedigree
   * records, so a second row is offered nothing at all — which is the
   * exclusion, seen from the only state the fixture can be in.
   */
  it('never offers an attribute a sibling disease already maps', async () => {
    const harness = openFixture();

    const dialog = await addDisease(harness);
    expect(
      await dialog.findByText(
        /The source pedigree does not record who is affected by anything yet/,
      ),
    ).toBeInTheDocument();
  });

  it('keeps a mapping the protocol already holds saveable', async () => {
    const harness = openFixture();

    const dialog = await openDisease(harness);
    expect(
      optionsOf(
        await dialog.findByRole('combobox', {
          name: 'Affected-status attribute',
        }),
      ),
    ).toContain('hasConditionX');
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
    const name = dialog.getByRole('textbox', { name: 'Disease name' });
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
   * be trapped by: they may still be renaming it, or recolouring it, on their
   * way to adding the nomination prompt that repairs it. The row's own
   * committed attribute is what escapes the dialog's rule — everything the
   * researcher picks anew is still judged by it.
   */
  it('lets a row the pedigree stopped recording be saved, and refuses the stage', async () => {
    const harness = openFixture();
    await screen.findByText('Condition X');
    receiveSection(harness, SOURCE_STAGE_SECTION, pedigreeRecordingNothing());

    const dialog = await openDisease(harness);
    const name = dialog.getByRole('textbox', { name: 'Disease name' });
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
});
