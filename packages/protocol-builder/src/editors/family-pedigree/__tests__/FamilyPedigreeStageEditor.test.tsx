import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  familyPedigreeStage,
  PEDIGREE_DEFAULT_GENDER_IDENTITIES,
  PEDIGREE_RELATIVES_NOT_RECORDED_OPTIONS,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import {
  attributeField,
  chooseAttributeById,
  inventAttribute,
  offeredAttributes,
} from '../../../testing/attributePicker.ts';
import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import { familyPedigreeStageEditor } from '../FamilyPedigreeStageEditor.ts';
import {
  familyPedigreeEditor,
  shimMarkdownEditorMeasurement,
} from './editorFixtures.ts';
import {
  addFamilyMemberVariable,
  addFamilyMemberVariables,
  FAMILY_MEMBER_SECTION,
  RELATIVES_NOT_RECORDED_VARIABLE,
  familyPedigreeStageWith,
} from './pedigreeFixtures.ts';

shimMarkdownEditorMeasurement();

const SECTIONS = [
  'Node setup',
  'Person attributes',
  'Ask about gender identity',
  'Relationships',
  'Completeness',
  'Prompt',
  'Additional person fields',
  'Skip logic',
  'Interviewer guidance',
];

const openFixture = () =>
  renderStageEditor({
    stageId: 'family-pedigree-1',
    editor: familyPedigreeEditor,
  });

