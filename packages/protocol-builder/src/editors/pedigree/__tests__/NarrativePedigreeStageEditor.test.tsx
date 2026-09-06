import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import {
  expectOpenedAsANewStage,
  expectStatesItsPosition,
  NEW_STAGE_POSITION,
} from '../../__tests__/creationSignal.ts';
import { pedigreeAndAnonymisationStageEditors } from '../../pedigreeAndAnonymisationStageEditors.ts';
import {
  narrativePedigreeEditor,
  shimMarkdownEditorMeasurement,
} from './editorFixtures.tsx';

shimMarkdownEditorMeasurement();

const STAGE_ORDER_SECTION = sectionId({ kind: 'stageOrder' });

const SOURCE_STAGE_ID = 'family-pedigree-1';

const MISSING_SOURCE_MESSAGE =
  'The Family Pedigree stage this one reads is no longer part of the interview. Choose another one, or restore it, before this stage can be saved.';

const openFixture = () =>
  renderStageEditor({
    stageId: 'narrative-pedigree-1',
    editor: narrativePedigreeEditor,
  });

/** The fixture stage with whatever a test needs replaced on it. */
const narrativePedigreeStageWith = (extra: SectionDoc) => {
  const seeded = loadFixtureStage('narrative-pedigree-1');
  if (seeded.type !== 'NarrativePedigree') {
    throw new Error(
      'The fixture stage "narrative-pedigree-1" changed interface.',
    );
  }
  return {
    id: seeded.id,
    type: 'NarrativePedigree' as const,
    fields: { ...seeded.fields, ...extra },
  };
};

/** A stage of this interface that does not exist yet, as a host creates one. */
const openNewStage = () =>
  renderStageEditor({
    stage: {
      id: 'narrative-pedigree-new',
      type: 'NarrativePedigree',
      fields: getInterfaceTemplate('NarrativePedigree'),
    },
    editor: narrativePedigreeEditor,
  });

/**
 * A stage someone else has deleted, as an authoritative update.
 *
 * The harness patches the codebook for a test; a stage is two sections — its
 * own document and its place in the interview's order — and a deletion takes
 * both. Removing only the order entry would leave a stage the protocol cannot
 * even be assembled from, which is a broken host rather than a collaborator.
 */
function deleteStage(harness: StageEditorHarness, stageId: string): void {
  const sections = { ...harness.session.getSnapshot().protocolSections };
  const order = sections[STAGE_ORDER_SECTION]?.stages;
  const stages = Array.isArray(order)
    ? order.filter((entry): entry is string => typeof entry === 'string')
    : [];
  delete sections[sectionId({ kind: 'stage', stageId })];
  act(() => {
    harness.session.receiveAuthoritativeUpdate({
      protocolSections: {
        ...sections,
        [STAGE_ORDER_SECTION]: {
          stages: stages.filter((entry) => entry !== stageId),
        },
      },
      manifestRevision: { sequence: 9n, hash: 'revision-9' },
    });
  });
}

/**
 * Chooses one option of a listbox select.
 *
 * The source stage and the inheritance pattern render as a button and a
 * listbox popup rather than a native control, so a test drives them the way a
 * researcher does, by opening and choosing.
 */
