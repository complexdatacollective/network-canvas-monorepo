import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import {
  fixtureProtocolSections,
  loadFixtureStage,
} from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
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

const FAMILY_MEMBER_SECTION = sectionId({
  kind: 'codebookNode',
  typeId: 'family_member',
});

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

const A_SECOND_BOOLEAN = {
  hasConditionY: { name: 'hasConditionY', type: 'boolean' },
} as const;

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
    const harness = renderStageEditor(openFixture());

    // The stage's name belongs to a section this mount does not include.
    await harness.roundTrip({ unowned: ['label'] });
  });

  it('saves an edit to every key it owns', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.user.click(
      screen.getByRole('switch', { name: 'Show possible (at-risk) statuses' }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit disease' }),
    );
    const label = await screen.findByRole('textbox', { name: 'Disease name' });
    await harness.user.clear(label);
    await harness.user.type(label, 'Huntington’s disease');
    await chooseOption(harness, 'Inheritance pattern', 'X-linked recessive');
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.showAtRiskStatuses).toBe(true);
    expect(request?.stageDocument.diseases).toEqual([
      {
        id: 'disease-1',
        label: 'Huntington’s disease',
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
    const harness = renderStageEditor(openFixture());
    harness.receiveCodebookUpdate({
      node: { family_member: familyMemberCodebook({ add: A_SECOND_BOOLEAN }) },
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new disease' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Disease name' }),
      'condition x ',
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Colour' }),
      'node-color-seq-2',
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Affected-status attribute' }),
      'hasConditionY',
    );
    await chooseOption(harness, 'Inheritance pattern', 'Autosomal recessive');
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));

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
    const harness = renderStageEditor(openFixture());
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

  it('creates an attribute for a disease as one compound edit', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit disease' }),
    );
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Create a new affected-status attribute',
      }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Attribute name' }),
      'hasConditionZ',
    );
    const submissions = vi.spyOn(harness.host, 'submit');
    await harness.user.click(
      screen.getByRole('button', { name: 'Create attribute' }),
    );

    await waitFor(() => expect(submissions).toHaveBeenCalledTimes(1));
    expect(
      submissions.mock.calls[0]?.[0].edits.map((edit) => edit.sectionId),
    ).toEqual([FAMILY_MEMBER_SECTION]);
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Affected-status attribute' }),
      ).not.toHaveValue('hasConditionX'),
    );
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

    await chooseOption(harness, 'Source stage', 'Family Pedigree');

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
   * A stage created from the template carries `diseases: []` — nothing is
   * mapped, so there is nothing for a new source to invalidate. Writing
   * anyway would spend a marker on a transition that never happens, and the
   * draft moving under the form takes the choice with it.
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

    await chooseOption(harness, 'Source stage', 'Family Pedigree');

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
