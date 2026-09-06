import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RELATIONSHIP_TYPE_OPTIONS } from '@codaco/protocol-validation';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import BoundaryOptionsSection from '../BoundaryOptionsSection.tsx';
import CensusPromptSection from '../CensusPromptSection.tsx';
import FramingConfigSection from '../FramingConfigSection.tsx';
import NominationPromptsSection from '../NominationPromptsSection.tsx';
import PedigreeEdgeConfigurationSection from '../PedigreeEdgeConfigurationSection.tsx';
import PedigreeNodeConfigurationSection from '../PedigreeNodeConfigurationSection.tsx';
import {
  addFamilyMemberVariable,
  familyPedigreeStageWith,
} from './pedigreeFixtures.tsx';

const pedigreeSections = (
  <>
    <FramingConfigSection />
    <BoundaryOptionsSection />
    <PedigreeNodeConfigurationSection />
    <PedigreeEdgeConfigurationSection />
    <CensusPromptSection />
    <NominationPromptsSection />
  </>
);

const openFixture = () => ({
  stageId: 'family-pedigree-1',
  sections: pedigreeSections,
});

const NOMINATION_ROWS = [
  {
    id: 'nomination-1',
    text: 'Who has been unwell?',
    variable: 'hasConditionX',
  },
];

const openWithNominationPrompts = () => ({
  stage: familyPedigreeStageWith({ nominationPrompts: NOMINATION_ROWS }),
  sections: pedigreeSections,
});

const FIXTURE_NODE_CONFIG = {
  type: 'family_member',
  nodeLabelVariable: 'fm_name',
  egoVariable: 'is_ego',
  relationshipVariable: 'fm_relationship_to_ego',
  biologicalSexVariable: 'biologicalSex',
};

/** The fixture pedigree, already asking one thing about each family member. */
const openWithFamilyMemberForm = () => ({
  stage: familyPedigreeStageWith({
    nodeConfig: {
      ...FIXTURE_NODE_CONFIG,
      form: [{ variable: 'fm_name', prompt: 'What do they go by?' }],
    },
  }),
  sections: pedigreeSections,
});

/** Every command this session has issued and not had acknowledged. */
const commandsOf = (harness: StageEditorHarness) =>
  harness.pendingCommands().flatMap((batch) => [...batch.commands]);

/**
 * What the outline says about one section, by its title.
 *
 * Undefined rather than a default when the section is not listed at all, so a
 * test asserting a state cannot pass against a section that has gone.
 */
const outlineStateOf = (
  harness: StageEditorHarness,
  title: string,
): string | undefined =>
  harness.outline().find((section) => section.title === title)?.state;

/** The family member form as the session holds it right now. */
const formRows = (harness: StageEditorHarness): unknown[] => {
  const nodeConfig =
    harness.session.getSnapshot().editedSection.fields.nodeConfig;
  const form = isRecord(nodeConfig) ? nodeConfig.form : undefined;
  return Array.isArray(form) ? form : [];
};

/**
 * The attributes a picker is currently offering, by their ids.
 *
 * The placeholder is dropped: it is the control's own "nothing chosen yet"
 * rather than an attribute on offer, and counting it would make every
 * exclusion below pass whether or not it excluded anything.
 */
const optionsOf = (name: string): string[] =>
  [...screen.getByRole('combobox', { name }).querySelectorAll('option')]
    .map((option) => option.value)
    .filter((value) => value !== '');

const FAMILY_MEMBER_SECTION = sectionId({
  kind: 'codebookNode',
  typeId: 'family_member',
});

/**
 * jsdom has no layout, and the markdown editor a nomination prompt is written
 * in measures the document on every change and every click: a Range, to scroll
 * the caret into view, and a point, to place the caret where the pointer went
 * down. Unshimmed it throws mid-transaction, and the prompt a researcher types
 * never reaches the row.
 *
 * Shimmed as "measured nothing" rather than worked around, because what these
 * tests are about is the prompt list, not where a caret lands: the editor's own
 * fallbacks handle an unmeasurable document, so the section behaves exactly as
 * it does in a browser that has simply not laid the editor out yet.
 */
const EMPTY_RECTS = Object.assign([], {
  item: () => null,
}) as unknown as DOMRectList;
Range.prototype.getClientRects ??= () => EMPTY_RECTS;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();
Document.prototype.elementFromPoint ??= () => null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Adds a family member form field that invents the attribute it collects.
 *
 * The one sequence in this file that goes through the field dialog by hand,
 * because every boolean the node type already has is written unvalidated
 * somewhere and the shared picker refuses all of them — so a test that needs a
 * form field collecting a boolean has to make the attribute here. The prompt
 * text is as short as a question can be: every character is a keystroke
 * through a controlled field, and what these tests are about is which
 * attribute the field took, never what it asks.
 */
