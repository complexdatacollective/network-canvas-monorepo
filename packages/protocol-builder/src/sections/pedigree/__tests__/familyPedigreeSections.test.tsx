import { screen, waitFor, within } from '@testing-library/react';
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
   * The structural pickers' exclusions are built from the SAVED protocol, so a
   * form field added in this unsaved session is invisible to them — and the
   * attribute it collects stays on offer to them. That is precisely the case
   * the save-time gate exists for, and the only one a researcher can reach
   * without an imported protocol.
   *
   * The field invents its attribute rather than picking one, because every
   * boolean already on the node type is written unvalidated somewhere — this
   * pedigree's own participant marker, and the narrative pedigree's disease —
   * and the shared form-fields picker refuses all of those before the gate is
   * reached. The codebook write lands as the row is committed, so the new
   * attribute reaches the structural picker while the field that collects it
   * is still unsaved: exactly the window under test.
   */
  it('refuses a structural slot pointing at an attribute this stage collects', async () => {
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

    // Still on offer — the picker cannot know about a field that is not saved.
    expect(optionsOf('Participant identifier')).toContain(unwell);
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Participant identifier' }),
      unwell,
    );

    expect(await harness.submit()).toBeNull();
    // Said as what it is: the form doing the collecting is on this screen, one
    // section further down. "Elsewhere in this protocol" would send the
    // researcher looking through their other stages for it.
    expect(
      await screen.findByText(
        '"unwell" is collected by this stage’s own form, so it cannot also be written by this slot (values written here would bypass its validation)',
      ),
    ).toBeInTheDocument();
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
   * TODO(S): the other half of the rule the test above states, in the window
   * where only this session knows about it.
   *
   * The form picker's exclusions are built from the SAVED protocol, so an
   * attribute a structural slot was bound to in this session is invisible to
   * it — and creating one from the slot itself writes the attribute to the
   * codebook at once, so it appears in the form picker while the slot that
   * claims it is still unsaved. The pedigree writes it from the tree the
   * participant draws, without validation; collecting it through a form field
   * as well is the mix the whole rule exists to stop.
   *
   * The pedigree already refuses this in the opposite direction, because
   * `SlotVariableField` takes `draftConflicting`. Un-skip once
   * `FormFieldsSection` takes the matching `draftUnvalidatedVariables` prop
   * and the pedigree passes it the slots' live values (S owns
   * `src/sections/FormFieldsSection.tsx`).
   */
  it('never offers the family member form an attribute a slot took this session', async (ctx) => {
    ctx.skip(
      'FormFieldsSection has no draftUnvalidatedVariables prop yet (S owns src/sections/FormFieldsSection.tsx)',
    );
    const harness = renderStageEditor(openFixture());

    // Created FROM the slot, so the attribute reaches the codebook — and
    // therefore the form's picker — while the slot binding it is still the
    // researcher's unsaved draft. That is the only window in which a picker
    // reading the saved protocol can be wrong.
    await harness.user.click(
      screen.getByRole('button', {
        name: 'Create a new relationship attribute',
      }),
    );
    const creator = within(
      await screen.findByRole('dialog', {
        name: 'Create a new relationship attribute',
      }),
    );
    await harness.user.type(
      creator.getByRole('textbox', { name: /name/i }),
      'kinship',
    );
    await harness.user.click(
      creator.getByRole('button', { name: /^(Save|Create)/ }),
    );
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
    // By name rather than by id: the attribute was invented a moment ago and
    // its id is a fresh uuid.
    const offered = [
      ...field
        .getByRole('combobox', { name: 'Attribute' })
        .querySelectorAll('option'),
    ].map((option) => option.textContent);

    expect(offered).not.toContain('kinship');
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
