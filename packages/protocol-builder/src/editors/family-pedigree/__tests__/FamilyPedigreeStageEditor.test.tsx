import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  familyPedigreeStage,
  PEDIGREE_DEFAULT_GENDER_IDENTITIES,
  PEDIGREE_RELATIVES_NOT_RECORDED_OPTIONS,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import {
  attributeField,
  chooseAttributeById,
  FIELD_LABEL,
  inventAttribute,
  offeredAttributes,
} from '../../../testing/attributePicker.ts';
import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import { writeInto } from '../../__tests__/writeInto.ts';
import { familyPedigreeStageEditor } from '../FamilyPedigreeStageEditor.ts';
import { newNominationPromptId } from '../sections/NominationPromptsSection.tsx';
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
  familyPedigreeStageWithout,
} from './pedigreeFixtures.ts';

shimMarkdownEditorMeasurement();

const SECTIONS = [
  'Node setup',
  'Prompt',
  'Person attributes',
  'Ask about gender identity',
  'Relationships',
  'Wording',
  'Additional person fields',
  'Completeness',
  'Nomination prompts',
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
    create: { type: 'FamilyPedigree', position: 0 },
    editor: familyPedigreeEditor,
  });

const PROMPT_TEXT =
  'Add the people in your family. Select someone to add more.';