/** A stage of this interface that does not exist yet, as a host creates one. */
const openNewStage = () =>
  renderStageEditor({
    stage: {
      id: 'family-pedigree-new',
      type: 'FamilyPedigree',
      fields: getInterfaceTemplate('FamilyPedigree'),
    },
    editor: familyPedigreeEditor,
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Binds one attribute slot, once its control is on screen. */
const bindSlot = async (
  harness: StageEditorHarness,
  label: string,
  variableId: string,
): Promise<void> => {
  await screen.findByText(label, { selector: 'label' });
  await chooseAttributeById(harness.user, attributeField(label), variableId);
};

/** The id the codebook files a person attribute of this name under. */
function variableIdByName(
  harness: StageEditorHarness,
  name: string,
): string | undefined {
  const definition = harness.protocolSections()[FAMILY_MEMBER_SECTION];
  const variables = isRecord(definition) ? definition.variables : undefined;
  if (!isRecord(variables)) return undefined;
  return Object.entries(variables).find(
    ([, variable]) => isRecord(variable) && variable.name === name,
  )?.[0];
}

const nodeConfigurationOf = (document: SectionDoc | undefined) =>
  isRecord(document?.nodeConfiguration) ? document.nodeConfiguration : {};

/** Switches on the question that asks each family member's gender identity. */
const switchOnGenderIdentity = async (
  harness: StageEditorHarness,
): Promise<void> => {
  await harness.user.click(
    await screen.findByRole('switch', { name: 'Ask about gender identity' }),
  );
};

describe('the family pedigree stage editor', () => {
  it('claims exactly this interface', () => {
    expect(Object.keys(familyPedigreeStageEditor)).toEqual(['FamilyPedigree']);
  });

  it('renders its sections in the order a researcher decides them', async () => {
    const harness = openFixture();

    await waitFor(() =>
      expect(harness.outline()).toHaveLength(SECTIONS.length),
    );
    expect(harness.outline().map((section) => section.title)).toEqual(SECTIONS);
  });

  it('owns every key the configured stage holds, and round-trips it', async () => {
    const harness = renderStageEditor({
      stage: familyPedigreeStageWith({
        form: {
          fields: [{ variable: 'fm_occupation', prompt: 'What do they do?' }],
        },
      }),
      editor: familyPedigreeEditor,
    });
    addFamilyMemberVariable(harness, 'fm_occupation', {
      name: 'fm_occupation',
      type: 'text',
      component: 'Text',
    });

    await harness.roundTrip({ unowned: [] });
  });

  it('opens a new stage on its default prompt with every slot empty', async () => {
    openNewStage();

    expect(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
    ).toHaveTextContent(
      'Add the members of your family. Select a person to add their relatives.',
    );
    // No person type yet, so there is nothing to bind attributes of.
    expect(screen.queryByText('Name', { selector: 'label' })).toBeNull();
  });

  /**
   * The researcher binds every slot themselves, and the document that results
   * is one the protocol schema accepts as a Family Pedigree stage.
   */
  it('saves a new stage the schema accepts once its slots are bound', async () => {
    const harness = openNewStage();

    await harness.user.click(
      await screen.findByRole('radio', { name: 'family member' }),
    );
    await bindSlot(harness, 'Name', 'fm_name');
    await switchOnGenderIdentity(harness);
    await bindSlot(harness, 'Gender identity', 'genderIdentity');
    await bindSlot(harness, 'Sex assigned at birth', 'sexAssignedAtBirth');
    await bindSlot(harness, 'Participant marker', 'is_ego');

    await harness.user.click(
      screen.getByRole('radio', { name: 'family_edge' }),
    );
    await bindSlot(harness, 'Relationship kind', 'relationshipKind');
    await bindSlot(harness, 'Gestational carrier', 'isGestationalCarrier');
    await bindSlot(harness, 'Current partner', 'isCurrentPartner');

    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      'Family',
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toEqual({
      id: 'family-pedigree-new',
      type: 'FamilyPedigree',
      label: 'Family',
      subject: { entity: 'node', type: 'family_member' },
      prompt:
        'Add the members of your family. Select a person to add their relatives.',
      nodeConfiguration: {
        nameVariable: 'fm_name',
        genderIdentity: {
          variable: 'genderIdentity',
          // The fixture attribute's options are the interface's defaults, so
          // binding it maps each to the words its default takes.
          terms: PEDIGREE_DEFAULT_GENDER_IDENTITIES.map(({ value, words }) => ({
            value,
            words,
          })),
        },
        sexAssignedAtBirthVariable: 'sexAssignedAtBirth',
        egoVariable: 'is_ego',
      },
      edgeConfiguration: {
        type: 'family_edge',
        kindVariable: 'relationshipKind',
        gestationalCarrierVariable: 'isGestationalCarrier',
        currentPartnerVariable: 'isCurrentPartner',
      },
    });
    expect(familyPedigreeStage.safeParse(request?.stageDocument).success).toBe(
      true,
    );
  });

  it('refuses a stage with no prompt', async () => {
    const harness = openFixture();

    await harness.user.clear(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      harness.outline().find((section) => section.title === 'Prompt')?.state,
    ).toBe('Has a problem');
  });

  it('refuses a stage with an unbound slot', async () => {
    const harness = renderStageEditor({
      stage: familyPedigreeStageWith({
        nodeConfiguration: {
          nameVariable: 'fm_name',
          genderIdentity: { variable: 'genderIdentity', terms: [] },
          sexAssignedAtBirthVariable: 'sexAssignedAtBirth',
        },
      }),
      editor: familyPedigreeEditor,
    });
    await harness.opened();

    expect(await harness.submit()).toBeNull();
    expect(
      harness.outline().find((section) => section.title === 'Person attributes')
        ?.state,
    ).toBe('Has a problem');
  });
});

describe('the attribute slots', () => {
  /**
   * Gender identity is the researcher's own list. A new attribute starts from
   * the six options the interface suggests, in the researcher's language, the
   * researcher may keep editing them, and the stage is given the words each
   * suggestion takes.
   */
  it('seeds a new gender identity attribute with editable options, and the words each takes', async () => {
    const harness = openFixture();
    await harness.opened();

    await inventAttribute(
      harness.user,
      attributeField('Gender identity'),
      'gender_new',
    );

    const editor = await screen.findByRole('dialog', {
      name: 'Create a new gender identity attribute',
    });
    expect(
      within(editor).getByRole('textbox', { name: 'Attribute name' }),
    ).toHaveValue('gender_new');
    // Not locked: the options can be added to.
    expect(
      within(editor).getByRole('button', { name: 'Create new option' }),
    ).toBeEnabled();
    expect(
      within(editor).queryByRole('table', {
        name: /automatically configured by the interface/i,
      }),
    ).toBeNull();
    await harness.user.click(
      within(editor).getByRole('button', { name: 'Create attribute' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const created = variableIdByName(harness, 'gender_new');
    expect(created).toEqual(expect.any(String));
    const variable =
      harness.protocolSections()[FAMILY_MEMBER_SECTION]?.variables;
    expect(
      isRecord(variable) ? variable[created ?? ''] : undefined,
    ).toMatchObject({
      type: 'categorical',
      options: [
        { value: 'woman', label: 'Woman' },
        { value: 'man', label: 'Man' },
        { value: 'nonBinary', label: 'Non-binary' },
        { value: 'differentIdentity', label: 'A different identity' },
        { value: 'unknown', label: 'Don’t know' },
        { value: 'preferNotToSay', label: 'Prefer not to say' },
      ],
    });
    expect(
      (isRecord(variable) ? variable[created ?? ''] : undefined) ?? {},
    ).not.toHaveProperty('readOnly');

    // The mapping appears for the new attribute, holding the defaults.
    expect(
      await screen.findByRole('combobox', { name: 'Words for Woman' }),
    ).toHaveValue('feminine');
    expect(screen.getByRole('combobox', { name: 'Words for Man' })).toHaveValue(
      'masculine',
    );
    expect(
      screen.getByRole('combobox', { name: 'Words for Don’t know' }),
    ).toHaveValue('unknown');
    expect(
      screen.getByRole('combobox', { name: 'Words for Non-binary' }),
    ).toHaveValue('neutral');

    const request = await harness.submit();
    expect(nodeConfigurationOf(request?.stageDocument)).toMatchObject({
      genderIdentity: {
        variable: created,
        terms: PEDIGREE_DEFAULT_GENDER_IDENTITIES.map(({ value, words }) => ({
          value,
          words,
        })),
      },
    });
    expect(familyPedigreeStage.safeParse(request?.stageDocument).success).toBe(
      true,
    );
  });

  it('creates a text attribute for the name from its picker, and binds it', async () => {
    const harness = openFixture();
    await harness.opened();

    await inventAttribute(harness.user, attributeField('Name'), 'nickname');

    await waitFor(() =>
      expect(
        within(attributeField('Name')).getByText('nickname'),
      ).toBeVisible(),
    );
    const created = variableIdByName(harness, 'nickname');
    expect(created).toEqual(expect.any(String));
    const request = await harness.submit();
    expect(nodeConfigurationOf(request?.stageDocument).nameVariable).toBe(
      created,
    );
  });

  it('offers only attributes of the slot’s type', async () => {
    const harness = openFixture();
    await harness.opened();

    expect(
      await offeredAttributes(harness.user, attributeField('Name')),
    ).toEqual(['fm_name']);
  });

  /**
   * The gestational carrier and current partner slots both take a boolean of
   * the relationship type, and each is exclusive: an attribute one has taken
   * in this edit is withheld from the other before anything is saved.
   */
  it('withholds an attribute another exclusive slot has just taken', async () => {
    const harness = renderStageEditor({
      stage: familyPedigreeStageWith({
        edgeConfiguration: {
          type: 'family_edge',
          kindVariable: 'relationshipKind',
        },
      }),
      editor: familyPedigreeEditor,
    });
    await harness.opened();

    await bindSlot(harness, 'Gestational carrier', 'isGestationalCarrier');

    expect(
      await offeredAttributes(harness.user, attributeField('Current partner')),
    ).toEqual(['isCurrentPartner']);
  });

  it('keeps the person attributes out of the additional fields', async () => {
    const harness = openFixture();
    await harness.opened();
    addFamilyMemberVariable(harness, 'fm_occupation', {
      name: 'fm_occupation',
      type: 'text',
      component: 'Text',
    });

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Additional person fields' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new person field' }),
    );
    const dialog = await screen.findByRole('dialog');
    const offered = await offeredAttributes(
      harness.user,
      attributeField('Attribute', dialog),
    );

    expect(offered).toContain('fm_occupation');
    for (const bound of [
      'fm_name',
      'genderIdentity',
      'sexAssignedAtBirth',
      'is_ego',
    ]) {
      expect(offered).not.toContain(bound);
    }
  });
});

describe('asking about gender identity', () => {
  const genderIdentitySwitch = () =>
    screen.findByRole('switch', { name: 'Ask about gender identity' });

  it('is on for a stage that holds a gender identity attribute, and says what off means', async () => {
    const harness = openFixture();
    await harness.opened();

    expect(await genderIdentitySwitch()).toBeChecked();
    expect(
      screen.getByText(
        'When off, relatives are described by their sex assigned at birth.',
      ),
    ).toBeVisible();
    expect(
      await screen.findByText('Gender identity', { selector: 'label' }),
    ).toBeVisible();
  });

  it('is off for a new stage, which asks nothing about gender identity', async () => {
    const harness = openNewStage();
    await harness.user.click(
      await screen.findByRole('radio', { name: 'family member' }),
    );

    expect(await genderIdentitySwitch()).not.toBeChecked();
    expect(
      screen.queryByText('Gender identity', { selector: 'label' }),
    ).toBeNull();
  });

  it('saves a stage the schema accepts with no gender identity at all', async () => {
    const harness = openNewStage();

    await harness.user.click(
      await screen.findByRole('radio', { name: 'family member' }),
    );
    await bindSlot(harness, 'Name', 'fm_name');
    await bindSlot(harness, 'Sex assigned at birth', 'sexAssignedAtBirth');
    await bindSlot(harness, 'Participant marker', 'is_ego');
    await harness.user.click(
      screen.getByRole('radio', { name: 'family_edge' }),
    );
    await bindSlot(harness, 'Relationship kind', 'relationshipKind');
    await bindSlot(harness, 'Gestational carrier', 'isGestationalCarrier');
    await bindSlot(harness, 'Current partner', 'isCurrentPartner');
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      'Family',
    );

    const request = await harness.submit();

    expect(nodeConfigurationOf(request?.stageDocument)).toEqual({
      nameVariable: 'fm_name',
      sexAssignedAtBirthVariable: 'sexAssignedAtBirth',
      egoVariable: 'is_ego',
    });
    expect(familyPedigreeStage.safeParse(request?.stageDocument).success).toBe(
      true,
    );
  });

  it('removes the attribute and the words together when switched off again', async () => {
    const harness = openFixture();
    await harness.opened();

    await harness.user.click(await genderIdentitySwitch());
    await harness.user.click(
      await screen.findByRole('button', { name: 'Stop asking' }),
    );

    const request = await harness.submit();
    expect(nodeConfigurationOf(request?.stageDocument)).not.toHaveProperty(
      'genderIdentity',
    );
    expect(familyPedigreeStage.safeParse(request?.stageDocument).success).toBe(
      true,
    );
    // The attribute stays in the codebook: only this stage stopped asking.
    expect(variableIdByName(harness, 'genderIdentity')).toEqual(
      expect.any(String),
    );
  });

  it('refuses a switched-on question with no attribute chosen', async () => {
    const harness = openNewStage();
    await harness.user.click(
      await screen.findByRole('radio', { name: 'family member' }),
    );
    await bindSlot(harness, 'Name', 'fm_name');
    await harness.user.click(await genderIdentitySwitch());
    await screen.findByText('Gender identity', { selector: 'label' });

    expect(await harness.submit()).toBeNull();
    expect(
      harness
        .outline()
        .find((section) => section.title === 'Ask about gender identity')
        ?.state,
    ).toBe('Has a problem');
  });
});

describe('the gender identity options, which this stage manages', () => {
  const OPTIONS = (harness: StageEditorHarness): unknown => {
    const variables =
      harness.protocolSections()[FAMILY_MEMBER_SECTION]?.variables;
    const gender = isRecord(variables) ? variables.genderIdentity : undefined;
    return isRecord(gender) ? gender.options : undefined;
  };

  it('edits them from the stage, and the words follow the options that remain', async () => {
    const harness = openFixture();
    await harness.opened();
    await screen.findByRole('combobox', {
      name: 'Words for Prefer not to say',
    });

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit options' }),
    );
    const dialog = within(
      await screen.findByRole('dialog', {
        name: 'Edit gender identity options',
      }),
    );
    // Editable here: this stage is the one that manages them.
    expect(
      dialog.getByRole('button', { name: 'Create new option' }),
    ).toBeEnabled();
    await harness.user.click(
      dialog.getByRole('button', { name: 'Remove option 6' }),
    );
    await harness.user.click(
      dialog.getByRole('button', { name: 'Save attribute' }),
    );

    await waitFor(() => expect(OPTIONS(harness)).toHaveLength(5));
    await waitFor(() =>
      expect(
        screen.queryByRole('combobox', { name: 'Words for Prefer not to say' }),
      ).toBeNull(),
    );
    const request = await harness.submit();
    const terms = (
      nodeConfigurationOf(request?.stageDocument).genderIdentity as {
        terms: { value: string }[];
      }
    ).terms;
    expect(terms.map((term) => term.value)).not.toContain('preferNotToSay');
    expect(terms).toHaveLength(5);
    expect(familyPedigreeStage.safeParse(request?.stageDocument).success).toBe(
      true,
    );
  });

  it('offers no way to edit them to a spectator', async () => {
    const harness = renderStageEditor({
      stageId: 'family-pedigree-1',
      editor: familyPedigreeEditor,
      readOnly: true,
    });
    await harness.opened();
    await screen.findByRole('combobox', { name: 'Words for Woman' });

    expect(screen.queryByRole('button', { name: 'Edit options' })).toBeNull();
  });
});

