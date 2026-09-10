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

/** The source pedigree with its only nomination prompt taken away. */
const pedigreeRecordingNothing = () => {
  const { nominationPrompts: _prompts, ...rest } = sourcePedigreeDocument();
  return rest;
};

/**
 * The source pedigree recording a SECOND condition, and a codebook that has
 * the attribute behind it.
 *
 * The fixture pedigree records exactly one, which its one disease already
 * maps — so a picker asked what else it would offer has nothing to answer
 * with, and every exclusion below would read as vacuously true.
 */
const alsoRecording = (harness: StageEditorHarness, variableId: string) => {
  const pedigree = sourcePedigreeDocument();
  const prompts = Array.isArray(pedigree.nominationPrompts)
    ? pedigree.nominationPrompts
    : [];
  receiveSection(harness, SOURCE_STAGE_SECTION, {
    ...pedigree,
    nominationPrompts: [
      ...prompts,
      { id: `nomination-${variableId}`, text: 'Who?', variable: variableId },
    ],
  });
  harness.receiveCodebookUpdate({
    node: {
      family_member: familyMemberCodebook({
        add: { [variableId]: { name: variableId, type: 'boolean' } },
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
  it('never offers an attribute the source pedigree derives for itself', async () => {
    const harness = openFixture();
    alsoRecording(harness, 'hasConditionZ');

    const dialog = await addDisease(harness);
    const picker = await dialog.findByRole('combobox', {
      name: 'Affected-status attribute',
    });
    // `is_ego` is the pedigree's participant marker, so a disease mapped to it
    // would paint the participant as affected in every interview.
    await waitFor(() => expect(optionsOf(picker)).toContain('hasConditionZ'));
    // `is_ego` is the pedigree's participant marker; `hasConditionX` is
    // already mapped by the disease this stage holds.
    expect(optionsOf(picker)).not.toContain('is_ego');
    expect(optionsOf(picker)).not.toContain('hasConditionX');
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
    alsoRecording(harness, 'hasConditionZ');

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