async function addFormFieldInventing(
  harness: StageEditorHarness,
  attributeName: string,
  kindOfAnswer: string,
): Promise<void> {
  await harness.user.click(
    await screen.findByRole('button', { name: 'Create new form field' }),
  );
  const field = within(await screen.findByRole('dialog'));
  await harness.user.selectOptions(
    field.getByRole('combobox', { name: 'Attribute' }),
    '__create_new_attribute__',
  );
  await harness.user.type(
    await field.findByRole('textbox', { name: 'Attribute name' }),
    attributeName,
  );
  await harness.user.selectOptions(
    field.getByRole('combobox', { name: 'Kind of answer' }),
    kindOfAnswer,
  );
  await harness.user.type(
    field.getByRole('textbox', { name: 'Question text' }),
    'Q?',
  );
  await harness.user.click(field.getByRole('button', { name: 'Add' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
}

/** The id the codebook now files an attribute of this name under. */
function variableIdByName(
  harness: StageEditorHarness,
  name: string,
): string | undefined {
  const definition =
    harness.host.getSnapshot().protocolSections[FAMILY_MEMBER_SECTION];
  const variables = isRecord(definition) ? definition.variables : undefined;
  if (!isRecord(variables)) return undefined;
  return Object.entries(variables).find(
    ([, variable]) => isRecord(variable) && variable.name === name,
  )?.[0];
}

describe('the pedigree’s own configuration', () => {
  it('opens on the stage as the protocol holds it', async () => {
    const harness = renderStageEditor(openFixture());

    expect(screen.getByRole('radio', { name: 'Fixed framing' })).toBeChecked();
    expect(
      screen.getByRole('combobox', { name: 'Fixed framing terminology' }),
    ).toHaveValue('gamete');
    expect(
      screen.getByRole('combobox', { name: 'Grandparent requirement' }),
    ).toHaveValue('off');
    expect(screen.getByRole('radio', { name: 'family member' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'family_edge' })).toBeChecked();
    expect(
      screen.getByRole('combobox', { name: 'Participant identifier' }),
    ).toHaveValue('is_ego');
    await waitFor(() =>
      expect(harness.outline().map((section) => section.title)).toEqual([
        'Pedigree framing',
        'Pedigree boundaries',
        'Family member data',
        'Family member form',
        'Relationship data',
        'Family-building prompt',
        'Nomination prompts',
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

    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Grandparent requirement' }),
      'required',
    );
    await harness.user.click(
      screen.getByRole('radio', { name: 'Let the participant choose' }),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.boundaries).toEqual({
      requireGrandparents: 'required',
      requireChildrenContributors: 'off',
    });
    // The union's participantChoice branch carries no terminology, so the key
    // has to be GONE rather than parked at its old value.
    expect(request?.stageDocument.framing).toEqual({
      mode: 'participantChoice',
    });
  });

  it('refuses to save a pedigree with no family-building prompt', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.user.clear(
      screen.getByRole('textbox', { name: 'Census prompt' }),
    );

    expect(await harness.submit()).toBeNull();
  });

  /**
   * The pedigree's optional introductory screen has no section here yet.
   * `PageContentSection`'s `introScreen` variant now owns exactly the
   * `introScreen.items` this interface holds them under, but it renders the
   * family's own block fields, and the row editor for a content block belongs
   * to the Information stage's family rather than this one.
   *
   * Until that editor can be composed in, this pins the thing that would
   * otherwise be lost silently: a stage that arrives with an intro screen must
   * still leave with one, whether or not anything on screen can edit it.
   */
  it('keeps an intro screen no section on screen edits', async () => {
    const harness = renderStageEditor({
      stage: familyPedigreeStageWith({
        introScreen: {
          items: [
            {
              id: 'intro-1',
              type: 'text',
              content: 'We are going to draw your family.',
            },
          ],
        },
      }),
      sections: pedigreeSections,
    });

    const request = await harness.roundTrip({
      unowned: ['label', 'introScreen'],
    });
    expect(request.stageDocument.introScreen).toEqual({
      items: [
        {
          id: 'intro-1',
          type: 'text',
          content: 'We are going to draw your family.',
        },
      ],
    });
  });

  it('leaves nothing pending when the researcher cancels', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Grandparent requirement' }),
      'required',
    );
    await harness.cancel();

    expect(harness.pendingCommands()).toEqual([]);
  });
});

/**
 * Each slot is exclusive to the interface, or exclusive to a writer class, or
 * pinned to a canonical value set. The picker enforces all three by never
 * offering a refused attribute; the save-time gate is the backstop for a draft
 * that predates the rule.
 */
describe('the attributes a pedigree may bind', () => {
  it('offers only attributes whose values are the ones the interface owns', () => {
    renderStageEditor(openFixture());

    // `relationshipType` and `gameteRole` carry exactly the canonical sets;
    // `isActive` and `isGestationalCarrier` are booleans, so neither picker
    // may offer them.
    expect(optionsOf('Relationship type')).toEqual(['relationshipType']);
    expect(optionsOf('Gamete role')).toEqual(['gameteRole']);
    expect(optionsOf('Biological sex')).toEqual(['biologicalSex']);
  });

  it('never offers an attribute another interface slot already owns', () => {
    renderStageEditor(openFixture());

    // `is_ego` is this pedigree's participant marker, and `fm_name` is its
    // display label — a validated writer. Neither may become the relationship
    // attribute, which keeps only its own committed pick.
    expect(optionsOf('Relationship to participant')).toEqual([
      'fm_relationship_to_ego',
    ]);
    // The display label is a VALIDATED writer, so it excludes the structural
    // slots instead — including the relationship attribute.
    expect(optionsOf('Display label')).toEqual(['fm_name']);
  });

  /**
   * A structural picker's exclusions are built from the saved protocol AND
   * from this stage's own unsaved draft, so a form field added in this session
   * takes its attribute off the structural pickers at once — before the
   * researcher can pick something the save would then refuse.
   *
   * The field invents its attribute rather than picking one, because every
   * boolean already on the node type is written unvalidated somewhere — this
   * pedigree's own participant marker, and the narrative pedigree's disease —
   * and the shared form-fields picker refuses all of those. The codebook write
   * lands as the row is committed, so the new attribute reaches the structural
   * picker while the field that collects it is still unsaved: exactly the
   * window under test.
   *
   * The whole list is asserted rather than the absence alone: an exclusion
   * written against the wrong list would empty the picker, and an
   * absence-only claim would call that a pass.
   */
  it('never offers a structural slot an attribute this stage’s own form collects', async () => {
    const harness = renderStageEditor(openFixture());

    // The fixture pedigree asks nothing about each family member, so the form
    // is switched off until the researcher turns it on.
    await harness.user.click(
      screen.getByRole('switch', { name: 'Family member form' }),
    );
    await addFormFieldInventing(harness, 'unwell', 'boolean');

    const unwell = variableIdByName(harness, 'unwell');
    expect(unwell).toBeDefined();

    // The two booleans this node type had before the field was added, and not
    // the one it now collects.
    await waitFor(() =>
      expect(optionsOf('Participant identifier')).toEqual([
        'is_ego',
        'hasConditionX',
      ]),
    );
  });

  /**
   * The other direction, which the shared form-fields picker owns: a family
   * member form may not collect an attribute the pedigree derives from the
   * tree the participant draws, because the pedigree writes those without any
   * validation and an export would mix checked and unchecked answers under one
   * name. `fm_name` is the display label — collected THROUGH a form field, so
   * it stays on offer.
   */
  it('never offers the family member form an attribute the pedigree derives', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.user.click(
      screen.getByRole('switch', { name: 'Family member form' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new form field' }),
    );
    const field = within(await screen.findByRole('dialog'));
    const offered = [
      ...field
        .getByRole('combobox', { name: 'Attribute' })
        .querySelectorAll('option'),
    ].map((option) => option.value);

    expect(offered).toContain('fm_name');
    expect(offered).not.toContain('is_ego');
    expect(offered).not.toContain('fm_relationship_to_ego');
    expect(offered).not.toContain('biologicalSex');
  });

  /**
   * The other half of the rule the test above states, in the window where only
   * this session knows about it.
   *
   * The form picker's exclusions are built from the SAVED protocol, so an
   * attribute a structural slot was bound to in this session is invisible to
   * it. The pedigree writes that attribute from the tree the participant
   * draws, without validation; collecting it through a form field as well is
   * the mix the whole rule exists to stop.
   *
   * The pedigree closes the window by handing the shared section its three
   * unvalidated slots' live values as `draftUnvalidatedVariables`, which is
   * the mirror of the `draftConflicting` the slots already take.
   */
  it('never offers the family member form an attribute a slot took this session', async () => {
    const harness = renderStageEditor(openFixture());
    addFamilyMemberVariable(harness, 'kinship', {
      name: 'kinship',
      type: 'text',
    });
    await harness.user.selectOptions(
      await screen.findByRole('combobox', {
        name: 'Relationship to participant',
      }),
      'kinship',
    );

    await harness.user.click(
      screen.getByRole('switch', { name: 'Family member form' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new form field' }),
    );
    const field = within(await screen.findByRole('dialog'));
    const offered = [
      ...field
        .getByRole('combobox', { name: 'Attribute' })
        .querySelectorAll('option'),
    ].map((option) => option.value);

    expect(offered).not.toContain('kinship');
    // Not an empty picker: the display label's own attribute is collected
    // through a form field, so it is still on offer.
    expect(offered).toContain('fm_name');
  });

  /**
   * The same window, seen from the display label — the pedigree's one
   * VALIDATED slot. It may not take an attribute a structural slot claimed in
   * this session either, and its picker has to say so by not offering it
   * rather than by letting the save refuse the pick afterwards.
   */
  it('never offers the display label an attribute a slot took this session', async () => {
    const harness = renderStageEditor(openFixture());
    addFamilyMemberVariable(harness, 'kinship', {
      name: 'kinship',
      type: 'text',
    });
    // On offer while nothing has claimed it, so the exclusion below is a
    // change rather than a list that was always this short.
    await waitFor(() =>
      expect(optionsOf('Display label')).toEqual(['fm_name', 'kinship']),
    );

    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Relationship to participant' }),
      'kinship',
    );

    await waitFor(() =>
      expect(optionsOf('Display label')).toEqual(['fm_name']),
    );
  });

  /**
   * What is left for the gate once the picker offers nothing it refuses: a
   * slot already holding an attribute when the conflicting writer appears.
   * The display label is bound to a new attribute, and the relationship slot —
   * whose own picker cannot see the label's unsaved pick — then takes it too.
   *
   * The words matter as much as the refusal. The display label names the
   * attribute each family member is SHOWN by; told that it "cannot be used as
   * a form field", a researcher goes looking for a form field they never
   * added.
   */
  it('refuses a display label another slot in this stage has since taken', async () => {
    const harness = renderStageEditor(openFixture());
    addFamilyMemberVariable(harness, 'preferred_name', {
      name: 'preferred_name',
      type: 'text',
    });

    // The label takes it first, so it escapes its own picker's exclusion as
    // the pick the control is already holding.
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Display label' }),
      'preferred_name',
    );
    // The relationship slot's own picker reads the saved protocol and this
    // stage's form; neither knows the display label just took this attribute.
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Relationship to participant' }),
      'preferred_name',
    );

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        '"preferred_name" is written without validation by another slot in this stage, so it cannot also be collected here (the values that slot writes bypass this attribute’s validation)',
      ),
    ).toBeInTheDocument();
  });
});

