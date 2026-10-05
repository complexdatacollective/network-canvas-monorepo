import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  familyPedigreeStage,
  PEDIGREE_GENDER_IDENTITY_OPTIONS,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import {
  attributeField,
  chooseAttributeById,
  inventAttribute,
  offeredAttributes,
} from '../../../testing/attributePicker.ts';
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
  FAMILY_MEMBER_SECTION,
  familyPedigreeStageWith,
} from './pedigreeFixtures.ts';

shimMarkdownEditorMeasurement();

const SECTIONS = [
  'Node setup',
  'Person attributes',
  'Relationships',
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

const personAttributesOf = (document: SectionDoc | undefined) =>
  isRecord(document?.personAttributes) ? document.personAttributes : {};

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
      personAttributes: {
        nameVariable: 'fm_name',
        genderIdentityVariable: 'genderIdentity',
        sexAssignedAtBirthVariable: 'sexAssignedAtBirth',
        egoVariable: 'is_ego',
      },
      relationship: {
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
        personAttributes: {
          nameVariable: 'fm_name',
          genderIdentityVariable: 'genderIdentity',
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
   * A categorical slot whose values the interface owns creates its attribute
   * through the codebook editor, seeded with exactly the owned set and locked.
   */
  it('seeds a new gender identity attribute with the owned options, locked', async () => {
    const harness = openFixture();
    await harness.opened();

    await inventAttribute(
      harness.user,
      attributeField('Gender identity'),
      'gender',
    );

    expect(
      await screen.findByRole('textbox', { name: 'Attribute name' }),
    ).toHaveValue('gender');
    const table = screen.getByRole('table', {
      name: /automatically configured by the interface and cannot be modified/i,
    });
    expect(
      [...table.querySelectorAll('tbody tr')].map((row) =>
        [...row.querySelectorAll('td')].map(
          (cell) => cell.textContent?.trim() ?? '',
        ),
      ),
    ).toEqual(
      PEDIGREE_GENDER_IDENTITY_OPTIONS.map((option) => [
        option.label,
        option.value,
      ]),
    );
    expect(
      screen.queryByRole('button', { name: 'Create new option' }),
    ).not.toBeInTheDocument();
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
    expect(personAttributesOf(request?.stageDocument).nameVariable).toBe(
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
        relationship: {
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