describe('the completeness requirement', () => {
  const switchOn = async (harness: StageEditorHarness) => {
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Completeness' }),
    );
  };

  it('is off by default, and a stage saved that way holds no completeness', async () => {
    const harness = openFixture();
    await harness.opened();

    expect(
      await screen.findByRole('switch', { name: 'Completeness' }),
    ).not.toBeChecked();
    expect(screen.queryByText('Relatives to record')).toBeNull();
    const request = await harness.submit();
    expect(request?.stageDocument).not.toHaveProperty('completeness');
  });

  it('offers both biological parents, required, when switched on', async () => {
    const harness = openFixture();
    await harness.opened();
    addFamilyMemberVariables(harness, {
      relativesNotRecorded: RELATIVES_NOT_RECORDED_VARIABLE,
    });

    await switchOn(harness);
    await bindSlot(harness, 'Relatives not recorded', 'relativesNotRecorded');

    expect(
      await screen.findByRole('option', { name: /Both biological parents/ }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: /Required/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      completeness: {
        scope: 'parents',
        enforcement: 'required',
        relativesNotRecordedVariable: 'relativesNotRecorded',
      },
    });
    expect(familyPedigreeStage.safeParse(request?.stageDocument).success).toBe(
      true,
    );
  });

  it('saves the scope and enforcement the researcher chooses', async () => {
    const harness = openFixture();
    await harness.opened();
    addFamilyMemberVariables(harness, {
      relativesNotRecorded: RELATIVES_NOT_RECORDED_VARIABLE,
    });

    await switchOn(harness);
    await bindSlot(harness, 'Relatives not recorded', 'relativesNotRecorded');
    await harness.user.click(
      await screen.findByRole('option', {
        name: /Three generations, to first cousins/,
      }),
    );
    await harness.user.click(
      screen.getByRole('option', { name: /Recommended/ }),
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      completeness: { scope: 'thirdDegree', enforcement: 'recommended' },
    });
  });

  it('refuses a switched-on requirement with no attribute for the answers', async () => {
    const harness = openFixture();
    await harness.opened();

    await switchOn(harness);
    await screen.findByText('Relatives not recorded', { selector: 'label' });

    expect(await harness.submit()).toBeNull();
    expect(
      harness.outline().find((section) => section.title === 'Completeness')
        ?.state,
    ).toBe('Has a problem');
  });

  it('seeds a new attribute with the owned options, locked', async () => {
    const harness = openFixture();
    await harness.opened();

    await switchOn(harness);
    await screen.findByText('Relatives not recorded', { selector: 'label' });
    await inventAttribute(
      harness.user,
      attributeField('Relatives not recorded'),
      'not_recorded',
    );

    const table = await screen.findByRole('table', {
      name: /automatically configured by the interface and cannot be modified/i,
    });
    expect(
      [...table.querySelectorAll('tbody tr')].map((row) =>
        [...row.querySelectorAll('td')].map(
          (cell) => cell.textContent?.trim() ?? '',
        ),
      ),
    ).toEqual(
      PEDIGREE_RELATIVES_NOT_RECORDED_OPTIONS.map((option) => [
        option.label,
        option.value,
      ]),
    );
  });

  it('removes the whole requirement when switched off again', async () => {
    const harness = renderStageEditor({
      stage: familyPedigreeStageWith({
        completeness: {
          scope: 'firstDegree',
          enforcement: 'required',
          relativesNotRecordedVariable: 'relativesNotRecorded',
        },
      }),
      editor: familyPedigreeEditor,
    });
    addFamilyMemberVariables(harness, {
      relativesNotRecorded: RELATIVES_NOT_RECORDED_VARIABLE,
    });
    await harness.opened();

    const toggle = await screen.findByRole('switch', { name: 'Completeness' });
    expect(toggle).toBeChecked();
    expect(
      await screen.findByRole('option', {
        name: /Parents, siblings and children/,
      }),
    ).toHaveAttribute('aria-selected', 'true');
    await harness.user.click(toggle);
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove the requirement' }),
    );

    const request = await harness.submit();
    expect(request?.stageDocument).not.toHaveProperty('completeness');
  });
});