/**
 * The family member form is a list the stage keeps NESTED, at
 * `nodeConfig.form`, and it is edited as one — insert this row, move that one,
 * remove the third — rather than by replacing the node configuration around
 * it.
 *
 * What that buys is what the commands SAY. A whole-value `set` on `nodeConfig`
 * can say only "the node configuration is now this", so it needs every sibling
 * slot mounted to say even that much — which is why an editor without them
 * used to have to mount them anyway — and it carries nothing a merge could act
 * on. `insertItem`/`moveItem`/`removeItem` at `['nodeConfig','form']` name the
 * row and the list it belongs to, which is the material a rebase would need.
 *
 * What the session then DOES with them is a separate question this test does
 * not answer, and one the session's own suites do: `listArrivals` and
 * `session` cover rebasing a pending batch onto a base a collaborator has
 * moved, and the whole-key `set` an undo or a submit used to derive from a
 * changed draft. What is asserted here is only the commands the section emits.
 */
describe('the way a family member form reaches the document', () => {
  it('commits an added, moved and removed field as that row’s own edit', async () => {
    const harness = renderStageEditor(openWithFamilyMemberForm());

    // Added. Every boolean this node type already has is written unvalidated
    // somewhere — this pedigree's own slots, and the narrative pedigree's
    // disease — so the field invents its attribute rather than picking one.
    await addFormFieldInventing(harness, 'unwell', 'boolean');
    await waitFor(() => expect(formRows(harness)).toHaveLength(2));

    const unwell = variableIdByName(harness, 'unwell');
    if (unwell === undefined) throw new Error('the attribute was not created');
    // The row identity the list stamps on a row it creates, which is a fresh
    // uuid and cannot be written down here.
    const added = {
      id: expect.any(String) as unknown as string,
      variable: unwell,
      prompt: 'Q?',
    };

    // Moved, through the keyboard half of the drag handle — the same operation
    // a pointer drag commits.
    const handle = await screen.findByRole('button', {
      name: 'Reorder field 2 of 2',
    });
    handle.focus();
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    await waitFor(() =>
      expect(
        formRows(harness).map((row) =>
          isRecord(row) ? row.variable : undefined,
        ),
      ).toEqual([unwell, 'fm_name']),
    );

    // Removed: the row's own affordance, then the confirmation that carries
    // the same words.
    await harness.user.click(
      (await screen.findAllByRole('button', { name: 'Remove field' }))[1]!,
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove field' }),
    );
    await waitFor(() => expect(formRows(harness)).toHaveLength(1));

    // Each one says WHICH row it was, and where the list it belongs to lives.
    expect(commandsOf(harness)).toEqual([
      { op: 'insertItem', key: ['nodeConfig', 'form'], index: 1, item: added },
      { op: 'moveItem', key: ['nodeConfig', 'form'], from: 1, to: 0 },
      { op: 'removeItem', key: ['nodeConfig', 'form'], index: 1 },
    ]);

    // And the slots beside the list are exactly as the pedigree held them: no
    // section had to mount, or rewrite, a sibling to move one row.
    expect((await harness.submit())?.stageDocument.nodeConfig).toEqual({
      ...FIXTURE_NODE_CONFIG,
      form: [added],
    });
  });
});