/** Writes the prompt a new stage starts without. */
const writePrompt = async (harness: StageEditorHarness): Promise<void> => {
  await writeInto(
    harness,
    await screen.findByRole('textbox', { name: 'Prompt text' }),
    PROMPT_TEXT,
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Binds one attribute slot, once its control is on screen. */
const bindSlot = async (
  harness: StageEditorHarness,
  label: string,
  variableId: string,
): Promise<void> => {
  await screen.findByText(label, { selector: FIELD_LABEL });
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

/** What each kind of kinship words is called where the researcher reads it. */
const WORDS = {
  feminine: 'Feminine words (mother, sister)',
  masculine: 'Masculine words (father, brother)',
  neutral: 'Neutral words (parent, sibling)',
  unknown:
    'Not known (neutral words; biological mother or father for a biological parent)',
} as const;

/**
 * The stage's read-only summary of the gender identity words, one
 * `[option label, words]` pair per row.
 */
const summaryRows = async (): Promise<(string | null)[][]> => {
  const table = await screen.findByRole('table', {
    name: 'Words for each gender identity',
  });
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    );
};

/** Opens the dialog that edits the gender identity options and their words. */
const openGenderOptions = async (harness: StageEditorHarness) => {
  await harness.user.click(
    await screen.findByRole('button', { name: 'Edit options' }),
  );
  return screen.findByRole('dialog', { name: 'Edit gender identity options' });
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
          fields: [
            {
              variable: 'fm_occupation',
              prompt: { 'en-US': 'What do they do?' },
            },
          ],
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

  it('opens a new stage with no prompt and every slot empty', async () => {
    openNewStage();

    expect(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
    ).toHaveTextContent('');
    // No person type yet, so there is nothing to bind attributes of.
    expect(screen.queryByText('Name', { selector: FIELD_LABEL })).toBeNull();
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
    await bindSlot(harness, 'Gender identity', 'genderIdentity');
    await bindSlot(harness, 'Sex assigned at birth', 'sexAssignedAtBirth');
    await bindSlot(harness, 'Participant marker', 'is_ego');

    await harness.user.click(
      screen.getByRole('radio', { name: 'family_edge' }),
    );
    await bindSlot(harness, 'Relationship kind', 'relationshipKind');
    await bindSlot(harness, 'Gestational carrier', 'isGestationalCarrier');
    await bindSlot(harness, 'Current partner', 'isCurrentPartner');

    await writePrompt(harness);

    const request = await harness.submit();
    expect(request?.stageDocument).toEqual({
      id: expect.any(String),
      type: 'FamilyPedigree',
      // Named for the person type and the interface until the researcher says otherwise.
      label: { 'en-US': expect.any(String) },
      subject: { entity: 'node', type: 'family_member' },
      prompt: { 'en-US': PROMPT_TEXT },
      nodeConfiguration: {
        nameAttribute: 'fm_name',
        genderIdentity: {
          attribute: 'genderIdentity',
          // The fixture attribute's options are the interface's defaults, so
          // binding it maps each to the words its default takes.
          terms: PEDIGREE_DEFAULT_GENDER_IDENTITIES.map(({ value, words }) => ({
            value,
            words,
          })),
        },
        sexAssignedAtBirthAttribute: 'sexAssignedAtBirth',
        egoAttribute: 'is_ego',
      },
      edgeConfiguration: {
        type: 'family_edge',
        kindAttribute: 'relationshipKind',
        gestationalCarrierAttribute: 'isGestationalCarrier',
        currentPartnerAttribute: 'isCurrentPartner',
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
          nameAttribute: 'fm_name',
          genderIdentity: { attribute: 'genderIdentity', terms: [] },
          sexAssignedAtBirthAttribute: 'sexAssignedAtBirth',
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
    // Wide enough for the words beside each option.
    expect(editor).toHaveClass('max-w-4xl');
    // The type is shown, not offered: the slot only takes a categorical one.
    expect(
      within(editor).getByRole('textbox', { name: 'Attribute type' }),
    ).toHaveAttribute('readonly');
    expect(
      within(editor).getByRole('textbox', { name: 'Attribute type' }),
    ).toHaveValue('Categorical');
    expect(
      within(editor).queryByRole('combobox', { name: 'Attribute type' }),
    ).toBeNull();
    // Each suggested option starts on the words its default takes, and offers
    // all four kinds.
    for (const [index, words] of [
      [1, 'feminine'],
      [2, 'masculine'],
      [3, 'neutral'],
      [4, 'neutral'],
      [5, 'unknown'],
      [6, 'neutral'],
    ] as const) {
      expect(
        within(editor).getByRole('combobox', {
          name: `Option ${index} kinship words`,
        }),
      ).toHaveValue(words);
    }
    expect(
      within(
        within(editor).getByRole('combobox', {
          name: 'Option 1 kinship words',
        }),
      )
        .getAllByRole('option')
        .map((choice) => choice.textContent),
    ).toEqual(Object.values(WORDS));
    // Chosen here, before the attribute exists.
    await harness.user.selectOptions(
      within(editor).getByRole('combobox', { name: 'Option 6 kinship words' }),
      'unknown',
    );
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
        { value: 'woman', label: { 'en-US': 'Woman' } },
        { value: 'man', label: { 'en-US': 'Man' } },
        { value: 'nonBinary', label: { 'en-US': 'Non-binary' } },
        {
          value: 'differentIdentity',
          label: { 'en-US': 'A different identity' },
        },
        { value: 'unknown', label: { 'en-US': 'Don’t know' } },
        { value: 'preferNotToSay', label: { 'en-US': 'Prefer not to say' } },
      ],
    });
    expect(
      (isRecord(variable) ? variable[created ?? ''] : undefined) ?? {},
    ).not.toHaveProperty('readOnly');

    // The stage shows the words chosen in the dialog, read-only.
    await waitFor(async () =>
      expect(await summaryRows()).toEqual([
        ['Woman', WORDS.feminine],
        ['Man', WORDS.masculine],
        ['Non-binary', WORDS.neutral],
        ['A different identity', WORDS.neutral],
        ['Don’t know', WORDS.unknown],
        ['Prefer not to say', WORDS.unknown],
      ]),
    );
    expect(
      screen.queryByRole('combobox', { name: /kinship words/ }),
    ).toBeNull();

    const request = await harness.submit();
    expect(nodeConfigurationOf(request?.stageDocument)).toMatchObject({
      genderIdentity: {
        attribute: created,
        terms: [
          { value: 'woman', words: 'feminine' },
          { value: 'man', words: 'masculine' },
          { value: 'nonBinary', words: 'neutral' },
          { value: 'differentIdentity', words: 'neutral' },
          { value: 'unknown', words: 'unknown' },
          { value: 'preferNotToSay', words: 'unknown' },
        ],
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
    expect(nodeConfigurationOf(request?.stageDocument).nameAttribute).toBe(
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
          kindAttribute: 'relationshipKind',
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

  /**
   * Gender identity and sex assigned at birth are both categorical attributes
   * the interface writes itself, and neither slot is exclusive: only this
   * rule keeps one stage from recording both answers in one attribute.
   */
  it('withholds the attribute another of the stage’s answers holds', async () => {
    const harness = openFixture();
    await harness.opened();

    const offered = await offeredAttributes(
      harness.user,
      attributeField('Gender identity'),
    );
    expect(offered).toContain('genderIdentity');
    expect(offered).not.toContain('sexAssignedAtBirth');
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

describe('the person attributes section', () => {
  it('says that a person’s symbol comes from the person type’s shape in the codebook', async () => {
    const harness = openFixture();
    await harness.opened();

    expect(
      await screen.findByText(/A person’s symbol comes from the shape/),
    ).toHaveTextContent(
      'changes how people of this type are drawn throughout the interview',
    );
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
        'When off, the question isn’t asked, and words such as mother or brother follow each person’s sex assigned at birth.',
      ),
    ).toBeVisible();
    expect(
      await screen.findByText('Gender identity', { selector: FIELD_LABEL }),
    ).toBeVisible();
  });

  it('is on for a new stage, which waits for the attribute like any other slot', async () => {
    const harness = openNewStage();
    await harness.user.click(
      await screen.findByRole('radio', { name: 'family member' }),
    );

    expect(await genderIdentitySwitch()).toBeChecked();
    expect(
      await screen.findByText('Gender identity', { selector: FIELD_LABEL }),
    ).toBeVisible();
  });

  it('is off for a stage that exists without it, and opening the stage does not add it', async () => {
    const harness = renderStageEditor({
      stage: familyPedigreeStageWith({
        nodeConfiguration: {
          nameAttribute: 'fm_name',
          sexAssignedAtBirthAttribute: 'sexAssignedAtBirth',
          egoAttribute: 'is_ego',
        },
      }),
      editor: familyPedigreeEditor,
    });
    await harness.opened();

    expect(await genderIdentitySwitch()).not.toBeChecked();
    expect(
      screen.queryByText('Gender identity', { selector: FIELD_LABEL }),
    ).toBeNull();

    const request = await harness.submit();
    expect(nodeConfigurationOf(request?.stageDocument)).toEqual({
      nameAttribute: 'fm_name',
      sexAssignedAtBirthAttribute: 'sexAssignedAtBirth',
      egoAttribute: 'is_ego',
    });
  });

  it('sits inside the person attributes, after sex assigned at birth', async () => {
    const harness = openNewStage();
    await harness.user.click(
      await screen.findByRole('radio', { name: 'family member' }),
    );
    const sex = await screen.findByText('Sex assigned at birth', {
      selector: FIELD_LABEL,
    });
    const gender = await screen.findByText('Gender identity', {
      selector: FIELD_LABEL,
    });
    const section = screen.getByRole('region', { name: 'Person attributes' });

    expect(section).toContainElement(gender);
    expect(
      sex.compareDocumentPosition(gender) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(harness.outline().map((entry) => entry.title)).toContain(
      'Ask about gender identity',
    );
  });

  it('saves a stage the schema accepts with no gender identity at all', async () => {
    const harness = openNewStage();

    await harness.user.click(
      await screen.findByRole('radio', { name: 'family member' }),
    );
    // Switched on for a new stage; switching it off leaves nothing behind.
    await harness.user.click(await genderIdentitySwitch());
    expect(screen.queryByRole('dialog')).toBeNull();
    await bindSlot(harness, 'Name', 'fm_name');
    await bindSlot(harness, 'Sex assigned at birth', 'sexAssignedAtBirth');
    await bindSlot(harness, 'Participant marker', 'is_ego');
    await harness.user.click(
      screen.getByRole('radio', { name: 'family_edge' }),
    );
    await bindSlot(harness, 'Relationship kind', 'relationshipKind');
    await bindSlot(harness, 'Gestational carrier', 'isGestationalCarrier');
    await bindSlot(harness, 'Current partner', 'isCurrentPartner');
    await writePrompt(harness);
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      'Family',
    );

    const request = await harness.submit();

    expect(nodeConfigurationOf(request?.stageDocument)).toEqual({
      nameAttribute: 'fm_name',
      sexAssignedAtBirthAttribute: 'sexAssignedAtBirth',
      egoAttribute: 'is_ego',
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

  it('refuses a new stage whose gender identity attribute is not chosen yet, and says so', async () => {
    const harness = openNewStage();
    await harness.user.click(
      await screen.findByRole('radio', { name: 'family member' }),
    );
    await bindSlot(harness, 'Name', 'fm_name');
    await screen.findByText('Gender identity', { selector: FIELD_LABEL });

    expect(await harness.submit()).toBeNull();
    expect(
      harness
        .outline()
        .find((section) => section.title === 'Ask about gender identity')
        ?.state,
    ).toBe('Has a problem');
    expect(
      within(attributeField('Gender identity')).getByText(
        'This field is required.',
      ),
    ).toBeVisible();
  });
});

describe('the gender identity options, which this stage manages', () => {
  const OPTIONS = (harness: StageEditorHarness): unknown => {
    const variables =
      harness.protocolSections()[FAMILY_MEMBER_SECTION]?.variables;
    const gender = isRecord(variables) ? variables.genderIdentity : undefined;
    return isRecord(gender) ? gender.options : undefined;
  };

  const termsSaved = async (harness: StageEditorHarness) => {
    const request = await harness.submit();
    expect(familyPedigreeStage.safeParse(request?.stageDocument).success).toBe(
      true,
    );
    return (
      nodeConfigurationOf(request?.stageDocument).genderIdentity as {
        terms: unknown;
      }
    ).terms;
  };

  it('edits the options and their words together in one wide dialog, with the type shown read-only', async () => {
    const harness = openFixture();
    await harness.opened();
    const dialogElement = await openGenderOptions(harness);
    const dialog = within(dialogElement);

    expect(dialogElement).toHaveClass('max-w-4xl');
    expect(
      dialog.getByRole('textbox', { name: 'Attribute type' }),
    ).toHaveAttribute('readonly');
    expect(
      dialog.queryByRole('combobox', { name: 'Attribute type' }),
    ).toBeNull();
    // Editable here: this stage is the one that manages them.
    expect(
      dialog.getByRole('button', { name: 'Create new option' }),
    ).toBeEnabled();
    // Each row opens on the words this stage gives its option.
    for (const [index, words] of [
      [1, 'feminine'],
      [2, 'masculine'],
      [3, 'neutral'],
      [4, 'neutral'],
      [5, 'unknown'],
      [6, 'neutral'],
    ] as const) {
      expect(
        dialog.getByRole('combobox', { name: `Option ${index} kinship words` }),
      ).toHaveValue(words);
    }
  });

  it('saves the words chosen in the dialog to the stage, and the summary follows', async () => {
    const harness = openFixture();
    await harness.opened();
    const dialog = within(await openGenderOptions(harness));

    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Option 3 kinship words' }),
      'feminine',
    );
    await harness.user.click(
      dialog.getByRole('button', { name: 'Save attribute' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // The codebook is untouched: only the words changed.
    expect(OPTIONS(harness)).toHaveLength(6);
    expect((await summaryRows())[2]).toEqual(['Non-binary', WORDS.feminine]);
    expect(await termsSaved(harness)).toEqual([
      { value: 'woman', words: 'feminine' },
      { value: 'man', words: 'masculine' },
      { value: 'nonBinary', words: 'feminine' },
      { value: 'differentIdentity', words: 'neutral' },
      { value: 'unknown', words: 'unknown' },
      { value: 'preferNotToSay', words: 'neutral' },
    ]);
  });

  it('gives a new option neutral words, and drops a removed option from the mapping', async () => {
    const harness = openFixture();
    await harness.opened();
    const dialog = within(await openGenderOptions(harness));

    await harness.user.click(
      dialog.getByRole('button', { name: 'Remove option 6' }),
    );
    await harness.user.click(
      dialog.getByRole('button', { name: 'Create new option' }),
    );
    expect(
      dialog.getByRole('combobox', { name: 'Option 6 kinship words' }),
    ).toHaveValue('neutral');
    await writeInto(
      harness,
      dialog.getByRole('textbox', { name: 'Option 6 label' }),
      'Agender',
    );
    await harness.user.type(
      dialog.getByRole('textbox', { name: 'Option 6 value' }),
      'agender',
    );
    await harness.user.click(
      dialog.getByRole('button', { name: 'Save attribute' }),
    );

    await waitFor(() => expect(OPTIONS(harness)).toHaveLength(6));
    await waitFor(async () =>
      expect((await summaryRows()).map(([label]) => label)).toEqual([
        'Woman',
        'Man',
        'Non-binary',
        'A different identity',
        'Don’t know',
        'Agender',
      ]),
    );
    expect(await termsSaved(harness)).toEqual([
      { value: 'woman', words: 'feminine' },
      { value: 'man', words: 'masculine' },
      { value: 'nonBinary', words: 'neutral' },
      { value: 'differentIdentity', words: 'neutral' },
      { value: 'unknown', words: 'unknown' },
      { value: 'agender', words: 'neutral' },
    ]);
  });

  it('keeps the words a stage gave its options when the dialog is cancelled', async () => {
    const harness = openFixture();
    await harness.opened();
    const dialog = within(await openGenderOptions(harness));

    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Option 1 kinship words' }),
      'neutral',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect((await summaryRows())[0]).toEqual(['Woman', WORDS.feminine]);
  });

  it('offers no way to edit them to a spectator', async () => {
    const harness = renderStageEditor({
      stageId: 'family-pedigree-1',
      editor: familyPedigreeEditor,
      readOnly: true,
    });
    await harness.opened();
    expect((await summaryRows())[0]).toEqual(['Woman', WORDS.feminine]);

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
        relativesNotRecordedAttribute: 'relativesNotRecorded',
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
    await screen.findByText('Relatives not recorded', {
      selector: FIELD_LABEL,
    });

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
    await screen.findByText('Relatives not recorded', {
      selector: FIELD_LABEL,
    });
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
          relativesNotRecordedAttribute: 'relativesNotRecorded',
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

  it('shows each option of the attribute with the words it takes, read-only', async () => {
    const harness = openFixture();
    await harness.opened();

    expect(await summaryRows()).toEqual([
      ['Woman', WORDS.feminine],
      ['Man', WORDS.masculine],
      ['Non-binary', WORDS.neutral],
      ['A different identity', WORDS.neutral],
      ['Don’t know', WORDS.unknown],
      ['Prefer not to say', WORDS.neutral],
    ]);
    // Next to the button that edits them, and nothing to edit here.
    expect(
      await screen.findByRole('button', { name: 'Edit options' }),
    ).toBeVisible();
    expect(screen.queryByRole('combobox', { name: /words/i })).toBeNull();
  });

  it('shows neutral words for an option the stage gives none', async () => {
    const harness = renderStageEditor({
      stage: withTerms([{ value: 'woman', words: 'feminine' }]),
      editor: familyPedigreeEditor,
    });
    await harness.opened();

    const rows = await summaryRows();
    expect(rows[0]).toEqual(['Woman', WORDS.feminine]);
    expect(rows[1]).toEqual(['Man', WORDS.neutral]);
  });

  it('writes the whole mapping when one option’s words are changed in the dialog', async () => {
    const harness = renderStageEditor({
      stage: withTerms([{ value: 'woman', words: 'feminine' }]),
      editor: familyPedigreeEditor,
    });
    await harness.opened();
    const dialog = within(await openGenderOptions(harness));

    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Option 2 kinship words' }),
      'masculine',
    );
    await harness.user.click(
      dialog.getByRole('button', { name: 'Save attribute' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

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
    await summaryRows();

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

  it('shows each option and its words in a table with Option and Kinship words columns', async () => {
    const harness = openFixture();
    await harness.opened();
    const table = await screen.findByRole('table', {
      name: 'Words for each gender identity',
    });

    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Option', 'Kinship words']);
    expect((await summaryRows())[1]).toEqual(['Man', WORDS.masculine]);
  });

  it('is withheld until an attribute is chosen', async () => {
    const harness = openNewStage();
    await harness.user.click(
      await screen.findByRole('radio', { name: 'family member' }),
    );
    await screen.findByText('Gender identity', { selector: FIELD_LABEL });
    expect(
      screen.queryByRole('table', { name: 'Words for each gender identity' }),
    ).toBeNull();

    await bindSlot(harness, 'Gender identity', 'genderIdentity');

    expect(
      await screen.findByRole('table', {
        name: 'Words for each gender identity',
      }),
    ).toBeVisible();
  });

  describe('when an existing attribute is bound to the slot', () => {
    const CUSTOM_GENDER = {
      name: 'customGender',
      type: 'categorical',
      options: [
        { value: 'woman', label: { 'en-US': 'Female' } },
        { value: 'agender', label: { 'en-US': 'Agender' } },
        { value: 'man', label: { 'en-US': 'Male' } },
        { value: 'unknown', label: { 'en-US': 'Unsure' } },
      ],
    };
    const OTHER_GENDER = {
      name: 'otherGender',
      type: 'categorical',
      options: [
        { value: 'preferNotToSay', label: { 'en-US': 'No answer' } },
        { value: 'woman', label: { 'en-US': 'W' } },
        { value: 'nonbinary', label: { 'en-US': 'NB' } },
      ],
    };

    /** A person type with no gender identity bound yet. */
    const openUnbound = async () => {
      const harness = renderStageEditor({
        stage: familyPedigreeStageWith({
          nodeConfiguration: {
            nameAttribute: 'fm_name',
            sexAssignedAtBirthAttribute: 'sexAssignedAtBirth',
            egoAttribute: 'is_ego',
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

      expect(await summaryRows()).toEqual([
        ['Female', WORDS.feminine],
        ['Agender', WORDS.neutral],
        ['Male', WORDS.masculine],
        ['Unsure', WORDS.unknown],
      ]);

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
      expect((await summaryRows())[0]).toEqual(['Woman', WORDS.neutral]);

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
      const dialog = within(await openGenderOptions(harness));
      await harness.user.selectOptions(
        dialog.getByRole('combobox', { name: 'Option 2 kinship words' }),
        'masculine',
      );
      await harness.user.click(
        dialog.getByRole('button', { name: 'Save attribute' }),
      );
      await waitFor(async () =>
        expect((await summaryRows())[1]).toEqual(['Agender', WORDS.masculine]),
      );

      await bindSlot(harness, 'Gender identity', 'otherGender');

      await waitFor(async () =>
        expect(await summaryRows()).toEqual([
          ['No answer', WORDS.neutral],
          ['W', WORDS.feminine],
          ['NB', WORDS.neutral],
        ]),
      );
      const request = await harness.submit();
      expect(termsOf(request?.stageDocument)).toEqual([
        { value: 'preferNotToSay', words: 'neutral' },
        { value: 'woman', words: 'feminine' },
        { value: 'nonbinary', words: 'neutral' },
      ]);
    });
  });
});

describe('the wording', () => {
  const choice = (name: RegExp) => screen.findByRole('option', { name });

  const framingOf = (document: SectionDoc | undefined): unknown =>
    document?.framing;

  it('is everyday kinship words for a stage that stores nothing, and saving it stores nothing', async () => {
    const harness = openFixture();
    await harness.opened();

    expect(await choice(/^Everyday kinship words/)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const request = await harness.submit();
    expect(request?.stageDocument).not.toHaveProperty('framing');
  });

  it('describes each choice by where the words come from', async () => {
    const harness = openFixture();
    await harness.opened();

    expect(await choice(/^Everyday kinship words/)).toHaveTextContent(
      'A person’s words come from their gender identity when this stage asks about it, and from their sex assigned at birth when it does not.',
    );
    expect(await choice(/^Egg parent and sperm parent/)).toHaveTextContent(
      'Every other relative gets a neutral word',
    );
    expect(await choice(/^Let the participant choose/)).toHaveTextContent(
      'when they first reach the stage',
    );
  });

  it.each([
    ['Egg parent and sperm parent', 'gamete'],
    ['Let the participant choose', 'participantPreference'],
  ])('saves %s as framing "%s"', async (label, framing) => {
    const harness = openFixture();
    await harness.opened();

    await harness.user.click(await choice(new RegExp(`^${label}`)));

    const request = await harness.submit();
    expect(framingOf(request?.stageDocument)).toBe(framing);
    expect(familyPedigreeStage.safeParse(request?.stageDocument).success).toBe(
      true,
    );
  });

  it('removes the key again when the everyday words are chosen back', async () => {
    const harness = renderStageEditor({
      stage: familyPedigreeStageWith({ framing: 'gamete' }),
      editor: familyPedigreeEditor,
    });
    await harness.opened();
    expect(await choice(/^Egg parent and sperm parent/)).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await harness.user.click(await choice(/^Everyday kinship words/));

    const request = await harness.submit();
    expect(request?.stageDocument).not.toHaveProperty('framing');
  });

  it('keeps a saved choice when the stage is opened and saved untouched', async () => {
    const harness = renderStageEditor({
      stage: familyPedigreeStageWith({ framing: 'participantPreference' }),
      editor: familyPedigreeEditor,
    });
    await harness.opened();

    expect(await choice(/^Let the participant choose/)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const request = await harness.submit();
    expect(framingOf(request?.stageDocument)).toBe('participantPreference');
  });
});

describe('the nomination prompts', () => {
  const HEART_DISEASE = 'has_heart_disease';
  /** The boolean the fixture pedigree's own nomination prompt sets. */
  const FIXTURE_PROMPT_FLAG = 'hasConditionX';

  const nominationPromptsOf = (
    document: SectionDoc | undefined,
  ): Record<string, unknown>[] =>
    Array.isArray(document?.nominationPrompts)
      ? document.nominationPrompts.filter(isRecord)
      : [];

  /**
   * The fixture pedigree asks one nomination prompt (the narrative pedigree's
   * disease reads it), so these start from the stage without it.
   */
  const openWithoutPrompts = () =>
    renderStageEditor({
      stage: familyPedigreeStageWithout(['nominationPrompts']),
      editor: familyPedigreeEditor,
    });

  const savedPrompt = {
    id: 'nomination-1',
    text: { 'en-US': 'Who in your family has had heart disease?' },
    attribute: HEART_DISEASE,
    onlyForSexAssignedAtBirth: 'female',
  };

  const openWithAPrompt = async () => {
    const harness = renderStageEditor({
      stage: familyPedigreeStageWith({ nominationPrompts: [savedPrompt] }),
      editor: familyPedigreeEditor,
    });
    addFamilyMemberVariable(harness, HEART_DISEASE, {
      name: HEART_DISEASE,
      type: 'boolean',
    });
    await harness.opened();
    return harness;
  };

  const startAPrompt = async (harness: StageEditorHarness) => {
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Create new nomination prompt',
      }),
    );
    await writeInto(
      harness,
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'Who has had diabetes?',
    );
    return await screen.findByRole('dialog');
  };

  const addThePrompt = async (harness: StageEditorHarness) => {
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  };

  /**
   * Two prompts setting one attribute would record their answers as one, so
   * a new prompt is not offered the attribute an existing prompt sets — while
   * the existing prompt keeps it on offer for itself.
   */
  it('offers a new prompt no attribute another prompt sets', async () => {
    const harness = await openWithAPrompt();
    const dialog = await startAPrompt(harness);
    expect(
      await offeredAttributes(
        harness.user,
        attributeField('Attribute', dialog),
      ),
    ).not.toContain(HEART_DISEASE);
  });

  it('keeps a prompt’s own attribute on offer when it is edited', async () => {
    const harness = await openWithAPrompt();
    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit nomination prompt' }),
    );
    const editing = await screen.findByRole('dialog');
    expect(
      await offeredAttributes(
        harness.user,
        attributeField('Attribute', editing),
      ),
    ).toContain(HEART_DISEASE);
  });

  it('asks nothing of the whole family until a prompt is created, and saves no key', async () => {
    const harness = openWithoutPrompts();
    await harness.opened();

    expect(
      await screen.findByText(
        'No nomination prompts yet. Create one to ask about the whole family.',
      ),
    ).toBeInTheDocument();
    const request = await harness.submit();
    expect(request?.stageDocument).not.toHaveProperty('nominationPrompts');
  });

  it('saves a schema-valid stage for a prompt with a created attribute and a sex limit', async () => {
    const harness = openWithoutPrompts();
    await harness.opened();
    const dialog = await startAPrompt(harness);

    await inventAttribute(
      harness.user,
      attributeField('Attribute', dialog),
      'has_diabetes',
    );
    await waitFor(() =>
      expect(
        within(attributeField('Attribute', dialog)).getByText('has_diabetes'),
      ).toBeVisible(),
    );
    await harness.user.click(
      within(dialog).getByRole('option', {
        name: 'Anyone except people assigned male at birth',
      }),
    );
    await addThePrompt(harness);

    const created = variableIdByName(harness, 'has_diabetes');
    expect(created).toEqual(expect.any(String));
    expect(
      harness.protocolSections()[FAMILY_MEMBER_SECTION]?.variables,
    ).toMatchObject({ [created ?? '']: { type: 'boolean' } });
    const request = await harness.submit();
    expect(nominationPromptsOf(request?.stageDocument)).toEqual([
      {
        id: expect.any(String),
        text: { 'en-US': 'Who has had diabetes?' },
        attribute: created,
        onlyForSexAssignedAtBirth: 'female',
      },
    ]);
    expect(familyPedigreeStage.safeParse(request?.stageDocument).success).toBe(
      true,
    );
  });

  it('writes no limit for a prompt open to anyone', async () => {
    const harness = openWithoutPrompts();
    addFamilyMemberVariable(harness, HEART_DISEASE, {
      name: HEART_DISEASE,
      type: 'boolean',
    });
    await harness.opened();
    const dialog = await startAPrompt(harness);
    expect(
      within(dialog).getByRole('option', { name: 'Anyone' }),
    ).toHaveAttribute('aria-selected', 'true');
    await chooseAttributeById(
      harness.user,
      attributeField('Attribute', dialog),
      HEART_DISEASE,
    );
    await addThePrompt(harness);

    const request = await harness.submit();
    const [prompt] = nominationPromptsOf(request?.stageDocument);
    expect(prompt).toEqual({
      id: expect.any(String),
      text: { 'en-US': 'Who has had diabetes?' },
      attribute: HEART_DISEASE,
    });
    expect(prompt).not.toHaveProperty('onlyForSexAssignedAtBirth');
    expect(familyPedigreeStage.safeParse(request?.stageDocument).success).toBe(
      true,
    );
  });

  it('opens a saved prompt on what it holds, including its limit, and saves it unchanged', async () => {
    const harness = await openWithAPrompt();

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit nomination prompt' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByRole('option', {
        name: 'Anyone except people assigned male at birth',
      }),
    ).toHaveAttribute('aria-selected', 'true');
    await harness.user.click(
      within(dialog).getByRole('button', { name: 'Save' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const request = await harness.submit();
    expect(nominationPromptsOf(request?.stageDocument)).toEqual([savedPrompt]);
  });

  it('drops the key when the last prompt is removed, and the stage is still valid', async () => {
    const harness = await openWithAPrompt();

    await harness.user.click(
      await screen.findByRole('button', { name: 'Delete nomination prompt' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Delete nomination prompt' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText('Who in your family has had heart disease?'),
      ).toBeNull(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument).not.toHaveProperty('nominationPrompts');
    expect(familyPedigreeStage.safeParse(request?.stageDocument).success).toBe(
      true,
    );
  });

  it('never gives a prompt the id the interview keeps for building the family', async () => {
    const randomUUID = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('pedigree' as ReturnType<typeof crypto.randomUUID>);
    try {
      expect(newNominationPromptId()).not.toBe('pedigree');
      // The first draw was the reserved word, so a second one was made.
      expect(randomUUID).toHaveBeenCalledTimes(2);
    } finally {
      randomUUID.mockRestore();
    }

    const harness = openWithoutPrompts();
    await harness.opened();
    const dialog = await startAPrompt(harness);
    await inventAttribute(
      harness.user,
      attributeField('Attribute', dialog),
      'has_diabetes',
    );
    await waitFor(() =>
      expect(
        within(attributeField('Attribute', dialog)).getByText('has_diabetes'),
      ).toBeVisible(),
    );
    await addThePrompt(harness);
    const request = await harness.submit();
    const [prompt] = nominationPromptsOf(request?.stageDocument);
    expect(prompt?.id).toEqual(expect.any(String));
    expect(prompt?.id).not.toBe('pedigree');
  });

  it('offers only boolean attributes nothing else has claimed', async () => {
    const harness = renderStageEditor({
      stage: familyPedigreeStageWith({
        form: {
          fields: [{ variable: 'has_pets', prompt: { 'en-US': 'Any pets?' } }],
        },
      }),
      editor: familyPedigreeEditor,
    });
    addFamilyMemberVariables(harness, {
      [HEART_DISEASE]: { name: HEART_DISEASE, type: 'boolean' },
      has_pets: { name: 'has_pets', type: 'boolean', component: 'Toggle' },
      fm_nickname: { name: 'fm_nickname', type: 'text', component: 'Text' },
    });
    await harness.opened();
    const dialog = await startAPrompt(harness);

    // Not the participant marker, which the interface owns; not the attribute
    // an additional field of this very stage collects, which is validated;
    // not the text one; and not the fixture's own prompt flag, since two
    // prompts setting one attribute would record their answers as one.
    expect(
      await offeredAttributes(
        harness.user,
        attributeField('Attribute', dialog),
      ),
    ).toEqual([HEART_DISEASE]);
  });

  /**
   * An exclusive slot may be written by nothing else, and a nomination prompt
   * writes its attribute onto every person it is answered for. Offering the one
   * to the other passes each picker and then fails the whole protocol's
   * validation at save.
   */
  describe('against the participant marker', () => {
    const OTHER_FLAG = 'has_asthma';

    it('does not offer the participant marker an attribute a prompt sets', async () => {
      const harness = await openWithAPrompt();
      addFamilyMemberVariable(harness, OTHER_FLAG, {
        name: OTHER_FLAG,
        type: 'boolean',
      });

      const offered = await offeredAttributes(
        harness.user,
        attributeField('Participant marker'),
      );

      expect(offered).toContain(OTHER_FLAG);
      expect(offered).not.toContain(HEART_DISEASE);
    });

    it('counts a prompt added in this edit, before anything is saved', async () => {
      const harness = openWithoutPrompts();
      addFamilyMemberVariables(harness, {
        [HEART_DISEASE]: { name: HEART_DISEASE, type: 'boolean' },
        [OTHER_FLAG]: { name: OTHER_FLAG, type: 'boolean' },
      });
      await harness.opened();
      const dialog = await startAPrompt(harness);
      await chooseAttributeById(
        harness.user,
        attributeField('Attribute', dialog),
        HEART_DISEASE,
      );
      await addThePrompt(harness);

      const offered = await offeredAttributes(
        harness.user,
        attributeField('Participant marker'),
      );

      expect(offered).toContain(OTHER_FLAG);
      expect(offered).not.toContain(HEART_DISEASE);
    });

    it('does not offer a prompt the attribute the participant marker has just taken', async () => {
      const harness = openWithoutPrompts();
      addFamilyMemberVariables(harness, {
        [HEART_DISEASE]: { name: HEART_DISEASE, type: 'boolean' },
        [OTHER_FLAG]: { name: OTHER_FLAG, type: 'boolean' },
      });
      await harness.opened();
      await bindSlot(harness, 'Participant marker', OTHER_FLAG);
      const dialog = await startAPrompt(harness);

      expect(
        await offeredAttributes(
          harness.user,
          attributeField('Attribute', dialog),
        ),
      ).toEqual([HEART_DISEASE, FIXTURE_PROMPT_FLAG]);
    });
  });

  it('keeps a nomination attribute out of the additional fields', async () => {
    const harness = await openWithAPrompt();

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Additional person fields' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new person field' }),
    );
    const dialog = await screen.findByRole('dialog');

    expect(
      await offeredAttributes(
        harness.user,
        attributeField('Attribute', dialog),
      ),
    ).not.toContain(HEART_DISEASE);
  });
});

/**
 * A narrative pedigree resolves every disease it draws through its source
 * pedigree's node type, so a type change under one leaves it naming
 * attributes the new type does not have — a protocol nobody could publish,
 * and one this editor cannot repair: the stage that would have to be remapped
 * is not the stage it is editing. The fixture's `narrative-pedigree-1` reads
 * `family-pedigree-1`.
 */
describe('the node type, while a narrative pedigree reads this stage', () => {
  it('says which stages read this pedigree', async () => {
    openFixture();

    expect(
      await screen.findByText('Other stages read this pedigree'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /these stages visualize this pedigree.*"Narrative Pedigree"/i,
      ),
    ).toBeInTheDocument();
  });

  it('refuses a node type change, naming the stages in its way', async () => {
    const harness = openFixture();

    await harness.user.click(
      await screen.findByRole('radio', { name: 'person' }),
    );

    expect(
      await screen.findByText('Cannot change node type'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/"Narrative Pedigree" reads this pedigree/),
    ).toBeInTheDocument();
    // Refused rather than confirmed: no answer to the usual question would
    // let the change through.
    expect(
      screen.queryByRole('button', { name: 'Change the node type' }),
    ).not.toBeInTheDocument();

    await harness.user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.queryAllByRole('dialog')).toHaveLength(0);
    });
    expect(screen.getByRole('radio', { name: 'family member' })).toBeChecked();
  });

  it('says nothing of other stages on a pedigree nothing reads', async () => {
    openNewStage();

    await screen.findByRole('radio', { name: 'person' });
    expect(
      screen.queryByText('Other stages read this pedigree'),
    ).not.toBeInTheDocument();
  });
});
