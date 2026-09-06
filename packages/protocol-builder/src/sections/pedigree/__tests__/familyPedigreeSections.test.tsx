import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
import { familyPedigreeStageWith } from './pedigreeFixtures.tsx';

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
 * Invents an attribute from a slot's own create control, and binds it there.
 *
 * The codebook write lands as the dialog closes, so the new attribute reaches
 * every OTHER picker on the screen while the slot claiming it is still this
 * session's unsaved draft — the one window in which a picker reading only the
 * saved protocol can be wrong about what is free.
 */
async function createFromSlot(
  harness: StageEditorHarness,
  createLabel: string,
  attributeName = 'kinship',
): Promise<void> {
  await harness.user.click(screen.getByRole('button', { name: createLabel }));
  const creator = within(
    await screen.findByRole('dialog', { name: createLabel }),
  );
  await harness.user.type(
    creator.getByRole('textbox', { name: /name/i }),
    attributeName,
  );
  await harness.user.click(
    creator.getByRole('button', { name: /^(Save|Create)/ }),
  );
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
      'unwell',
    );
    await harness.user.selectOptions(
      field.getByRole('combobox', { name: 'Kind of answer' }),
      'boolean',
    );
    await harness.user.type(
      field.getByRole('textbox', { name: 'Question text' }),
      'Have they been unwell?',
    );
    await harness.user.click(field.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const unwell = variableIdByName(harness, 'unwell');
    expect(unwell).toBeDefined();
    if (unwell === undefined) throw new Error('the attribute was not created');

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
   * attribute a structural slot was bound to in this session would be
   * invisible to it — and creating one from the slot itself writes the
   * attribute to the codebook at once, so it appears in the form picker while
   * the slot that claims it is still unsaved. The pedigree writes it from the
   * tree the participant draws, without validation; collecting it through a
   * form field as well is the mix the whole rule exists to stop.
   *
   * The pedigree closes the window by handing the shared section its three
   * unvalidated slots' live values as `draftUnvalidatedVariables`, which is
   * the mirror of the `draftConflicting` the slots already take.
   */
  it('never offers the family member form an attribute a slot took this session', async () => {
    const harness = renderStageEditor(openFixture());

    // Created FROM the slot, so the attribute reaches the codebook — and
    // therefore the form's picker — while the slot binding it is still the
    // researcher's unsaved draft. That is the only window in which a picker
    // reading the saved protocol can be wrong.
    await createFromSlot(harness, 'Create a new relationship attribute');

    await harness.user.click(
      screen.getByRole('switch', { name: 'Family member form' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new form field' }),
    );
    const field = within(await screen.findByRole('dialog'));
    // By name rather than by id: the attribute was invented a moment ago and
    // its id is a fresh uuid.
    const offered = [
      ...field
        .getByRole('combobox', { name: 'Attribute' })
        .querySelectorAll('option'),
    ].map((option) => option.textContent);

    expect(offered).not.toContain('kinship');
  });

  /**
   * The same window, seen from the display label — the pedigree's one
   * VALIDATED slot. It may not take an attribute a structural slot claimed in
   * this session either, and its picker has to say so by not offering it
   * rather than by letting the save refuse the pick afterwards.
   */
  it('never offers the display label an attribute a slot took this session', async () => {
    const harness = renderStageEditor(openFixture());

    await createFromSlot(harness, 'Create a new relationship attribute');
    const kinship = variableIdByName(harness, 'kinship');
    if (kinship === undefined) throw new Error('the attribute was not created');

    // The label keeps its own committed pick, and gains nothing the
    // relationship slot has just taken.
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

    await createFromSlot(
      harness,
      'Create a new display label attribute',
      'preferred_name',
    );
    const preferred = variableIdByName(harness, 'preferred_name');
    if (preferred === undefined) {
      throw new Error('the attribute was not created');
    }

    // The relationship slot's own picker reads the saved protocol and this
    // stage's form; neither knows the display label just took this attribute.
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Relationship to participant' }),
      preferred,
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
 * Whether the session then rebases anything is a separate question this test
 * does not answer, and today the answer is no: `session.undo()` re-emits a
 * whole-key `set nodeConfig`, and an authoritative update inserting a
 * colleague's row into `nodeConfig.form` is dropped rather than replayed onto
 * this draft. Both live in the session's own command derivation and reseed.
 */
describe('the way a family member form reaches the document', () => {
  it('commits an added, moved and removed field as that row’s own edit', async () => {
    const harness = renderStageEditor(openWithFamilyMemberForm());

    // Added. Every boolean this node type already has is written unvalidated
    // somewhere — this pedigree's own slots, and the narrative pedigree's
    // disease — so the field invents its attribute rather than picking one.
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
      'unwell',
    );
    await harness.user.selectOptions(
      field.getByRole('combobox', { name: 'Kind of answer' }),
      'boolean',
    );
    await harness.user.type(
      field.getByRole('textbox', { name: 'Question text' }),
      'Have they been unwell?',
    );
    await harness.user.click(field.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(formRows(harness)).toHaveLength(2));

    const unwell = variableIdByName(harness, 'unwell');
    if (unwell === undefined) throw new Error('the attribute was not created');
    // The row identity the list stamps on a row it creates, which is a fresh
    // uuid and cannot be written down here.
    const added = {
      id: expect.any(String) as unknown as string,
      variable: unwell,
      prompt: 'Have they been unwell?',
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
    const text = await screen.findByRole('textbox', { name: 'Prompt text' });
    await harness.user.clear(text);
    await harness.user.type(text, 'Who has had this condition?');
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // The rendered markdown nests, so the question matches the paragraph and
    // the row around it.
    await screen.findAllByText('Who has had this condition?');
    const request = await harness.submit();
    expect(request?.stageDocument.nominationPrompts).toEqual([
      {
        id: 'nomination-1',
        text: 'Who has had this condition?',
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
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Attribute name' }),
      'preferred_name',
    );
    const submissions = vi.spyOn(harness.host, 'submit');
    await harness.user.click(
      screen.getByRole('button', { name: 'Create attribute' }),
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
    const created = variableIdByName(harness, 'preferred_name');
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