/**
 * Nomination prompts are the pedigree's optional list, edited through a row
 * dialog. The fixture protocol has none, so the rows are seeded here.
 */
describe('the pedigree’s nomination prompts', () => {
  it('saves a list it opened, unchanged', async () => {
    const harness = renderStageEditor(openWithNominationPrompts());

    // The stage's name belongs to a section this mount does not include.
    await harness.roundTrip({ unowned: ['label'] });
  });

  it('edits a prompt through its own dialog', async () => {
    const harness = renderStageEditor(openWithNominationPrompts());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit nomination prompt' }),
    );
    const prompt = within(await screen.findByRole('dialog'));
    const text = prompt.getByRole('textbox', { name: 'Prompt text' });
    await harness.user.clear(text);
    await harness.user.type(text, 'Who else?');
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // The rendered markdown nests, so the question matches the paragraph and
    // the row around it.
    await screen.findAllByText('Who else?');
    const request = await harness.submit();
    expect(request?.stageDocument.nominationPrompts).toEqual([
      {
        id: 'nomination-1',
        text: 'Who else?',
        variable: 'hasConditionX',
      },
    ]);
  });

  it('never offers an attribute the pedigree derives', async () => {
    const harness = renderStageEditor(openWithNominationPrompts());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit nomination prompt' }),
    );
    await screen.findByRole('combobox', { name: 'Attribute' });
    // `is_ego` is the pedigree's participant marker, and a nomination toggle
    // fills no interface slot of its own, so it is out of bounds here even
    // though it is a boolean of the right node type.
    expect(optionsOf('Attribute')).toEqual(['hasConditionX']);
  });

  it('is switched off entirely when the pedigree asks nothing', async () => {
    const harness = renderStageEditor(openFixture());

    await waitFor(() =>
      expect(
        harness
          .outline()
          .find((section) => section.title === 'Nomination prompts')?.state,
      ).toBe('Switched off'),
    );
    const request = await harness.submit();
    expect(
      Object.hasOwn(request?.stageDocument ?? {}, 'nominationPrompts'),
    ).toBe(false);
  });
});

/**
 * The codebook is read from the editor's own protocol context, so a change made
 * anywhere else appears here without this section doing anything — and, above
 * all, without it writing that change back as if this session had made it.
 */