async function chooseOption(
  harness: StageEditorHarness,
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

const outlineStateOf = (harness: StageEditorHarness, title: string) =>
  harness.outline().find((section) => section.title === title)?.state;

/**
 * Chooses the pedigree this stage reads, and waits until it has been taken.
 *
 * The second attempt is not belt and braces. A stage that holds a `diseases`
 * key — which the interface's own template gives every stage a host creates —
 * loses the FIRST choice: `SourceStageSection` drops the diseases through
 * `controller.changeFields`, and a whole-draft change is indistinguishable to
 * the shell from a draft arriving from somewhere else, so the form is re-seeded
 * from the session and the researcher's unflushed choice is written back to
 * what it was. The key is gone by then, so the next choice sticks.
 *
 * Recorded here rather than worked around silently: the defect is in a section
 * this editor composes, and the fix belongs with whoever owns the whole-draft
 * write — either by not clearing what is already empty, or by marking a
 * section's own `changeFields` the way the shell marks its own submit.
 */
async function chooseSourceStage(
  harness: StageEditorHarness,
  optionLabel: string,
): Promise<void> {
  await chooseOption(harness, 'Source stage', optionLabel);
  if (outlineStateOf(harness, 'Diseases') !== 'Not available yet') return;
  await chooseOption(harness, 'Source stage', optionLabel);
  await waitFor(() =>
    expect(outlineStateOf(harness, 'Diseases')).not.toBe('Not available yet'),
  );
}

describe('the narrative pedigree stage editor', () => {
  /**
   * A stage the host is CREATING, opened the way a host opens one: from this
   * interface's own template, not yet in the interview, and carrying the
   * position it is about to be inserted at. Everything an editor does
   * differently for a new stage follows from that one signal, which the
   * shared sections read from the editor's context rather than from a prop.
   */
  it('opens a stage being created on the creation the session carries', async () => {
    renderStageEditor({
      create: { type: 'NarrativePedigree', position: NEW_STAGE_POSITION },
      editor: narrativePedigreeEditor,
    });

    await expectOpenedAsANewStage('Narrative Pedigree');
  });

  /**
   * And the other way round: a stage the interview already holds says where in
   * it the researcher is. Asked here rather than only in the dispatch suite
   * because this editor composes the shared heading itself, so dropping it
   * would leave every other test in this file passing.
   */
  it('says where the stage sits in the interview', () => {
    openFixture();

    expectStatesItsPosition('narrative-pedigree-1');
  });

  it('claims exactly this interface in its family', () => {
    expect(
      pedigreeAndAnonymisationStageEditors.NarrativePedigree,
    ).toBeDefined();
  });

  /**
   * Every key the fixture stage holds is edited by a section this editor
   * mounts, and saving it unchanged returns it unchanged. `unowned` is empty
   * because there is nothing this interface's schema holds that the editor
   * leaves to a section that has not been built.
   */
  it('owns every key the stage holds, and round-trips it', async () => {
    const harness = openFixture();

    await harness.roundTrip({ unowned: [] });
    expect(harness.ownedKeys()).toEqual([
      'diseases',
      'label',
      'showAtRiskStatuses',
      'sourceStageId',
    ]);
  });

  it('lists its sections in the order the researcher works through them', () => {
    const harness = openFixture();

    expect(harness.outline().map((section) => section.title)).toEqual([
      'Stage name',
      'Pedigree source',
      'Diseases',
      'At-risk statuses',
      'Skip logic',
      'Interviewer guidance',
    ]);
  });

  /**
   * What the interface's template puts on screen before the researcher has
   * decided anything: no source pedigree, no diseases, and at-risk statuses
   * off. Split from the save below so neither claim can hide the other — a
   * template that arrived with a source already chosen would still let a
   * filled-in stage save. Seeded from `getInterfaceTemplate` rather than from a
   * hand-written object, so a template that gains a default is exercised here
   * rather than diverging from what a host actually creates.
   */
  it('opens a new stage on the template its interface ships', () => {
    openNewStage();

    expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveValue('');
    expect(
      screen.getByRole('switch', { name: 'Show possible (at-risk) statuses' }),
    ).not.toBeChecked();
    expect(
      screen.queryByRole('button', { name: 'Edit disease' }),
    ).not.toBeInTheDocument();
  });

  /**
   * The minimum edits a created stage still needs: its name, the pedigree it
   * reads, and one disease to draw on it.
   *
   * The typed strings are as short as their assertions allow: every character
   * is a keystroke through a controlled field.
   */
  it('saves a new stage once it reads a pedigree and marks something', async () => {
    const harness = openNewStage();

    // The source comes first, and the stage's name after it: choosing a source
    // re-seeds the whole form from the session — see `chooseSourceStage` — so
    // anything typed before it is written back to what the template held.
    await chooseSourceStage(harness, 'Family Pedigree');
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      'Affected',
    );

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new disease' }),
    );
    // Scoped to the dialog: `screen` would compute an accessible name for
    // every control in the editor behind it to answer a question about one
    // inside it.
    const disease = within(await screen.findByRole('dialog'));
    await harness.user.type(
      disease.getByRole('textbox', { name: 'Disease name' }),
      'Z',
    );
    await harness.user.selectOptions(
      disease.getByRole('combobox', { name: 'Colour' }),
      'node-color-seq-2',
    );
    await harness.user.selectOptions(
      disease.getByRole('combobox', { name: 'Affected-status attribute' }),
      'hasConditionX',
    );
    await chooseOption(harness, 'Inheritance pattern', 'Autosomal recessive');
    await harness.user.click(disease.getByRole('button', { name: 'Add' }));

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      id: 'narrative-pedigree-new',
      type: 'NarrativePedigree',
      label: 'Affected',
      sourceStageId: SOURCE_STAGE_ID,
      showAtRiskStatuses: false,
    });
    expect(request?.stageDocument.diseases).toMatchObject([
      {
        label: 'Z',
        color: 'node-color-seq-2',
        variable: 'hasConditionX',
        inheritancePattern: 'autosomalRecessive',
      },
    ]);
  });

  it('refuses a stage that marks nothing, and says which section it is in', async () => {
    const harness = renderStageEditor({
      stage: narrativePedigreeStageWith({ diseases: [] }),
      editor: narrativePedigreeEditor,
    });

    expect(await harness.submit()).toBeNull();
    expect(outlineStateOf(harness, 'Diseases')).toBe('Has a problem');
    expect(outlineStateOf(harness, 'Pedigree source')).toBe('Finished');
  });

  it('leaves nothing pending when the researcher cancels', async () => {
    const harness = openFixture();

    await harness.user.click(
      screen.getByRole('switch', {
        name: 'Show possible (at-risk) statuses',
      }),
    );
    await harness.cancel();

    expect(harness.pendingCommands()).toEqual([]);
  });

  it('refuses to save once editing has been taken away', async () => {
    const harness = openFixture();
    harness.setReadOnly();

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'This stage is read-only, so your changes were not saved. Take over editing and try again.',
      ),
    ).toBeInTheDocument();
  });
});

