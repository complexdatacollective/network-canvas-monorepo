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

/** See `FormFieldsSection`'s own `NEW_VARIABLE` sentinel. */
const CREATE_NEW_ATTRIBUTE = '#create-new-attribute';

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

/**
 * The same configured pedigree, under an id no other stage reads.
 *
 * The fixture's `narrative-pedigree-1` draws its diseases through
 * `family-pedigree-1`'s node type, and that dependency REFUSES a node type
 * change — so every test below about what a type change costs has to be run
 * over a pedigree nothing depends on, or it would be testing the refusal
 * instead. The refusal has tests of its own, over the fixture's own pedigree.
 */
const UNREAD_PEDIGREE_ID = 'family-pedigree-nothing-reads';

const openUnreadWithNominationPrompts = () => ({
  stage: {
    ...familyPedigreeStageWith({ nominationPrompts: NOMINATION_ROWS }),
    id: UNREAD_PEDIGREE_ID,
  },
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

/** The node configuration as the session holds it right now. */
const nodeConfigOf = (harness: StageEditorHarness): Record<string, unknown> => {
  const nodeConfig =
    harness.session.getSnapshot().editedSection.fields.nodeConfig;
  return isRecord(nodeConfig) ? nodeConfig : {};
};

/** The family member form as the session holds it right now. */
const formRows = (harness: StageEditorHarness): unknown[] => {
  const form = nodeConfigOf(harness).form;
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

/** The other node type the fixture carries, which a pedigree can move to. */
const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });

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
 * The family member type WITHOUT one of its attributes, as a collaborator's
 * change.
 *
 * The mirror of `addFamilyMemberVariable`: it reaches the host first and the
 * session under the revision the host issued, so what the editor is looking at
 * afterwards is a protocol that really lost the attribute rather than a story
 * the session alone has been told.
 */
const removeFamilyMemberVariable = (
  harness: StageEditorHarness,
  variableId: string,
): void => {
  const section =
    harness.session.getSnapshot().protocolSections[FAMILY_MEMBER_SECTION];
  const variables = isRecord(section?.variables) ? section.variables : {};
  if (!Object.hasOwn(variables, variableId)) {
    throw new Error(
      `"family_member" has no "${variableId}" attribute, so removing one proves nothing.`,
    );
  }
  const { [variableId]: _gone, ...rest } = variables;
  harness.receiveCodebookUpdate({
    node: { family_member: { ...section, variables: rest } },
  });
};

const NARRATIVE_PEDIGREE_SECTION = sectionId({
  kind: 'stage',
  stageId: 'narrative-pedigree-1',
});

/**
 * The fixture's narrative pedigree, repointed at another pedigree as a
 * collaborator's change.
 *
 * The same two-ended arrival `receiveCodebookUpdate` makes, for a STAGE
 * section rather than a codebook one: the host issues the revision and the
 * session is told about it under that revision, so this is one protocol seen
 * from both ends. A narrative pedigree naming a pedigree is what refuses that
 * pedigree's node type change, and it is a thing a collaborator can do at any
 * moment — including while the researcher is being asked about a change.
 */
/**
 * A node type DELETED by a collaborator.
 *
 * The same two-ended arrival `receiveCodebookUpdate` makes for a redefinition,
 * with `null` standing for the section that has gone: the host issues the
 * revision and the session is told about it under that revision, so the type
 * really leaves the protocol both ends are looking at rather than being a
 * story the session alone has been told. Deleting a type nothing has bound yet
 * is something a collaborator can do at any moment — including while the
 * researcher is being asked about a change onto it.
 */
const deleteNodeType = (harness: StageEditorHarness, typeId: string): void => {
  const section =
    harness.session.getSnapshot().protocolSections[
      sectionId({ kind: 'codebookNode', typeId })
    ];
  if (section === undefined) {
    throw new Error(
      `the fixture protocol has no "${typeId}" node type, so deleting one proves nothing.`,
    );
  }
  harness.receiveCodebookUpdate({ node: { [typeId]: null } });
};

const readNarrativePedigreeFrom = (
  harness: StageEditorHarness,
  sourceStageId: string,
): void => {
  const section =
    harness.session.getSnapshot().protocolSections[NARRATIVE_PEDIGREE_SECTION];
  if (section === undefined) {
    throw new Error('the fixture protocol has no "narrative-pedigree-1" stage');
  }
  if (section.sourceStageId === sourceStageId) {
    throw new Error(
      `"narrative-pedigree-1" already reads "${sourceStageId}", so pointing it there proves nothing.`,
    );
  }
  const applied = harness.host.receiveAuthoritativeSections({
    [NARRATIVE_PEDIGREE_SECTION]: { ...section, sourceStageId },
  });
  act(() => {
    harness.session.receiveAuthoritativeUpdate({
      protocolSections: applied.protocolSections,
      manifestRevision: applied.manifestRevision,
    });
  });
};

/**
 * One attribute of the family member type, REDEFINED by a collaborator.
 *
 * The third thing that can happen to an attribute a control is holding, beside
 * `addFamilyMemberVariable` and `removeFamilyMemberVariable`: it stays, under
 * the same id, describing something else.
 */
const redefineFamilyMemberVariable = (
  harness: StageEditorHarness,
  variableId: string,
  variable: Readonly<Record<string, unknown>>,
): void => {
  const section =
    harness.session.getSnapshot().protocolSections[FAMILY_MEMBER_SECTION];
  const variables = isRecord(section?.variables) ? section.variables : {};
  if (!Object.hasOwn(variables, variableId)) {
    throw new Error(
      `"family_member" has no "${variableId}" attribute, so redefining one proves nothing.`,
    );
  }
  harness.receiveCodebookUpdate({
    node: {
      family_member: {
        ...section,
        variables: { ...variables, [variableId]: variable },
      },
    },
  });
};

/** The id the seeded boolean below is filed under. */
const SEEDED_UNWELL = 'seeded-unwell';

/**
 * A boolean attribute on the pedigree's node type, put there from outside this
 * editor and collectable by a form field.
 *
 * Every boolean the node type already carries is written unvalidated somewhere
 * — this pedigree's own participant marker, and the narrative pedigree's
 * disease — and the shared form-fields picker refuses all of those, so a test
 * that needs a form field collecting a boolean needs an attribute of its own.
 * Filed under an id no stage names, which is what makes it collectable.
 *
 * `component` is one of the two the schema lets a boolean be collected with,
 * because a variable carrying no control at all leaves the dialog asking for
 * one; an entity definition is parsed whole, so a control belonging to another
 * type would take EVERY attribute of this node type off the pickers rather
 * than just this one.
 */
const seedCollectableBoolean = (harness: StageEditorHarness): string => {
  addFamilyMemberVariable(harness, SEEDED_UNWELL, {
    name: 'unwell',
    type: 'boolean',
    component: 'Boolean',
  });
  return SEEDED_UNWELL;
};

/**
 * Adds a family member form field that collects the seeded boolean above.
 *
 * Inventing the attribute through the dialog instead is a journey of its own —
 * a second picker, a typed name, and a re-render of the open dialog per
 * keystroke — and it is the SUBJECT of `creates a categorical field together
 * with the values it offers` below rather than of either caller here, both of
 * which are about what happens once a field collects an attribute. Seeded
 * through the host, so the revision the session holds is one the host issued.
 *
 * The prompt text is as short as a question can be: every character is a
 * keystroke through a controlled field, and what these tests are about is
 * which attribute the field took, never what it asks.
 */
async function addFormFieldCollecting(
  harness: StageEditorHarness,
  variableId: string,
): Promise<void> {
  await harness.user.click(
    await screen.findByRole('button', { name: 'Create new form field' }),
  );
  const field = within(await screen.findByRole('dialog'));
  await harness.user.selectOptions(
    field.getByRole('combobox', { name: 'Attribute' }),
    variableId,
  );
  await harness.user.type(
    await field.findByRole('textbox', { name: 'Question text' }),
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
  section: typeof FAMILY_MEMBER_SECTION = FAMILY_MEMBER_SECTION,
): string | undefined {
  const definition = harness.host.getSnapshot().protocolSections[section];
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
   * The attribute the field collects is seeded rather than invented, because
   * every boolean already on the node type is written unvalidated somewhere —
   * this pedigree's own participant marker, and the narrative pedigree's
   * disease — and the shared form-fields picker refuses all of those. It
   * reaches the structural picker as a saved attribute nothing has claimed, so
   * the only thing that can take it off that picker is the unsaved field that
   * now collects it: exactly the window under test.
   *
   * The whole list is asserted rather than the absence alone: an exclusion
   * written against the wrong list would empty the picker, and an
   * absence-only claim would call that a pass.
   */
  it('never offers a structural slot an attribute this stage’s own form collects', async () => {
    const harness = renderStageEditor(openFixture());
    const unwell = seedCollectableBoolean(harness);

    // On offer while nothing has claimed it, so the exclusion below is a
    // change rather than a list that was always this short.
    await waitFor(() =>
      expect(optionsOf('Participant identifier')).toEqual([
        'is_ego',
        'hasConditionX',
        unwell,
      ]),
    );

    // The fixture pedigree asks nothing about each family member, so the form
    // is switched off until the researcher turns it on.
    await harness.user.click(
      screen.getByRole('switch', { name: 'Family member form' }),
    );
    await addFormFieldCollecting(harness, unwell);

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
   * name.
   *
   * Nor the display label, for a different reason: the interview collects each
   * relative's name through the pedigree's own name control and filters that
   * attribute out of the form it renders, so a field collecting it is a
   * question no participant is ever asked. The seeded attribute is what keeps
   * this from being an assertion about an empty picker.
   */
  it('never offers the family member form an attribute the pedigree already has', async () => {
    const harness = renderStageEditor(openFixture());
    const collectable = seedCollectableBoolean(harness);

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

    expect(offered).toContain(collectable);
    expect(offered).not.toContain('fm_name');
    expect(offered).not.toContain('is_ego');
    expect(offered).not.toContain('fm_relationship_to_ego');
    expect(offered).not.toContain('biologicalSex');
  });

  /**
   * The reserved `name` id, which is a fact about the interview rather than
   * about this protocol.
   *
   * The pedigree's wizard submits each relative's name through its internal
   * `name` path, so `getNodeForm` drops a field bound to an attribute whose id
   * is literally `name` as well as one bound to the display label. Both are
   * questions a researcher can write, save, and never have asked.
   */
  it('never offers the family member form an attribute filed under “name”', async () => {
    const harness = renderStageEditor(openFixture());
    addFamilyMemberVariable(harness, 'name', {
      name: 'preferred_name',
      type: 'text',
      component: 'Text',
    });
    // A second free attribute, so the absence below is an exclusion rather
    // than a picker with nothing in it.
    const collectable = seedCollectableBoolean(harness);

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

    expect(offered).toContain(collectable);
    expect(offered).not.toContain('name');
  });

  /**
   * And the collision made from the other side: an attribute a form field is
   * already collecting becomes the display label.
   *
   * Nothing about the field changes, so no row is being edited and no picker
   * is being opened — the stage's own save is the only thing left to notice,
   * and it refuses with the field named as the thing to fix. Without it the
   * pedigree saved a form field the interview silently drops.
   */
  it('refuses to save a form field the display label has since taken over', async () => {
    const harness = renderStageEditor(openFixture());
    addFamilyMemberVariable(harness, 'preferred_name', {
      name: 'preferred_name',
      type: 'text',
      component: 'Text',
    });

    await harness.user.click(
      screen.getByRole('switch', { name: 'Family member form' }),
    );
    await addFormFieldCollecting(harness, 'preferred_name');
    // Saveable up to here: the label is still `fm_name`, and the field is a
    // question about something else.
    expect(await harness.submit()).not.toBeNull();

    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Display label' }),
      'preferred_name',
    );

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        /The pedigree already collects each family member’s name/,
      ),
    ).toBeInTheDocument();
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
    const collectable = seedCollectableBoolean(harness);
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
    // Not an empty picker: an attribute nothing on this stage has claimed is
    // still on offer. Not the display label, which the pedigree collects
    // through its own name control.
    expect(offered).toContain(collectable);
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
   * The display label the researcher has just chosen is a claim like any
   * other, and the structural slots have to see it.
   *
   * The label holds what the participant TYPES for each relative; a structural
   * slot holds what the pedigree DERIVES from the tree the participant draws.
   * Bound to one attribute they are the same key, and the interview settles it
   * in the slot's favour — `FamilyPedigree/store.ts` spreads each node's
   * attributes and then writes the relationship over them — so the name a
   * participant entered is exported as "parent".
   *
   * The same rule read from the other end, and the one the pickers used to
   * disagree about.
   *
   * The display label's own picker has always dropped what a slot claims; the
   * slots did not drop what the LABEL claims, so a researcher could bind an
   * unused attribute as the display label and then pick it for the
   * relationship in the same edit, with both controls accepting it. What is
   * left is a save-time gate for a draft that never came through a picker — an
   * imported protocol, an arrival — and `slotWiring.test.ts` asks it for that
   * refusal, and for its words, directly.
   */
  it('never offers the relationship slot the attribute just made the display label', async () => {
    const harness = renderStageEditor(openFixture());
    addFamilyMemberVariable(harness, 'preferred_name', {
      name: 'preferred_name',
      type: 'text',
    });

    // On offer while nothing has claimed it, so the exclusion below is a
    // change rather than a list that was always this short.
    await waitFor(() =>
      expect(optionsOf('Relationship to participant')).toEqual([
        'fm_relationship_to_ego',
        'preferred_name',
      ]),
    );

    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Display label' }),
      'preferred_name',
    );

    await waitFor(() =>
      expect(optionsOf('Relationship to participant')).toEqual([
        'fm_relationship_to_ego',
      ]),
    );
    // And the pedigree still saves, with each control holding its own
    // attribute: the exclusion withholds a pick, it does not block the stage.
    expect(await harness.submit()).not.toBeNull();
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
    // disease — so the attribute the field collects is seeded rather than
    // picked off the fixture. Inventing it through the dialog would be a
    // second journey, and what is asserted here is the three commands the
    // list emits.
    const unwell = seedCollectableBoolean(harness);
    await addFormFieldCollecting(harness, unwell);
    await waitFor(() => expect(formRows(harness)).toHaveLength(2));

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
  /**
   * The row dialog's own save, over an attribute that has just gone.
   *
   * The picker is built from the live codebook, so it stops offering the
   * attribute at once — but the row is already holding it, the required rule
   * sees a nonempty value, and this gate asked only about who else writes it.
   * So Save closed the row over a reference whole-protocol validation then
   * refuses, and the researcher had to find the row that was blocking their
   * stage with nothing on screen marking it.
   */
  it('refuses a nomination prompt whose attribute a collaborator deleted', async () => {
    const harness = renderStageEditor(openWithNominationPrompts());

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit nomination prompt' }),
    );
    await screen.findByRole('dialog');
    removeFamilyMemberVariable(harness, 'hasConditionX');

    await harness.user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        '"hasConditionX" is no longer in the codebook, so nothing can be recorded under it. Choose another attribute.',
      ),
    ).toBeInTheDocument();
    // The dialog stays open, holding the prompt the researcher wrote, rather
    // than closing over a row the stage cannot save.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  /**
   * The same rule at the stage's own save, for the slots — which have no
   * dialog of their own to hold open.
   */
  it('refuses to save a slot whose attribute a collaborator deleted', async () => {
    const harness = renderStageEditor(openFixture());

    removeFamilyMemberVariable(harness, 'fm_name');

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        '"fm_name" is no longer in the codebook, so nothing can be recorded under it. Choose another attribute.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * Three of the pedigree's slots need an EXACT value set, not merely a list
   * of answers: the interview and the genetics engine branch on those values,
   * and the protocol refuses an attribute bound to one of them whose options
   * differ.
   *
   * A collaborator editing those values leaves the attribute in the codebook,
   * still categorical, so the deleted-or-retyped gate had nothing to say about
   * it — while the picker, which asks the schema's own comparison, drops it at
   * once. The stage was still refused, but by whole-protocol validation,
   * against a path: the researcher was stopped from finishing with nothing on
   * screen naming the control that had to change.
   */
  it('refuses to save a slot whose canonical values a collaborator changed', async () => {
    const harness = renderStageEditor(openFixture());
    expect(
      screen.getByRole('combobox', { name: 'Biological sex' }),
    ).toHaveValue('biologicalSex');

    redefineFamilyMemberVariable(harness, 'biologicalSex', {
      name: 'biologicalSex',
      type: 'categorical',
      options: [
        { value: 'female', label: 'Female' },
        { value: 'male', label: 'Male' },
      ],
    });

    // The control goes on holding it — which is the gap this gate closes: the
    // attribute is still there and still categorical, so nothing else refuses
    // it until whole-protocol validation does.
    expect(
      screen.getByRole('combobox', { name: 'Biological sex' }),
    ).toHaveValue('biologicalSex');

    // The refusal is the point rather than the save: the stage was refused
    // before this gate too, by the whole protocol. What is asserted is WHERE
    // the researcher reads it — under the control they have to change.
    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        '"biologicalSex" no longer offers the exact values this control needs, because they were changed somewhere else. Choose another attribute.',
      ),
    ).toBeInTheDocument();
  });

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
   * success arriving after it binds the slot to an attribute the researcher
   * watched no editor finish. The dialog therefore withholds every way out
   * until the host answers, exactly as the nested editors in
   * `AttributeCodebookControls` do.
   */
  it('withholds every way out until the codebook answers', async () => {
    const harness = renderStageEditor(openFixture());
    const release = holdTheCompoundEdit(harness);

    await harness.user.click(
      screen.getByRole('button', {
        name: 'Create a new display label attribute',
      }),
    );
    const creator = within(await screen.findByRole('dialog'));
    await harness.user.type(
      creator.getByRole('textbox', { name: 'Attribute name' }),
      'nickname',
    );
    await harness.user.click(
      creator.getByRole('button', { name: 'Create attribute' }),
    );

    // Escape and a press outside are the two routes left; the close button is
    // taken away rather than left on screen doing nothing.
    await harness.user.keyboard('{Escape}');
    await harness.user.click(document.body);
    expect(screen.getByRole('textbox', { name: 'Attribute name' })).toHaveValue(
      'nickname',
    );
    expect(screen.queryAllByRole('button', { name: 'Close' })).toHaveLength(0);

    release();
    // And the answer lands on the surface that asked for it: the slot now
    // holds the attribute the codebook holds.
    await waitFor(() =>
      expect(variableIdByName(harness, 'nickname')).toEqual(expect.any(String)),
    );
    expect(screen.getByRole('combobox', { name: 'Display label' })).toHaveValue(
      variableIdByName(harness, 'nickname'),
    );
  });

  /**
   * A lease taken back mid-draft.
   *
   * The name the researcher is typing exists nowhere but this editor, so
   * unmounting it to report the lost lease would throw their work away to say
   * something the editor says for itself — with its save refused, which is
   * what read-only does to it. The launch control goes, because a create
   * nobody may start is not on offer.
   */
  it('keeps an open attribute draft when the lease is lost', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.user.click(
      screen.getByRole('button', {
        name: 'Create a new display label attribute',
      }),
    );
    const creator = within(await screen.findByRole('dialog'));
    await harness.user.type(
      creator.getByRole('textbox', { name: 'Attribute name' }),
      'nickname',
    );

    act(() => {
      harness.setReadOnly();
    });

    await waitFor(() =>
      expect(
        screen.queryByRole('button', {
          name: 'Create a new display label attribute',
        }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('textbox', { name: 'Attribute name' })).toHaveValue(
      'nickname',
    );
    expect(
      screen.getByRole('button', { name: 'Create attribute' }),
    ).toBeDisabled();
  });

  /**
   * The slot repointed at another type while the codebook was answering.
   *
   * The submit handler inside the editor captured this dialog's `onComplete`
   * before it awaited the host, so the answer is applied by a closure that
   * still believes what was true when the request left: the slot named
   * attributes of the type the attribute is being created on. Repointed since
   * — by this researcher, by an undo, by a collaborator — the slot now names
   * another type's attributes, and binding the new attribute to it writes a
   * reference to the OLD type's codebook into the new type's slot, which
   * nothing on screen explains and whole-protocol validation refuses.
   *
   * The undo is what moves the type here: it is the one route that moves the
   * draft underneath a dialog the researcher cannot dismiss while the request
   * is in flight.
   */
  it('binds nothing when the slot moves to another type while the codebook answers', async () => {
    const harness = renderStageEditor(openUnreadWithNominationPrompts());

    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await harness.user.click(
      await screen.findByRole('button', { name: 'Change the node type' }),
    );
    await waitFor(() => expect(nodeConfigOf(harness).type).toBe('person'));

    const release = holdTheCompoundEdit(harness);
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Create a new display label attribute',
      }),
    );
    const creator = within(await screen.findByRole('dialog'));
    await harness.user.type(
      creator.getByRole('textbox', { name: 'Attribute name' }),
      'nickname',
    );
    await harness.user.click(
      creator.getByRole('button', { name: 'Create attribute' }),
    );

    // The type moves back while the host is still holding the request, so the
    // attribute in flight belongs to a type this slot no longer names.
    act(() => {
      harness.session.undo();
    });
    await waitFor(() =>
      expect(nodeConfigOf(harness).type).toBe('family_member'),
    );

    release();
    // The attribute itself is created — the researcher asked for it, and the
    // codebook edit was already with the host — and the dialog closes.
    await waitFor(() =>
      expect(variableIdByName(harness, 'nickname', PERSON_SECTION)).toEqual(
        expect.any(String),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    // But nothing is bound to it: the slot is left holding what the undo
    // restored, rather than a "person" attribute under "family_member".
    //
    // Read from the CONTROL rather than from the session, because an ordinary
    // field change waits for the submit that flushes it: the session would go
    // on reporting the undone value while the form the researcher is about to
    // save already held the dangling one.
    expect(screen.getByRole('combobox', { name: 'Display label' })).toHaveValue(
      'fm_name',
    );
    // And the stage still saves, which is what the dangling reference cost:
    // an attribute of "person" under "family_member" is refused at the gate,
    // leaving the researcher unable to finish a stage they never changed.
    const request = await harness.submit();
    expect(request?.stageDocument.nodeConfig).toEqual(FIXTURE_NODE_CONFIG);
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

  /**
   * A categorical attribute a form field may collect, already on the node
   * type, offering the values the journey below authors by hand.
   *
   * `CheckboxGroup` is one of the two controls the schema lets a categorical
   * be collected with; a control belonging to another type would make the
   * variable invalid, and an entity definition is parsed whole, so the picker
   * would then offer NONE of this node type's attributes rather than complain
   * about this one.
   */
  const seedCategorical = (harness: StageEditorHarness): string => {
    addFamilyMemberVariable(harness, 'seeded-household-role', {
      name: 'household_role',
      type: 'categorical',
      component: 'CheckboxGroup',
      options: [
        { label: 'Parent', value: 'parent' },
        { label: 'Sibling', value: 'sibling' },
      ],
    });
    return 'seeded-household-role';
  };

  /**
   * A date attribute a form field may collect, already on the node type,
   * carrying the control its settings belong to and no settings of its own.
   */
  const seedDatetime = (harness: StageEditorHarness): string => {
    addFamilyMemberVariable(harness, 'seeded-diagnosed-on', {
      name: 'diagnosed_on',
      type: 'datetime',
      component: 'DatePicker',
    });
    return 'seeded-diagnosed-on';
  };

  it('creates a categorical attribute, with its values, from the field that collects it', async () => {
    const harness = renderStageEditor(openNodeConfig());

    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new form field' }),
    );
    const field = within(await screen.findByRole('dialog'));
    await harness.user.selectOptions(
      field.getByRole('combobox', { name: 'Attribute' }),
      CREATE_NEW_ATTRIBUTE,
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

    // And the field is left collecting what was just created, so finishing the
    // row would record a question against it rather than against nothing.
    expect(field.getByRole('combobox', { name: 'Attribute' })).toHaveValue(
      created[0],
    );
  });

  /**
   * The row's save, from a row collecting an attribute that already exists.
   *
   * Split from the journey above rather than run after it, because the two are
   * separate subjects and the create journey is not cheap: two pickers, a
   * name, two option rows and four typed fields, each keystroke a render of
   * the open dialog. Paying for it again to reach the save made this the
   * slowest test in the file, and the one nearest the 20s per-test timeout on
   * a CI runner tens of times slower than a developer's machine — while the
   * attribute this half needs is one the host can simply hand over.
   *
   * The control chosen is the OTHER one a categorical may be collected with,
   * so this asserts a write: seeded as `CheckboxGroup`, a row that chose it
   * would have asserted the value the codebook already held.
   */
  it('writes the control the row chose onto what it collects, with the field', async () => {
    const harness = renderStageEditor(openNodeConfig());
    const householdRole = seedCategorical(harness);

    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new form field' }),
    );
    const field = within(await screen.findByRole('dialog'));
    await harness.user.selectOptions(
      field.getByRole('combobox', { name: 'Attribute' }),
      householdRole,
    );
    await harness.user.selectOptions(
      await field.findByRole('combobox', { name: 'Input control' }),
      'ToggleButtonGroup',
    );
    await harness.user.type(
      field.getByRole('textbox', { name: 'Question text' }),
      'Q?',
    );
    await harness.user.click(field.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // On the pedigree's OWN node type, beside the values the attribute already
    // offered.
    await waitFor(() =>
      expect(familyMemberVariables(harness)[householdRole]).toMatchObject({
        type: 'categorical',
        component: 'ToggleButtonGroup',
      }),
    );
    expect(formRows(harness)).toEqual([
      { variable: 'fm_name', prompt: 'What do they go by?' },
      {
        id: expect.any(String) as unknown as string,
        variable: householdRole,
        prompt: 'Q?',
      },
    ]);
  });

  it('writes a date field’s settings onto the attribute it collects', async () => {
    const harness = renderStageEditor(openNodeConfig());

    // The attribute is seeded rather than invented: inventing one is the
    // subject of the journey above, and only setup for a claim about the
    // settings a control takes once the attribute exists. Seeded with the
    // control those settings belong to, and with no settings of its own, so
    // `parameters` below is a write rather than the value the seed held.
    const diagnosedOn = seedDatetime(harness);
    await addFormFieldCollecting(harness, diagnosedOn);

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
  /**
   * The one radio that is not already chosen, named for its type — and the
   * answer to the question a configured pedigree asks before it lets go of
   * everything that described the type it is leaving.
   *
   * Every test below means "the researcher changed the node type", and the
   * researcher cannot do that without answering, so none of them may pass by a
   * route the researcher does not have.
   */
  const chooseNodeType = async (harness: StageEditorHarness, name: string) => {
    await harness.user.click(screen.getByRole('radio', { name }));
    await harness.user.click(
      await screen.findByRole('button', { name: 'Change the node type' }),
    );
  };

  /**
   * A narrative pedigree resolves every disease it draws through its source
   * pedigree's `nodeConfig.type`, so a type change under one leaves it naming
   * attributes the new type does not have — a protocol whole-protocol
   * validation refuses, and one this editor cannot repair: the stage that
   * would have to be remapped is not the stage it is editing. Architect
   * refuses the same transition, and the refusal names the stages so the
   * researcher knows where to go.
   */
  it('refuses a node type change while another stage reads this pedigree', async () => {
    // The fixture's own pedigree, which `narrative-pedigree-1` reads.
    const harness = renderStageEditor(openWithNominationPrompts());

    await harness.user.click(screen.getByRole('radio', { name: 'person' }));

    expect(
      await screen.findByText('This node type cannot be changed'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/"Narrative Pedigree" reads this pedigree/),
    ).toBeInTheDocument();
    // Refused rather than confirmed: the question a change with something to
    // lose would ask is never put, because there is no answer to it that lets
    // the change through.
    expect(
      screen.queryByRole('button', { name: 'Change the node type' }),
    ).not.toBeInTheDocument();
    expect(nodeConfigOf(harness)).toEqual(FIXTURE_NODE_CONFIG);
    expect(harness.pendingCommands()).toEqual([]);
  });

  /**
   * The same refusal, when the dependency arrives while the question is open.
   *
   * The confirmation is awaited, and the handler that resumes when it is
   * answered is a closure from the render that put the question: it holds the
   * `blockChangeReason` as it stood then, which was none. A collaborator
   * pointing a narrative pedigree at this stage in the meantime made the
   * change one that may not happen at all — but the confirmed change went
   * through, discarding the source configuration the narrative stage resolves
   * its diseases against and leaving that stage naming attributes the new type
   * does not have.
   *
   * Refused rather than merely re-confirmed: the researcher agreed to what a
   * change costs THIS stage, which is a different question from whether the
   * change is allowed at all.
   */
  it('refuses a confirmed change a stage began depending on while the question was open', async () => {
    const harness = renderStageEditor(openUnreadWithNominationPrompts());

    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    const confirm = await screen.findByRole('button', {
      name: 'Change the node type',
    });

    readNarrativePedigreeFrom(harness, UNREAD_PEDIGREE_ID);

    await harness.user.click(confirm);

    expect(
      await screen.findByText('This node type cannot be changed'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/"Narrative Pedigree" reads this pedigree/),
    ).toBeInTheDocument();
    expect(nodeConfigOf(harness)).toEqual(FIXTURE_NODE_CONFIG);
    expect(
      harness.session.getSnapshot().editedSection.fields.nominationPrompts,
    ).toEqual(NOMINATION_ROWS);
    expect(harness.pendingCommands()).toEqual([]);
    expect(screen.getByText('Who has been unwell?')).toBeInTheDocument();
  });

  /**
   * The same rule — decide on the live document at the moment of the write —
   * applied to the type the change lands ON rather than to the refusal it is
   * judged by.
   *
   * A collaborator deleted the type the researcher had just chosen while they
   * were reading what the change would cost. The picker's latest render has
   * already dropped it from the chips, but the continuation that resumes when
   * the question is answered still holds it, and applying it points
   * `nodeConfig.type` at a type the codebook no longer describes — a stage the
   * host refuses to save, and one nothing on screen explains.
   *
   * Refused rather than applied and repaired: there is nothing to repair it
   * to. The researcher agreed to lose this stage's configuration in exchange
   * for a type that no longer exists, so the exchange is off and what they had
   * is still theirs.
   */
  it('refuses a confirmed change onto a type deleted while the question was open', async () => {
    const harness = renderStageEditor(openUnreadWithNominationPrompts());

    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    const confirm = await screen.findByRole('button', {
      name: 'Change the node type',
    });

    deleteNodeType(harness, 'person');

    await harness.user.click(confirm);

    expect(
      await screen.findByText('That node type has been deleted'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'This type is no longer in the codebook. Choose another one.',
      ),
    ).toBeInTheDocument();
    // The deletion really reached the picker, so the refusal above is about a
    // type the chips no longer offer rather than about nothing.
    expect(
      screen.queryByRole('radio', { name: 'person' }),
    ).not.toBeInTheDocument();
    expect(nodeConfigOf(harness)).toEqual(FIXTURE_NODE_CONFIG);
    expect(
      harness.session.getSnapshot().editedSection.fields.nominationPrompts,
    ).toEqual(NOMINATION_ROWS);
    expect(harness.pendingCommands()).toEqual([]);
    expect(screen.getByText('Who has been unwell?')).toBeInTheDocument();
  });

  /**
   * And the refusal is about the NODE type alone. A narrative pedigree reads
   * its source's node type and says nothing about its edges, so the edge type
   * is still the researcher's to change.
   */
  it('still lets the edge type change while another stage reads this pedigree', async () => {
    const harness = renderStageEditor(openWithNominationPrompts());

    await harness.user.click(screen.getByRole('radio', { name: 'knows' }));
    await harness.user.click(
      await screen.findByRole('button', { name: 'Change the edge type' }),
    );

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'knows' })).toBeChecked(),
    );
  });

  /**
   * The reset is destructive and a chip is one click away, so the researcher
   * is asked first.
   *
   * Undo is not an answer to this: it is a way back from a change the
   * researcher meant to make, and what this prevents is the one they did not —
   * a stray click on the chip beside the chosen one taking the member form and
   * every nomination prompt with it, with nothing said. The question is asked
   * of the same paths the reset discards (`NODE_TYPE_DEPENDENT_FIELDS`), so it
   * cannot warn about a change that costs nothing or stay silent about one
   * that costs something.
   */
  it('asks before it discards what described the old node type', async () => {
    const harness = renderStageEditor(openUnreadWithNominationPrompts());

    await harness.user.click(screen.getByRole('radio', { name: 'person' }));

    expect(
      await screen.findByText(
        'This will clear everything about family members',
      ),
    ).toBeInTheDocument();
    // Nothing has moved while the question stands: the pick is held back
    // rather than made and offered back. Asked of the draft rather than of the
    // chips, which the modal question has taken out of reach.
    expect(nodeConfigOf(harness)).toEqual(FIXTURE_NODE_CONFIG);
    expect(harness.pendingCommands()).toEqual([]);
  });

  it('leaves the pedigree exactly as it was when the researcher says no', async () => {
    const harness = renderStageEditor(openUnreadWithNominationPrompts());

    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await harness.user.click(
      await screen.findByRole('button', { name: 'Cancel' }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Change the node type' }),
      ).not.toBeInTheDocument(),
    );
    expect(nodeConfigOf(harness)).toEqual(FIXTURE_NODE_CONFIG);
    expect(
      harness.session.getSnapshot().editedSection.fields.nominationPrompts,
    ).toEqual(NOMINATION_ROWS);
    expect(harness.pendingCommands()).toEqual([]);
    expect(screen.getByText('Who has been unwell?')).toBeInTheDocument();
  });

  /**
   * A question about nothing is one a researcher learns to dismiss without
   * reading, so a pedigree the host has just created — which holds no
   * attribute of any type yet — is asked nothing at all.
   */
  it('asks nothing of a new pedigree, which has nothing to lose', async () => {
    const harness = renderStageEditor({
      create: { type: 'FamilyPedigree', position: 0 },
      sections: pedigreeSections,
    });

    await harness.user.click(
      screen.getByRole('radio', { name: 'family member' }),
    );

    expect(
      screen.queryByRole('button', { name: 'Change the node type' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(nodeConfigOf(harness).type).toBe('family_member'),
    );
  });

  /**
   * The edge type reaches the same reset through the same control, and its
   * slots are worth the same warning: an edge type change takes the
   * relationship type, whether a relationship is current, who carried each
   * pregnancy and each parent's gamete with it.
   */
  it('asks before it discards what described the old edge type', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.user.click(screen.getByRole('radio', { name: 'knows' }));

    expect(
      await screen.findByText(
        'This will clear everything about family relationships',
      ),
    ).toBeInTheDocument();
    expect(harness.pendingCommands()).toEqual([]);

    await harness.user.click(
      screen.getByRole('button', { name: 'Change the edge type' }),
    );

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'knows' })).toBeChecked(),
    );
    expect(commandsOf(harness)).toEqual([
      { op: 'set', key: ['edgeConfig', 'type'], value: 'knows' },
      { op: 'unset', key: ['edgeConfig', 'gameteRoleVariable'] },
      { op: 'unset', key: ['edgeConfig', 'isActiveVariable'] },
      { op: 'unset', key: ['edgeConfig', 'isGestationalCarrierVariable'] },
      { op: 'unset', key: ['edgeConfig', 'relationshipTypeVariable'] },
    ]);
  });

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
    const harness = renderStageEditor(openUnreadWithNominationPrompts());

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
    const harness = renderStageEditor(openUnreadWithNominationPrompts());
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
    const harness = renderStageEditor(openUnreadWithNominationPrompts());
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
    const harness = renderStageEditor(openUnreadWithNominationPrompts());

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
    const harness = renderStageEditor(openUnreadWithNominationPrompts());
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
    // ONE command, not the mode-then-clear pair this used to be. `framing` is
    // a discriminated union, so it is an exclusive-variant container and the
    // whole of it travels at once (`commandsFromDraftChange`): the chosen mode
    // and the terminology it cost are the same write, and there is no moment
    // between them at which the stage claims a fixed framing with nothing to
    // fix it to. That is a stronger guarantee than the pair gave, not a weaker
    // one — the pair only held because nothing ever replayed the two commands
    // apart.
    expect(commandsOf(harness)).toEqual([
      { op: 'set', key: 'framing', value: { mode: 'participantChoice' } },
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

/**
 * The same window the display label and the family member form already close,
 * seen from the two places that were still reading the SAVED protocol alone:
 * the nomination prompts, and a second structural slot.
 *
 * An exclusion built only from what is committed cannot see the edit in front
 * of the researcher, so the picker offers an attribute this session has
 * already claimed — and the refusal arrives at the save, naming a stage the
 * researcher thought they had finished.
 */
describe('picks this session has already claimed', () => {
  /** One more attribute on the type the pedigree records relationships as. */
  const addFamilyEdgeVariable = (
    harness: StageEditorHarness,
    variableId: string,
    variable: Readonly<Record<string, unknown>>,
  ): void => {
    const section =
      harness.session.getSnapshot().protocolSections[
        sectionId({ kind: 'codebookEdge', typeId: 'family_edge' })
      ];
    if (section === undefined) {
      throw new Error('the fixture protocol has no family_edge edge type');
    }
    const variables = isRecord(section.variables) ? section.variables : {};
    harness.receiveCodebookUpdate({
      edge: {
        family_edge: {
          ...section,
          variables: { ...variables, [variableId]: variable },
        },
      },
    });
  };

  /**
   * A nomination toggle is an UNVALIDATED writer, so it may not take an
   * attribute this stage's own form collects — and the form field that
   * collects it is unsaved, so only the live draft knows about it.
   *
   * The attribute the field collects is seeded rather than invented, for the
   * reason `seedCollectableBoolean` gives: every boolean the node type
   * already has is written unvalidated somewhere, so the shared form picker
   * refuses all of them. Seeded, it reaches this dialog as a saved boolean
   * nothing has claimed — on offer to a nomination prompt until the unsaved
   * field takes it, which is what makes the list below a change rather than
   * one that was always this short.
   */
  it('never offers a nomination prompt an attribute this stage’s own form collects', async () => {
    const harness = renderStageEditor(openWithNominationPrompts());
    const unwell = seedCollectableBoolean(harness);

    await harness.user.click(
      screen.getByRole('switch', { name: 'Family member form' }),
    );
    await addFormFieldCollecting(harness, unwell);

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit nomination prompt' }),
    );
    await screen.findByRole('combobox', { name: 'Attribute' });

    // The prompt's own committed pick, and nothing the form now collects.
    expect(optionsOf('Attribute')).toEqual(['hasConditionX']);
  });

  /**
   * The other direction: the family member form may not collect an attribute
   * a nomination prompt claimed in this session. The pedigree answers for its
   * own stage here — the shared section drops the open stage from the saved
   * role map as soon as it is handed a live list — so a nomination prompt
   * missing from that list is a writer nothing accounts for.
   */
  it('never offers the family member form an attribute a nomination prompt took this session', async () => {
    const harness = renderStageEditor(openWithNominationPrompts());
    addFamilyMemberVariable(harness, 'unwell', {
      name: 'unwell',
      type: 'boolean',
      component: 'Boolean',
    });
    // A second collectable boolean, so what the picker still offers is an
    // attribute rather than the create-a-new-one sentinel: every other boolean
    // this type carries is written unvalidated somewhere.
    addFamilyMemberVariable(harness, 'housebound', {
      name: 'housebound',
      type: 'boolean',
      component: 'Boolean',
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit nomination prompt' }),
    );
    const prompt = within(await screen.findByRole('dialog'));
    await harness.user.selectOptions(
      await prompt.findByRole('combobox', { name: 'Attribute' }),
      'unwell',
    );
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
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

    expect(offered).not.toContain('unwell');
    // Not an empty picker: an attribute nothing on this stage has claimed is
    // still on offer. Not the display label, which the pedigree collects
    // through its own name control.
    expect(offered).toContain('housebound');
  });

  /**
   * Two exclusive slots may never name one attribute — each would overwrite
   * the other's meaning — and the pedigree has four of them on its edge type,
   * two of which take any boolean. A slot bound in this session is not in the
   * saved protocol, so the sibling picker was still offering it.
   */
  it('never offers a second edge slot an attribute another slot took this session', async () => {
    const harness = renderStageEditor(openFixture());
    addFamilyEdgeVariable(harness, 'together', {
      name: 'together',
      type: 'boolean',
    });

    // On offer to both while nothing has claimed it, so the exclusion below is
    // a change rather than a list that was always this short.
    await waitFor(() =>
      expect(optionsOf('Gestational carrier')).toEqual([
        'isGestationalCarrier',
        'together',
      ]),
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Active status' }),
      'together',
    );

    await waitFor(() =>
      expect(optionsOf('Gestational carrier')).toEqual([
        'isGestationalCarrier',
      ]),
    );
  });
});