describe('a codebook that changes while the pedigree is open', () => {
  it('offers an attribute a collaborator added, without echoing a command', async () => {
    const harness = renderStageEditor(openFixture());
    expect(harness.pendingCommands()).toEqual([]);
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    harness.receiveCodebookUpdate({
      node: {
        family_member: {
          name: 'family member',
          color: 'node-color-seq-2',
          icon: 'add-a-person',
          shape: { default: 'circle' },
          variables: {
            fm_name: { name: 'fm_name', type: 'text', component: 'Text' },
            is_ego: { name: 'is_ego', type: 'boolean' },
            fm_relationship_to_ego: {
              name: 'fm_relationship_to_ego',
              type: 'text',
            },
            biologicalSex: {
              name: 'biologicalSex',
              type: 'categorical',
              options: [
                { value: 'female', label: 'Female' },
                { value: 'male', label: 'Male' },
                {
                  value: 'intersex',
                  label: 'Intersex or a variation in sex characteristics',
                },
                { value: 'unknown', label: 'Don’t know' },
                { value: 'preferNotToSay', label: 'Prefer not to say' },
              ],
            },
            hasConditionX: { name: 'hasConditionX', type: 'boolean' },
            fm_nickname: { name: 'fm_nickname', type: 'text' },
          },
        },
      },
    });

    await waitFor(() =>
      expect(optionsOf('Display label')).toContain('fm_nickname'),
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
    // The researcher's own picks are untouched by someone else's addition.
    expect(screen.getByRole('combobox', { name: 'Display label' })).toHaveValue(
      'fm_name',
    );
  });

  it('reruns validation against the arriving codebook, and says whose change it was', async () => {
    const harness = renderStageEditor(openFixture());

    harness.receiveCodebookUpdate({ node: { family_member: null } });

    await waitFor(() => {
      const { validation, attribution } = harness.session.getSnapshot();
      expect(validation.status).not.toBe('valid');
      expect(attribution).toBeDefined();
    });
  });
});

describe('creating an attribute a slot needs without leaving the stage', () => {
  it('puts the attribute in the codebook as one edit, and binds it here', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.user.click(
      screen.getByRole('button', {
        name: 'Create a new display label attribute',
      }),
    );
    // Scoped to the dialog: `screen` would compute an accessible name for
    // every control in the editor behind it to answer a question about one
    // inside it.
    const creator = within(await screen.findByRole('dialog'));
    await harness.user.type(
      creator.getByRole('textbox', { name: 'Attribute name' }),
      'nickname',
    );
    const submissions = vi.spyOn(harness.host, 'submit');
    await harness.user.click(
      creator.getByRole('button', { name: 'Create attribute' }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Display label' }),
      ).not.toHaveValue('fm_name'),
    );
    // One compound edit, touching one section: the whole attribute reaches the
    // codebook at once, or none of it does.
    expect(submissions).toHaveBeenCalledTimes(1);
    expect(
      submissions.mock.calls[0]?.[0].edits.map((edit) => edit.sectionId),
    ).toEqual([FAMILY_MEMBER_SECTION]);
    // And the slot now points at the attribute the codebook now holds.
    const created = variableIdByName(harness, 'nickname');
    expect(created).toEqual(expect.any(String));
    expect(screen.getByRole('combobox', { name: 'Display label' })).toHaveValue(
      created,
    );
  });

  it('locks a slot’s canonical values so a researcher cannot edit them', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.user.click(
      screen.getByRole('button', {
        name: 'Create a new relationship type attribute',
      }),
    );

    await screen.findByRole('textbox', { name: 'Attribute name' });
    // EXACTLY the schema's own set, in its own order: the protocol refuses an
    // attribute bound to this slot whose values differ, so seeding anything
    // else would create an attribute the picker then hides and the schema then
    // rejects. Compared against the schema's export rather than a copy, so the
    // two cannot drift.
    const table = screen.getByRole('table', {
      name: /managed by the interface and cannot be changed/i,
    });
    expect(
      [...table.querySelectorAll('tbody tr')].map((row) =>
        [...row.querySelectorAll('td')].map(
          (cell) => cell.textContent?.trim() ?? '',
        ),
      ),
    ).toEqual(
      RELATIONSHIP_TYPE_OPTIONS.map((option) => [option.label, option.value]),
    );
    // And no way to change or add to them.
    expect(
      screen.queryByRole('button', { name: 'Add option' }),
    ).not.toBeInTheDocument();
  });

  it('is not offered to a spectator', () => {
    renderStageEditor({ ...openFixture(), readOnly: true });

    expect(
      screen.queryByRole('button', {
        name: 'Create a new display label attribute',
      }),
    ).not.toBeInTheDocument();
  });
});

/** Every attribute the host currently files under the pedigree's node type. */
function familyMemberVariables(
  harness: StageEditorHarness,
): Record<string, unknown> {
  const definition =
    harness.host.getSnapshot().protocolSections[FAMILY_MEMBER_SECTION];
  const variables = isRecord(definition) ? definition.variables : undefined;
  return isRecord(variables) ? variables : {};
}

/** Opens one already-saved form field's dialog, and answers with the dialog. */
async function openFormField(
  harness: StageEditorHarness,
  index: number,
): Promise<ReturnType<typeof within>> {
  const trigger = screen.getAllByRole('button', { name: 'Edit field' })[index];
  if (trigger === undefined) {
    throw new Error(`The form has no field ${index} to edit.`);
  }
  await harness.user.click(trigger);
  return within(await screen.findByRole('dialog'));
}

/** Adds one value to the attribute list the codebook editor is showing. */
async function addOption(
  harness: StageEditorHarness,
  position: number,
  label: string,
  value: string,
): Promise<void> {
  await harness.user.click(screen.getByRole('button', { name: 'Add option' }));
  await harness.user.type(
    screen.getByRole('textbox', { name: `Option ${position} label` }),
    label,
  );
  await harness.user.type(
    screen.getByRole('textbox', { name: `Option ${position} value` }),
    value,
  );
}