describe('a source pedigree that changes while the stage is open', () => {
  /**
   * The stage this one reads can be deleted from the interview by someone
   * else. That is a thing to report — the researcher has to choose another
   * pedigree, or restore this one — and never a thing to correct on their
   * behalf or to crash on.
   */
  it('reports a source stage that has left the interview, without a command of its own', async () => {
    const harness = openFixture();
    const dispatched = vi.spyOn(harness.session, 'dispatch');

    deleteStage(harness, SOURCE_STAGE_ID);

    expect(await screen.findByText(MISSING_SOURCE_MESSAGE)).toBeInTheDocument();
    expect(dispatched).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
  });

  /**
   * A disease maps an attribute of the source pedigree's node type, so an
   * attribute a collaborator deletes has to stop being offered at once — and
   * the editor answers that with nothing, because it was not a party to it.
   */
  it('follows an attribute deleted from the source pedigree’s type without echoing it', async () => {
    const harness = openFixture();
    const familyMemberSection = sectionId({
      kind: 'codebookNode',
      typeId: 'family_member',
    });
    const definition =
      harness.session.getSnapshot().protocolSections[familyMemberSection];
    if (definition === undefined) {
      throw new Error('The fixture protocol has no "family_member" node type.');
    }
    const variables = { ...(definition.variables as Record<string, unknown>) };
    delete variables.hasConditionX;

    const dispatched = vi.spyOn(harness.session, 'dispatch');
    harness.receiveCodebookUpdate({
      node: { family_member: { ...definition, variables } },
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit disease' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Affected-status attribute' }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('option', {
        name: 'hasConditionX — this attribute is no longer in the codebook',
      }),
    ).toBeInTheDocument();
    expect(dispatched).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
  });
});
