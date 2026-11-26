import { describe, expect, it } from 'vitest';

import { familyPedigreeWordingIn } from '@codaco/interview/supplied-wording';
import { PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { VariablePickerOption } from '../../fields/VariablePickerField.tsx';
import { protocolContextFromSections } from '../../protocol-context.ts';
import { enIntl, readMessage } from '../../testing/i18n.ts';
import { testId, testTypeId, testVariableId } from '../../testing/testId.ts';
import {
  markCrossClassUses,
  markInterfaceOwned,
} from '../attributeAvailability.ts';
import {
  buildEntityTypeUsageIndex,
  buildExclusiveVariableSlotMap,
  buildInterfaceOwnedOptionMap,
  buildStageManagedOptionMap,
  buildVariableRoleMap,
  buildVariableUsageIndex,
  entityTypeUsageKey,
  hasConflictingUse,
  hasUnvalidatedUse,
  hasValidatedUse,
  interfaceOwnedOptionsIssue,
  interfaceOwnedPickIssue,
  lockedVariableOptions,
  stageManagedOptionsLock,
  variableRoleConflicts,
  variableRoleKey,
} from '../variableRoles.ts';

const PERSON = testTypeId('person');
const FAMILY_MEMBER = testTypeId('family-member');
const FAMILY_EDGE = testTypeId('family-edge');
const SOMEONE_ELSE = testTypeId('someone-else');
const CATEGORY = testVariableId('category');
const ORDINARY = testVariableId('ordinary');
const PLAIN = testVariableId('plain');
const STAMPED = testVariableId('stamped');
const SEX_ASSIGNED_AT_BIRTH = testVariableId('sexAssignedAtBirth');
const GENDER_IDENTITY = testVariableId('genderIdentity');
const IS_EGO = testVariableId('isEgo');
const RELATIONSHIP_KIND = testVariableId('relationshipKind');
const IS_GESTATIONAL_CARRIER = testVariableId('isGestationalCarrier');
const IS_CURRENT_PARTNER = testVariableId('isCurrentPartner');
const NAME = testVariableId('name');
const OTHER_FLAG = testVariableId('otherFlag');
const FREE = testVariableId('free');

const FORM_STAGE_ID = testId('form-stage');
const BIN_STAGE_ID = testId('bin-stage');
const SUBJECT = { entity: 'node', type: PERSON } as const;
const FAMILY_SUBJECT = { entity: 'node', type: FAMILY_MEMBER } as const;
const STAGE_SUBJECT = { entity: 'node', types: [PERSON] };
const FAMILY_STAGE_SUBJECT = { entity: 'node', types: [FAMILY_MEMBER] };
const FAMILY_STAGE_ID = testId('family-stage');
const EGO_SLOT = 'familyPedigree.nodeConfiguration.egoAttribute';

const settings = {
  [sectionId({ kind: 'settings' })]: {
    localization: { defaultLocale: 'en', locales: ['en'] },
  },
};

const sections = (): Record<string, SectionDoc> => ({
  ...settings,
  [sectionId({ kind: 'codebookNode', typeId: PERSON })]: {
    name: 'Person',
    color: 'node-color-seq-1',
    shape: { default: 'circle' },
    variables: {
      [CATEGORY]: {
        name: 'Category',
        type: 'categorical',
        options: [
          {
            id: testId('option/Category/one'),
            label: { en: 'One' },
            value: 'one',
          },
          {
            id: testId('option/Category/two'),
            label: { en: 'Two' },
            value: 'two',
          },
        ],
      },
    },
  },
  [sectionId({ kind: 'stage', stageId: FORM_STAGE_ID })]: {
    id: FORM_STAGE_ID,
    type: 'AlterForm',
    label: { en: 'Form' },
    subject: STAGE_SUBJECT,
    form: {
      fields: [
        {
          id: testId('field-1'),
          variable: CATEGORY,
          prompt: { en: 'Category?' },
        },
      ],
    },
  },
  [sectionId({ kind: 'stage', stageId: BIN_STAGE_ID })]: {
    id: BIN_STAGE_ID,
    type: 'CategoricalBin',
    label: { en: 'Bin' },
    subject: STAGE_SUBJECT,
    prompts: [
      {
        id: testId('prompt-1'),
        text: { en: 'Sort people.' },
        variable: CATEGORY,
      },
    ],
  },
  // Put the bin first to prove exclusion follows the stage id through the
  // canonical order rather than assuming an app-local editor index.
  [sectionId({ kind: 'stageOrder' })]: {
    stages: [BIN_STAGE_ID, FORM_STAGE_ID],
  },
});

const familySections = (): Record<string, SectionDoc> => ({
  ...settings,
  [sectionId({ kind: 'stage', stageId: FAMILY_STAGE_ID })]: {
    id: FAMILY_STAGE_ID,
    type: 'FamilyPedigree',
    wording: familyPedigreeWordingIn(),
    label: { en: 'Family Pedigree' },
    subject: FAMILY_STAGE_SUBJECT,
    prompt: { en: 'Build your family' },
    nodeConfiguration: {
      nameAttribute: NAME,
      nameField: { prompt: { en: 'Name' } },
      genderIdentity: { attribute: GENDER_IDENTITY, terms: [] },
      sexAssignedAtBirthAttribute: SEX_ASSIGNED_AT_BIRTH,
      egoAttribute: IS_EGO,
    },
    edgeConfiguration: {
      type: FAMILY_EDGE,
      kindAttribute: RELATIONSHIP_KIND,
      gestationalCarrierAttribute: IS_GESTATIONAL_CARRIER,
      currentPartnerAttribute: IS_CURRENT_PARTNER,
    },
  },
  [sectionId({ kind: 'stageOrder' })]: { stages: [FAMILY_STAGE_ID] },
});

describe('variable role helpers', () => {
  it('counts canonical writer roles and excludes the edited stage by id', () => {
    const context = protocolContextFromSections(sections());
    const key = variableRoleKey(SUBJECT, CATEGORY);

    expect(context.issues).toEqual([]);
    expect(buildVariableRoleMap(context)[key]).toEqual({
      validated: 1,
      unvalidated: 1,
      validatedStages: ['Form'],
      unvalidatedStages: ['Bin'],
    });
    expect(buildVariableRoleMap(context, FORM_STAGE_ID)[key]).toEqual({
      validated: 0,
      unvalidated: 1,
      validatedStages: [],
      unvalidatedStages: ['Bin'],
    });
    expect(buildVariableRoleMap(context, BIN_STAGE_ID)[key]).toEqual({
      validated: 1,
      unvalidated: 0,
      validatedStages: ['Form'],
      unvalidatedStages: [],
    });
  });

  it('provides the shared conflict predicates without a host selector', () => {
    const map = buildVariableRoleMap(protocolContextFromSections(sections()));

    expect(hasValidatedUse(map, SUBJECT, CATEGORY)).toBe(true);
    expect(hasUnvalidatedUse(map, SUBJECT, CATEGORY)).toBe(true);
    expect(hasConflictingUse(map, SUBJECT, CATEGORY, 'validated')).toBe(true);
    expect(hasConflictingUse(map, SUBJECT, CATEGORY, 'unvalidated')).toBe(true);
    expect(
      variableRoleConflicts(protocolContextFromSections(sections())),
    ).toHaveLength(1);
  });

  it('marks the opposite writer role, naming the stages, while keeping committed picks', () => {
    const roleMap = buildVariableRoleMap(
      protocolContextFromSections(sections()),
    );
    const options: VariablePickerOption[] = [
      { label: 'Category', value: CATEGORY },
      { label: 'Free', value: FREE },
    ];
    const reasons = (marked: readonly { unavailableReason?: string }[]) =>
      marked.map((option) => option.unavailableReason);

    expect(
      reasons(
        markCrossClassUses(roleMap, SUBJECT, options, 'unvalidated', enIntl),
      ),
    ).toEqual([
      'The “Form” stage collects this attribute and validates each answer, so it cannot also be set here without validation.',
      undefined,
    ]);
    expect(
      reasons(
        markCrossClassUses(roleMap, SUBJECT, options, 'validated', enIntl),
      ),
    ).toEqual([
      'The “Bin” stage sets this attribute without validation, so it cannot also be collected here.',
      undefined,
    ]);
    // The field's own value is never marked by a rule about other uses.
    expect(
      reasons(
        markCrossClassUses(
          roleMap,
          SUBJECT,
          options,
          'validated',
          enIntl,
          CATEGORY,
        ),
      ),
    ).toEqual([undefined, undefined]);
    // A role map that cannot name the stages still gives the reason.
    expect(
      reasons(
        markCrossClassUses(
          {
            [variableRoleKey(SUBJECT, FREE)]: { validated: 2, unvalidated: 0 },
          },
          SUBJECT,
          options,
          'unvalidated',
          enIntl,
        ),
      ),
    ).toEqual([
      undefined,
      'Another stage collects this attribute and validates each answer, so it cannot also be set here without validation.',
    ]);
  });

  it('marks structural attributes owned by an interface, except for the same slot or a committed pick, and rejects them at save time elsewhere', () => {
    const context = protocolContextFromSections(familySections());
    const slotMap = buildExclusiveVariableSlotMap(context);
    const options: VariablePickerOption[] = [
      { label: 'Participant marker', value: IS_EGO },
      { label: 'Other flag', value: OTHER_FLAG },
    ];
    const reasons = (marked: readonly { unavailableReason?: string }[]) =>
      marked.map((option) => option.unavailableReason);

    expect(context.issues).toEqual([]);
    expect(
      reasons(markInterfaceOwned(slotMap, FAMILY_SUBJECT, options, enIntl)),
    ).toEqual([
      'The “Family Pedigree” stage sets this attribute for its own use, so it cannot be used here.',
      undefined,
    ]);
    expect(
      reasons(
        markInterfaceOwned(slotMap, FAMILY_SUBJECT, options, enIntl, IS_EGO),
      ),
    ).toEqual([undefined, undefined]);
    expect(
      reasons(
        markInterfaceOwned(
          slotMap,
          FAMILY_SUBJECT,
          options,
          enIntl,
          undefined,
          EGO_SLOT,
        ),
      ),
    ).toEqual([undefined, undefined]);
    // A claim the open stage has only drafted is another field on screen.
    expect(
      reasons(
        markInterfaceOwned(
          {
            [variableRoleKey(FAMILY_SUBJECT, OTHER_FLAG)]: {
              source: 'draft',
              slot: EGO_SLOT,
            },
          },
          FAMILY_SUBJECT,
          options,
          enIntl,
        ),
      ),
    ).toEqual([
      undefined,
      'Another field on this stage already uses this attribute.',
    ]);

    // The refusal crossed a string-only contract, so it is read back the way a
    // field's error region renders it.
    expect(
      readMessage(
        interfaceOwnedPickIssue(slotMap, FAMILY_SUBJECT, IS_EGO) ?? '',
      ),
    ).toBe(
      'This attribute is set by the Family Pedigree interface, which marks the participant, so it cannot be used here. Choose a different attribute.',
    );
    expect(
      interfaceOwnedPickIssue(slotMap, FAMILY_SUBJECT, IS_EGO, EGO_SLOT),
    ).toBeUndefined();
    expect(
      interfaceOwnedPickIssue(
        slotMap,
        { entity: 'node', type: SOMEONE_ELSE },
        IS_EGO,
      ),
    ).toBeUndefined();
  });

  it('reports a stale or imported interface-owned option mismatch', () => {
    const optionMap = buildInterfaceOwnedOptionMap(
      protocolContextFromSections(familySections()),
    );
    const reversedCanonical =
      PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS.toReversed();
    const reworded = PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS.map(
      ({ value }) => ({
        value,
        label: { es: value },
      }),
    );
    const staleOptions = PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS.map(
      (option, index) =>
        index === 0 ? { ...option, value: 'changed' } : option,
    );

    expect(
      interfaceOwnedOptionsIssue(
        optionMap,
        FAMILY_SUBJECT,
        SEX_ASSIGNED_AT_BIRTH,
        reversedCanonical,
      ),
    ).toBeUndefined();
    // The labels are participant copy the interview never branches on.
    expect(
      interfaceOwnedOptionsIssue(
        optionMap,
        FAMILY_SUBJECT,
        SEX_ASSIGNED_AT_BIRTH,
        reworded,
      ),
    ).toBeUndefined();
    // The refusal crossed a string-only contract, so it is read back the way a
    // field's error region renders it.
    expect(
      readMessage(
        interfaceOwnedOptionsIssue(
          optionMap,
          FAMILY_SUBJECT,
          SEX_ASSIGNED_AT_BIRTH,
          staleOptions,
        ) ?? '',
      ),
    ).toBe(
      'These options are set by the interface that uses this attribute and cannot be changed here. Reopen this row to start from the current options.',
    );
    expect(
      interfaceOwnedOptionsIssue(
        optionMap,
        { entity: 'node', type: SOMEONE_ELSE },
        SEX_ASSIGNED_AT_BIRTH,
        staleOptions,
      ),
    ).toBeUndefined();
  });

  it('groups schema-derived variable and entity-type usage with structured hits', () => {
    const context = protocolContextFromSections(sections());
    const variableUsage = buildVariableUsageIndex(context);
    const entityUsage = buildEntityTypeUsageIndex(context);

    expect(variableUsage[variableRoleKey(SUBJECT, CATEGORY)]).toHaveLength(2);
    expect(
      variableUsage[variableRoleKey(SUBJECT, CATEGORY)]?.map(
        ({ path }) => path[2],
      ),
    ).toEqual(expect.arrayContaining(['prompts', 'form']));
    expect(entityUsage[entityTypeUsageKey('node', PERSON)]).toHaveLength(2);
  });

  /**
   * Two independent reasons a prompt editor must render an option list
   * read-only, and one shape that is neither.
   */
  it('locks an option list an interface owns, and one the codebook marks read-only', () => {
    const optionMap = buildInterfaceOwnedOptionMap(
      protocolContextFromSections(familySections()),
    );
    const variables = {
      [SEX_ASSIGNED_AT_BIRTH]: {
        name: 'sexAssignedAtBirth',
        type: 'categorical' as const,
        options: [
          {
            id: testId('option/sexAssignedAtBirth/drifted'),
            label: { en: 'Drifted' },
            value: 'drifted',
          },
        ],
      },
      [STAMPED]: {
        name: 'stamped',
        type: 'ordinal' as const,
        readOnly: true,
        options: [
          { id: testId('option/stamped/1'), label: { en: 'Low' }, value: 1 },
        ],
      },
      [ORDINARY]: {
        name: 'ordinary',
        type: 'categorical' as const,
        options: [
          {
            id: testId('option/ordinary/yes'),
            label: { en: 'Yes' },
            value: 'yes',
          },
        ],
      },
      [PLAIN]: { name: 'plain', type: 'text' as const },
    };

    // The CANONICAL set, not the drifted one the codebook happens to hold:
    // the canonical set is what the protocol rule enforces, so showing the
    // drift as authoritative would invite the researcher to keep it.
    expect(
      lockedVariableOptions(
        variables,
        SEX_ASSIGNED_AT_BIRTH,
        optionMap[variableRoleKey(FAMILY_SUBJECT, SEX_ASSIGNED_AT_BIRTH)],
      ),
    ).toEqual(PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS);
    expect(lockedVariableOptions(variables, STAMPED)).toEqual([
      { id: testId('option/stamped/1'), label: { en: 'Low' }, value: 1 },
    ]);
    expect(lockedVariableOptions(variables, ORDINARY)).toBeUndefined();
    // An attribute with no option list at all cannot have one locked.
    expect(lockedVariableOptions(variables, PLAIN)).toBeUndefined();
    expect(lockedVariableOptions(variables, 'missing')).toBeUndefined();
    expect(lockedVariableOptions(variables, undefined)).toBeUndefined();
    expect(lockedVariableOptions(undefined, STAMPED)).toBeUndefined();
  });

  /**
   * Which stages manage a variable's options is derived from the stages that
   * bind it. Nothing is stored in the codebook, so removing the stage releases
   * them, and sex assigned at birth (a fixed set, not a managed one) is not
   * among them.
   */
  describe('options a stage manages', () => {
    const GENDER_KEY = variableRoleKey(FAMILY_SUBJECT, GENDER_IDENTITY);

    it('derives the managing stages from the stages that bind the variable', () => {
      const map = buildStageManagedOptionMap(
        protocolContextFromSections(familySections()),
      );

      expect(map[GENDER_KEY]).toEqual([
        { stageId: FAMILY_STAGE_ID, stageLabel: 'Family Pedigree' },
      ]);
      expect(
        map[variableRoleKey(FAMILY_SUBJECT, SEX_ASSIGNED_AT_BIRTH)],
      ).toBeUndefined();
    });

    it('holds nothing once no stage binds the variable', () => {
      const released = protocolContextFromSections({
        ...familySections(),
        [sectionId({ kind: 'stage', stageId: FAMILY_STAGE_ID })]: {
          id: FAMILY_STAGE_ID,
          type: 'FamilyPedigree',
          wording: familyPedigreeWordingIn(),
          label: 'Family Pedigree',
          subject: FAMILY_STAGE_SUBJECT,
          prompt: 'Build your family',
          nodeConfiguration: {
            nameAttribute: NAME,
            nameField: { prompt: { en: 'Name' } },
            sexAssignedAtBirthAttribute: SEX_ASSIGNED_AT_BIRTH,
            egoAttribute: IS_EGO,
          },
          edgeConfiguration: {
            type: FAMILY_EDGE,
            kindAttribute: RELATIONSHIP_KIND,
            gestationalCarrierAttribute: IS_GESTATIONAL_CARRIER,
            currentPartnerAttribute: IS_CURRENT_PARTNER,
          },
        },
      });

      expect(buildStageManagedOptionMap(released)).toEqual({});
    });

    it('locks the options everywhere but an owning stage’s editor', () => {
      const map = buildStageManagedOptionMap(
        protocolContextFromSections(familySections()),
      );
      const ask = (
        editingFrom?: Parameters<typeof stageManagedOptionsLock>[3],
      ) =>
        stageManagedOptionsLock(
          map,
          FAMILY_SUBJECT,
          GENDER_IDENTITY,
          editingFrom,
        );

      // The codebook's own editor, and any other stage.
      expect(ask()).toEqual(['Family Pedigree']);
      expect(
        ask({ stageId: testId('another'), draftBindings: new Set() }),
      ).toEqual(['Family Pedigree']);
      // The stage that binds it, and a stage whose unsaved draft does.
      expect(
        ask({ stageId: FAMILY_STAGE_ID, draftBindings: new Set() }),
      ).toBeUndefined();
      expect(
        ask({
          stageId: testId('new-stage'),
          draftBindings: new Set([GENDER_KEY]),
        }),
      ).toBeUndefined();
      // Another attribute of the same type is not managed.
      expect(
        stageManagedOptionsLock(map, FAMILY_SUBJECT, IS_EGO),
      ).toBeUndefined();
    });
  });

  it('keeps colon-containing subjects and variables in distinct keys', () => {
    expect(
      variableRoleKey({ entity: 'node', type: 'person:alias' }, 'flagged'),
    ).not.toBe(
      variableRoleKey({ entity: 'node', type: 'person' }, 'alias:flagged'),
    );
  });
});