/**
 * The family member form is the shared `FormFieldsSection`, so what a field's
 * attribute HOLDS is authored from the field that collects it — the values a
 * participant chooses between, and the settings the chosen control takes.
 *
 * Asserted here as well as in that section's own suite because the pedigree is
 * the one caller that mounts it somewhere other than `form.fields`: its fields
 * live at `nodeConfig.form`, and its node type is named at `nodeConfig.type`
 * rather than by a `subject` of the stage's own. Everything below writes to the
 * codebook rather than to the stage, so a pedigree wired to the wrong subject
 * would author a perfectly good attribute on the wrong node type — which the
 * stage-shaped assertions in this file cannot see.
 */
describe('what a family member form field’s attribute holds', () => {
  /**
   * The node configuration alone, which is where the form lives.
   *
   * Every journey below opens two nested dialogs and waits on a compound edit,
   * and each of the pedigree's other five sections is a whole editor that
   * re-renders on every keystroke of it. Nothing here reads or writes a key
   * any of them own, and nothing here submits the stage — the claims are about
   * the codebook and about the one list the fields live in.
   */
  const openNodeConfig = () => ({
    stage: familyPedigreeStageWith({
      nodeConfig: {
        ...FIXTURE_NODE_CONFIG,
        form: [{ variable: 'fm_name', prompt: 'What do they go by?' }],
      },
    }),
    sections: <PedigreeNodeConfigurationSection />,
  });

  it('creates a categorical field together with the values it offers', async () => {
    const harness = renderStageEditor(openNodeConfig());

    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new form field' }),
    );
    const field = within(await screen.findByRole('dialog'));
    await harness.user.selectOptions(
      field.getByRole('combobox', { name: 'Attribute' }),
      '__create_new_attribute__',
    );
    // An attribute participants choose from IS its values, so the name box
    // gives way to the editor that authors both.
    await harness.user.selectOptions(
      await field.findByRole('combobox', { name: 'Kind of answer' }),
      'categorical',
    );
    await harness.user.click(
      field.getByRole('button', {
        name: 'Create this attribute and its values',
      }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Attribute name' }),
      'household_role',
    );
    await addOption(harness, 1, 'Parent', 'parent');
    await addOption(harness, 2, 'Sibling', 'sibling');
    await harness.user.click(
      screen.getByRole('button', { name: 'Create attribute' }),
    );

    const created = await waitFor(() => {
      const entry = Object.entries(familyMemberVariables(harness)).find(
        ([, variable]) =>
          isRecord(variable) && variable.name === 'household_role',
      );
      if (entry === undefined) throw new Error('the attribute was not created');
      return entry;
    });
    // On the pedigree's OWN node type, with both values.
    expect(created[1]).toMatchObject({
      type: 'categorical',
      options: [
        { label: 'Parent', value: 'parent' },
        { label: 'Sibling', value: 'sibling' },
      ],
    });

    // And the field is now bound to what was just created, so finishing the
    // row records a question against it rather than against nothing.
    await harness.user.selectOptions(
      await field.findByRole('combobox', { name: 'Input control' }),
      'CheckboxGroup',
    );
    await harness.user.type(
      field.getByRole('textbox', { name: 'Question text' }),
      'Q?',
    );
    await harness.user.click(field.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(formRows(harness)).toEqual([
      { variable: 'fm_name', prompt: 'What do they go by?' },
      {
        id: expect.any(String) as unknown as string,
        variable: created[0],
        prompt: 'Q?',
      },
    ]);
  });

  it('writes a date field’s settings onto the attribute it collects', async () => {
    const harness = renderStageEditor(openNodeConfig());

    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new form field' }),
    );
    const creating = within(await screen.findByRole('dialog'));
    await harness.user.selectOptions(
      creating.getByRole('combobox', { name: 'Attribute' }),
      '__create_new_attribute__',
    );
    await harness.user.selectOptions(
      await creating.findByRole('combobox', { name: 'Kind of answer' }),
      'datetime',
    );
    await harness.user.type(
      await creating.findByRole('textbox', { name: 'Attribute name' }),
      'diagnosed_on',
    );
    await harness.user.selectOptions(
      await creating.findByRole('combobox', { name: 'Input control' }),
      'DatePicker',
    );
    await harness.user.type(
      creating.getByRole('textbox', { name: 'Question text' }),
      'Q?',
    );
    await harness.user.click(creating.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // Two steps, because the settings belong to an attribute: there is nothing
    // to configure until the attribute exists, and it is the row's save that
    // creates it.
    const diagnosedOn = variableIdByName(harness, 'diagnosed_on');
    if (diagnosedOn === undefined) {
      throw new Error('the attribute was not created');
    }
    const editing = await openFormField(harness, 1);
    await harness.user.click(
      await editing.findByRole('button', {
        name: 'Set what this field accepts',
      }),
    );
    await screen.findByRole('button', { name: 'Save attribute' });
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Date resolution' }),
      'year',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save attribute' }),
    );

    // Written on the family member's attribute, beside the control they were
    // authored for — not on the form row, which holds only its question.
    await waitFor(() =>
      expect(
        isRecord(familyMemberVariables(harness)[diagnosedOn])
          ? familyMemberVariables(harness)[diagnosedOn]
          : {},
      ).toMatchObject({
        name: 'diagnosed_on',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year' },
      }),
    );
    expect(formRows(harness)[1]).toEqual({
      id: expect.any(String) as unknown as string,
      variable: diagnosedOn,
      prompt: 'Q?',
    });
  });
});

/**
 * The node type is what every attribute this stage binds means anything
 * against, so choosing a different one invalidates all of them at once.
 *
 * The throwing away goes through `useDiscardStageValues`, which is the one
 * seam a reset goes through: ONE batch, carrying the type that caused it in
 * front of the values it cost, and the form emptied afterwards. Each half of
 * that is a claim below, because a form-only clear passes the first two
 * assertions of any test written about what is on screen.
 */