describe('the gender identity words', () => {
  /** The fixture pedigree with its gender identity mapped as given. */
  const withTerms = (terms: readonly Record<string, unknown>[]) => {
    const nodeConfiguration =
      loadFixtureStage('family-pedigree-1').fields.nodeConfiguration;
    const genderIdentity = isRecord(nodeConfiguration)
      ? nodeConfiguration.genderIdentity
      : undefined;
    return familyPedigreeStageWith({
      nodeConfiguration: {
        ...(isRecord(nodeConfiguration) ? nodeConfiguration : {}),
        genderIdentity: {
          ...(isRecord(genderIdentity) ? genderIdentity : {}),
          terms: [...terms],
        },
      },
    });
  };

  const termsOf = (document: SectionDoc | undefined) => {
    const genderIdentity = nodeConfigurationOf(document).genderIdentity;
    return isRecord(genderIdentity) ? genderIdentity.terms : undefined;
  };

  it('has a row for each option of the attribute, set to the words it takes', async () => {
    const harness = openFixture();
    await harness.opened();

    for (const [label, words] of [
      ['Woman', 'feminine'],
      ['Man', 'masculine'],
      ['Non-binary', 'neutral'],
      ['A different identity', 'neutral'],
      ['Don’t know', 'unknown'],
      ['Prefer not to say', 'neutral'],
    ] as const) {
      expect(
        await screen.findByRole('combobox', { name: `Words for ${label}` }),
      ).toHaveValue(words);
    }
    const choices = within(
      screen.getByRole('combobox', { name: 'Words for Woman' }),
    );
    expect(
      choices.getAllByRole('option').map((choice) => choice.textContent),
    ).toEqual([
      'Feminine words (mother, sister)',
      'Masculine words (father, brother)',
      'Neutral words (parent, sibling)',
      'Not known (named from sex assigned at birth)',
    ]);
  });

  it('shows neutral words for an option the stage gives none', async () => {
    const harness = renderStageEditor({
      stage: withTerms([{ value: 'woman', words: 'feminine' }]),
      editor: familyPedigreeEditor,
    });
    await harness.opened();

    expect(
      await screen.findByRole('combobox', { name: 'Words for Woman' }),
    ).toHaveValue('feminine');
    expect(screen.getByRole('combobox', { name: 'Words for Man' })).toHaveValue(
      'neutral',
    );
  });

  it('writes the whole mapping when one option is changed', async () => {
    const harness = renderStageEditor({
      stage: withTerms([{ value: 'woman', words: 'feminine' }]),
      editor: familyPedigreeEditor,
    });
    await harness.opened();

    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Words for Man' }),
      'masculine',
    );

    const request = await harness.submit();
    expect(termsOf(request?.stageDocument)).toEqual([
      { value: 'woman', words: 'feminine' },
      { value: 'man', words: 'masculine' },
      { value: 'nonBinary', words: 'neutral' },
      { value: 'differentIdentity', words: 'neutral' },
      { value: 'unknown', words: 'neutral' },
      { value: 'preferNotToSay', words: 'neutral' },
    ]);
    expect(familyPedigreeStage.safeParse(request?.stageDocument).success).toBe(
      true,
    );
  });

  it('drops an entry for a value the attribute does not have', async () => {
    const harness = renderStageEditor({
      stage: withTerms([
        { value: 'woman', words: 'feminine' },
        { value: 'agender', words: 'masculine' },
      ]),
      editor: familyPedigreeEditor,
    });
    await harness.opened();
    await screen.findByRole('combobox', { name: 'Words for Woman' });

    const request = await harness.submit();
    const values = (termsOf(request?.stageDocument) as { value: string }[]).map(
      (term) => term.value,
    );
    expect(values).not.toContain('agender');
    expect(values).toContain('woman');
    expect(termsOf(request?.stageDocument)).toContainEqual({
      value: 'woman',
      words: 'feminine',
    });
  });

  it('is withheld until an attribute is chosen', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'family-pedigree-new',
        type: 'FamilyPedigree',
        fields: getInterfaceTemplate('FamilyPedigree'),
      },
      editor: familyPedigreeEditor,
    });
    await harness.user.click(
      await screen.findByRole('radio', { name: 'family member' }),
    );
    await switchOnGenderIdentity(harness);
    await screen.findByText('Gender identity', { selector: 'label' });
    expect(screen.queryByText('Words for each gender identity')).toBeNull();

    await bindSlot(harness, 'Gender identity', 'genderIdentity');

    expect(
      await screen.findByText('Words for each gender identity'),
    ).toBeVisible();
  });

  describe('when an existing attribute is bound to the slot', () => {
    const CUSTOM_GENDER = {
      name: 'customGender',
      type: 'categorical',
      options: [
        { value: 'woman', label: 'Female' },
        { value: 'agender', label: 'Agender' },
        { value: 'man', label: 'Male' },
        { value: 'unknown', label: 'Unsure' },
      ],
    };
    const OTHER_GENDER = {
      name: 'otherGender',
      type: 'categorical',
      options: [
        { value: 'preferNotToSay', label: 'No answer' },
        { value: 'woman', label: 'W' },
        { value: 'nonbinary', label: 'NB' },
      ],
    };

    /** A person type with no gender identity bound yet. */
    const openUnbound = async () => {
      const harness = renderStageEditor({
        stage: familyPedigreeStageWith({
          nodeConfiguration: {
            nameVariable: 'fm_name',
            sexAssignedAtBirthVariable: 'sexAssignedAtBirth',
            egoVariable: 'is_ego',
          },
        }),
        editor: familyPedigreeEditor,
      });
      addFamilyMemberVariables(harness, {
        customGender: CUSTOM_GENDER,
        otherGender: OTHER_GENDER,
      });
      await harness.opened();
      await switchOnGenderIdentity(harness);
      return harness;
    };

    it('prefills the words of the default each option’s value names, and neutral for the rest', async () => {
      const harness = await openUnbound();

      await bindSlot(harness, 'Gender identity', 'customGender');

      expect(
        await screen.findByRole('combobox', { name: 'Words for Female' }),
      ).toHaveValue('feminine');
      expect(
        screen.getByRole('combobox', { name: 'Words for Agender' }),
      ).toHaveValue('neutral');
      expect(
        screen.getByRole('combobox', { name: 'Words for Male' }),
      ).toHaveValue('masculine');
      expect(
        screen.getByRole('combobox', { name: 'Words for Unsure' }),
      ).toHaveValue('unknown');

      const request = await harness.submit();
      expect(termsOf(request?.stageDocument)).toEqual([
        { value: 'woman', words: 'feminine' },
        { value: 'agender', words: 'neutral' },
        { value: 'man', words: 'masculine' },
        { value: 'unknown', words: 'unknown' },
      ]);
    });

    it('does not rewrite a saved mapping when the stage is opened', async () => {
      const harness = renderStageEditor({
        stage: withTerms([
          { value: 'woman', words: 'neutral' },
          { value: 'man', words: 'feminine' },
        ]),
        editor: familyPedigreeEditor,
      });
      await harness.opened();
      expect(
        await screen.findByRole('combobox', { name: 'Words for Woman' }),
      ).toHaveValue('neutral');

      const request = await harness.submit();
      expect(termsOf(request?.stageDocument)).toEqual(
        expect.arrayContaining([
          { value: 'woman', words: 'neutral' },
          { value: 'man', words: 'feminine' },
        ]),
      );
    });

    it('replaces the mapping with one for the new options when another attribute is chosen', async () => {
      const harness = await openUnbound();
      await bindSlot(harness, 'Gender identity', 'customGender');
      await harness.user.selectOptions(
        await screen.findByRole('combobox', { name: 'Words for Agender' }),
        'masculine',
      );

      await bindSlot(harness, 'Gender identity', 'otherGender');

      expect(
        await screen.findByRole('combobox', { name: 'Words for NB' }),
      ).toHaveValue('neutral');
      const request = await harness.submit();
      expect(termsOf(request?.stageDocument)).toEqual([
        { value: 'preferNotToSay', words: 'neutral' },
        { value: 'woman', words: 'feminine' },
        { value: 'nonbinary', words: 'neutral' },
      ]);
    });
  });
});