describe('a pedigree whose node type changes', () => {
  /** The one radio that is not already chosen, named for its type. */
  const chooseNodeType = async (harness: StageEditorHarness, name: string) => {
    await harness.user.click(screen.getByRole('radio', { name }));
  };

  const nodeConfigOf = (
    harness: StageEditorHarness,
  ): Record<string, unknown> => {
    const nodeConfig =
      harness.session.getSnapshot().editedSection.fields.nodeConfig;
    return isRecord(nodeConfig) ? nodeConfig : {};
  };

  /**
   * The whole decision, in the order it happened: this type was chosen, and
   * therefore these were thrown away.
   *
   * The type is in the batch because it is an ordinary field, which otherwise
   * waits for the submit that flushes it — so a host applying this session's
   * edits live would be given a pedigree still describing `family_member` with
   * none of the attributes that described it, which is a stage nobody
   * authored. `nodeConfig.type` itself is not among the unsets: the researcher
   * is changing it, not losing it.
   *
   * ONE batch even though TWO sections reset on this type: the node
   * configuration lists every path the type invalidates, and the nomination
   * prompts section names the same type in its own `resetOn` so that its
   * switch goes off with them. The node configuration's reset runs first — it
   * is the earlier section, and passive effects run in tree order — so by the
   * time the prompts section looks there is nothing left for it to say: the
   * prompts are already gone from the draft, and the type it would name as its
   * cause is the type the draft already holds. A reset with nothing to discard
   * still sends its cause; a reset whose cause the draft already agrees with
   * has no cause to send. The two compose instead of costing the researcher
   * two steps of undo.
   */
  it('carries the chosen type and everything it invalidated in one batch', async () => {
    const harness = renderStageEditor(openWithNominationPrompts());

    await chooseNodeType(harness, 'person');

    await waitFor(() => expect(harness.pendingCommands()).toHaveLength(1));
    expect(commandsOf(harness)).toEqual([
      { op: 'set', key: ['nodeConfig', 'type'], value: 'person' },
      { op: 'unset', key: ['nodeConfig', 'biologicalSexVariable'] },
      { op: 'unset', key: ['nodeConfig', 'egoVariable'] },
      { op: 'unset', key: ['nodeConfig', 'nodeLabelVariable'] },
      { op: 'unset', key: ['nodeConfig', 'relationshipVariable'] },
      { op: 'unset', key: 'nominationPrompts' },
    ]);
  });

  /**
   * The prompts were a capability the researcher had switched ON, and the type
   * change takes every one of them away. The switch has to go with them.
   *
   * Left standing it says the section is configured while the list behind it
   * is empty, and the outline reads the same fact the same way: an optional
   * section nobody has filled in reported as finished, which is the one thing
   * an outline is for and the one thing it must not get wrong. The researcher
   * would have to open the section and close it again to find out.
   *
   * `resetOn` is the seam that says it: the section names the path its content
   * only means anything against, and the switch, the panel and the discard all
   * follow from that one fact rather than from three sections agreeing.
   */
  it('switches the nomination prompts off rather than calling an empty section finished', async () => {
    const harness = renderStageEditor(openWithNominationPrompts());
    expect(
      await screen.findByRole('switch', { name: 'Nomination prompts' }),
    ).toBeChecked();
    await waitFor(() =>
      expect(outlineStateOf(harness, 'Nomination prompts')).toBe('Finished'),
    );

    await chooseNodeType(harness, 'person');

    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Nomination prompts' }),
      ).not.toBeChecked(),
    );
    expect(outlineStateOf(harness, 'Nomination prompts')).toBe('Switched off');
  });

  /**
   * And the other side of it, which is what the arrival guard in
   * `useOnResearcherChange` exists for: an undo moves the same value, so a
   * reset that acted on the value merely MOVING would throw the prompts away
   * again the instant the undo brought them back — leaving the researcher able
   * to restore the type and never the prompts.
   */
  it('keeps the prompts an undo restores, and switches the section back on', async () => {
    const harness = renderStageEditor(openWithNominationPrompts());
    await chooseNodeType(harness, 'person');
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Nomination prompts' }),
      ).not.toBeChecked(),
    );

    act(() => {
      harness.session.undo();
    });

    await screen.findByText('Who has been unwell?');
    expect(
      screen.getByRole('switch', { name: 'Nomination prompts' }),
    ).toBeChecked();
    expect(outlineStateOf(harness, 'Nomination prompts')).toBe('Finished');
  });

  /**
   * The defect a form-only clear leaves behind, stated as what the researcher
   * sees.
   *
   * A bound list resolves every insertion against the draft the SESSION holds
   * — that is what stops a row dialog's save from landing on whichever row has
   * since moved into its position — so a clear the session was never told
   * about leaves the old rows there to be resolved against, and the next
   * prompt the researcher writes arrives beside a prompt about the type they
   * left, asking for an attribute that type no longer has.
   */
  it('does not bring a prompt about the old type back with the next one added', async () => {
    const harness = renderStageEditor(openWithNominationPrompts());

    await chooseNodeType(harness, 'person');
    await waitFor(() =>
      expect(
        screen.queryByText('Who has been unwell?'),
      ).not.toBeInTheDocument(),
    );

    // The section went off with the prompts it lost, so writing another one
    // starts by asking for it back. See "switches the nomination prompts off"
    // below.
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Nomination prompts' }),
    );
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Create new nomination prompt',
      }),
    );
    const prompt = within(await screen.findByRole('dialog'));
    await harness.user.type(
      prompt.getByRole('textbox', { name: 'Prompt text' }),
      'Who?',
    );
    await harness.user.selectOptions(
      prompt.getByRole('combobox', { name: 'Attribute' }),
      'highlighted',
    );
    await harness.user.click(prompt.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    expect(
      harness.session.getSnapshot().editedSection.fields.nominationPrompts,
    ).toEqual([
      {
        id: expect.any(String) as unknown as string,
        text: 'Who?',
        variable: 'highlighted',
      },
    ]);
  });

  /**
   * Undo is the researcher's way back from a type they did not mean, and it
   * has to bring back BOTH halves: a stage holding the old type's attributes
   * under the new type is one nobody authored, and so is the new type with
   * nothing bound to it. One batch is what makes that a single step.
   */
  it('comes back whole, type included, when the session undoes it', async () => {
    const harness = renderStageEditor(openWithNominationPrompts());
    await chooseNodeType(harness, 'person');
    await waitFor(() => expect(nodeConfigOf(harness).type).toBe('person'));

    act(() => {
      harness.session.undo();
    });

    await waitFor(() =>
      expect(nodeConfigOf(harness)).toEqual(FIXTURE_NODE_CONFIG),
    );
    expect(
      harness.session.getSnapshot().editedSection.fields.nominationPrompts,
    ).toEqual(NOMINATION_ROWS);
    // And on screen, not only in the session: the controls are re-seeded from
    // an arrival this form did not make.
    expect(
      await screen.findByRole('radio', { name: 'family member' }),
    ).toBeChecked();
    await screen.findByText('Who has been unwell?');
  });
});

/**
 * The framing is a discriminated union, so choosing a participant choice is
 * also the decision to lose the terminology a fixed framing carried.
 *
 * The two halves belong in ONE batch: the mode is an ordinary field that waits
 * for the submit that flushes it, so a clear sent alone would reach a host
 * applying this session's edits live as a pedigree still claiming a fixed
 * framing with nothing to fix it to — a stage nobody authored, and one the
 * union refuses. And the clear has to reach the session at all, or the draft
 * goes on holding a terminology the union's chosen branch has no room for.
 *
 * The switch back is asked about the DRAFT rather than about the control,
 * because the control cannot fail it: a cleared field parks its emptiness in
 * the form store, which outlives the field and is what a re-mount is restored
 * from. That record is only as good as the form holding it; the draft is what
 * a re-opened editor, a live-applying host and the session's own undo read.
 */
describe('the batch a framing change makes', () => {
  /** Seeded away from the schema's canonical framing, so a fallback shows. */
  const openWithGenderedFraming = () => ({
    stage: familyPedigreeStageWith({
      framing: { mode: 'fixed', value: 'gendered' },
    }),
    sections: pedigreeSections,
  });

  const framingOf = (harness: StageEditorHarness): Record<string, unknown> => {
    const framing = harness.session.getSnapshot().editedSection.fields.framing;
    return isRecord(framing) ? framing : {};
  };

  const terminology = () =>
    screen.findByRole('combobox', { name: 'Fixed framing terminology' });

  const chooseMode = async (harness: StageEditorHarness, name: string) => {
    await harness.user.click(screen.getByRole('radio', { name }));
  };

  it('carries the mode it chose and the terminology it cost in one batch', async () => {
    const harness = renderStageEditor(openWithGenderedFraming());
    expect(await terminology()).toHaveValue('gendered');

    await chooseMode(harness, 'Let the participant choose');

    await waitFor(() => expect(harness.pendingCommands()).toHaveLength(1));
    // The mode first, so the batch reads as what happened: this was chosen,
    // and therefore this was thrown away.
    expect(commandsOf(harness)).toEqual([
      { op: 'set', key: ['framing', 'mode'], value: 'participantChoice' },
      { op: 'unset', key: ['framing', 'value'] },
    ]);
  });

  it('leaves the terminology gone from the draft when the researcher goes back to a fixed framing', async () => {
    const harness = renderStageEditor(openWithGenderedFraming());
    await terminology();

    await chooseMode(harness, 'Let the participant choose');
    await waitFor(() =>
      expect(
        screen.queryByRole('combobox', { name: 'Fixed framing terminology' }),
      ).not.toBeInTheDocument(),
    );
    await chooseMode(harness, 'Fixed framing');

    expect(framingOf(harness)).not.toHaveProperty('value');
    expect(await terminology()).not.toHaveValue('gendered');
  });

  /**
   * Undo is the researcher's way back from a framing they did not mean, and it
   * has to bring back BOTH halves: a fixed framing with no terminology is not
   * a framing the union accepts, and neither is a participant choice carrying
   * one. One batch is what makes that a single step.
   */
  it('comes back whole, mode included, when the session undoes it', async () => {
    const harness = renderStageEditor(openWithGenderedFraming());
    await terminology();
    await chooseMode(harness, 'Let the participant choose');
    // What the undo below has to find. A clear that never reached the session
    // leaves the terminology in the draft, and everything after the undo would
    // then describe a value nothing ever took away.
    await waitFor(() => expect(framingOf(harness)).not.toHaveProperty('value'));

    act(() => {
      harness.session.undo();
    });

    await waitFor(() =>
      expect(framingOf(harness)).toEqual({ mode: 'fixed', value: 'gendered' }),
    );
    // And on screen, not only in the session: the controls are re-seeded from
    // an arrival this form did not make.
    expect(screen.getByRole('radio', { name: 'Fixed framing' })).toBeChecked();
    expect(await terminology()).toHaveValue('gendered');
  });
});
