import { describe, expect, it } from 'vitest';

import { PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { protocolContextFromSections } from '../../protocol-context.ts';
import { readMessage } from '../../testing/i18n.ts';
import {
  buildEntityTypeUsageIndex,
  buildExclusiveVariableSlotMap,
  buildInterfaceOwnedOptionMap,
  buildStageManagedOptionMap,
  buildVariableRoleMap,
  buildVariableUsageIndex,
  entityTypeUsageKey,
  excludeInterfaceOwned,
  excludeUnvalidatedUses,
  excludeValidatedUses,
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

const FORM_STAGE_ID = 'form-stage';
const BIN_STAGE_ID = 'bin-stage';
const SUBJECT = { entity: 'node', type: 'person' } as const;
const FAMILY_SUBJECT = { entity: 'node', type: 'family-member' } as const;
const FAMILY_STAGE_ID = 'family-stage';
const EGO_SLOT = 'familyPedigree.nodeConfiguration.egoAttribute';

const settings = {
  [sectionId({ kind: 'settings' })]: {
    localization: { defaultLocale: 'en', locales: ['en'] },
  },
};

const sections = (): Record<string, SectionDoc> => ({
  ...settings,
  [sectionId({ kind: 'codebookNode', typeId: 'person' })]: {
    name: 'Person',
    label: { en: 'Person' },
    color: 'node-color-seq-1',
    shape: { default: 'circle' },
    variables: {
      category: {
        name: 'Category',
        label: 'Category',
        type: 'categorical',
        options: [
          { label: { en: 'One' }, value: 'one' },
          { label: { en: 'Two' }, value: 'two' },
        ],
      },
    },
  },
  [sectionId({ kind: 'stage', stageId: FORM_STAGE_ID })]: {
    id: FORM_STAGE_ID,
    type: 'AlterForm',
    label: { en: 'Form' },
    subject: SUBJECT,
    introductionPanel: {
      title: { en: 'Introduction' },
      text: { en: 'Answer a question.' },
    },
    form: { fields: [{ variable: 'category', prompt: { en: 'Category?' } }] },
  },
  [sectionId({ kind: 'stage', stageId: BIN_STAGE_ID })]: {
    id: BIN_STAGE_ID,
    type: 'CategoricalBin',
    label: { en: 'Bin' },
    subject: SUBJECT,
    prompts: [
      { id: 'prompt-1', text: { en: 'Sort people.' }, variable: 'category' },
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
    label: { en: 'Family Pedigree' },
    subject: FAMILY_SUBJECT,
    prompt: { en: 'Build your family' },
    nodeConfiguration: {
      nameAttribute: 'name',
      nameField: { prompt: { en: 'Name' } },
      genderIdentity: { attribute: 'genderIdentity', terms: [] },
      sexAssignedAtBirthAttribute: 'sexAssignedAtBirth',
      egoAttribute: 'isEgo',
    },
    edgeConfiguration: {
      type: 'family-edge',
      kindAttribute: 'relationshipKind',
      gestationalCarrierAttribute: 'isGestationalCarrier',
      currentPartnerAttribute: 'isCurrentPartner',
    },
  },
  [sectionId({ kind: 'stageOrder' })]: { stages: [FAMILY_STAGE_ID] },
});

describe('variable role helpers', () => {
  it('counts canonical writer roles and excludes the edited stage by id', () => {
    const context = protocolContextFromSections(sections());
    const key = variableRoleKey(SUBJECT, 'category');

    expect(context.issues).toEqual([]);
    expect(buildVariableRoleMap(context)[key]).toEqual({
      validated: 1,
      unvalidated: 1,
    });
    expect(buildVariableRoleMap(context, FORM_STAGE_ID)[key]).toEqual({
      validated: 0,
      unvalidated: 1,
    });
    expect(buildVariableRoleMap(context, BIN_STAGE_ID)[key]).toEqual({
      validated: 1,
      unvalidated: 0,
    });
  });

  it('provides the shared conflict predicates without a host selector', () => {
    const map = buildVariableRoleMap(protocolContextFromSections(sections()));

    expect(hasValidatedUse(map, SUBJECT, 'category')).toBe(true);
    expect(hasUnvalidatedUse(map, SUBJECT, 'category')).toBe(true);
    expect(hasConflictingUse(map, SUBJECT, 'category', 'validated')).toBe(true);
    expect(hasConflictingUse(map, SUBJECT, 'category', 'unvalidated')).toBe(
      true,
    );
    expect(
      variableRoleConflicts(protocolContextFromSections(sections())),
    ).toHaveLength(1);
  });

  it('filters the opposite writer role while preserving committed picks', () => {
    const roleMap = {
      [variableRoleKey(SUBJECT, 'form-only')]: {
        validated: 1,
        unvalidated: 0,
      },
      [variableRoleKey(SUBJECT, 'bin-only')]: {
        validated: 0,
        unvalidated: 1,
      },
    };
    const options = [
      { label: 'Form', value: 'form-only' },
      { label: { en: 'Bin' }, value: 'bin-only' },
      { label: 'Free', value: 'free' },
    ];

    expect(
      excludeValidatedUses(roleMap, SUBJECT, options).map(({ value }) => value),
    ).toEqual(['bin-only', 'free']);
    expect(
      excludeValidatedUses(roleMap, SUBJECT, options, 'form-only').map(
        ({ value }) => value,
      ),
    ).toEqual(['form-only', 'bin-only', 'free']);
    expect(
      excludeUnvalidatedUses(roleMap, SUBJECT, options, ['bin-only']).map(
        ({ value }) => value,
      ),
    ).toEqual(['form-only', 'bin-only', 'free']);
  });

  it('preserves same-slot and committed structural picks but rejects them at save time elsewhere', () => {
    const context = protocolContextFromSections(familySections());
    const slotMap = buildExclusiveVariableSlotMap(context);
    const options = [
      { label: 'Participant marker', value: 'isEgo' },
      { label: 'Other flag', value: 'otherFlag' },
    ];

    expect(context.issues).toEqual([]);
    expect(
      excludeInterfaceOwned(slotMap, FAMILY_SUBJECT, options).map(
        ({ value }) => value,
      ),
    ).toEqual(['otherFlag']);
    expect(
      excludeInterfaceOwned(slotMap, FAMILY_SUBJECT, options, 'isEgo').map(
        ({ value }) => value,
      ),
    ).toEqual(['isEgo', 'otherFlag']);
    expect(
      excludeInterfaceOwned(
        slotMap,
        FAMILY_SUBJECT,
        options,
        undefined,
        EGO_SLOT,
      ).map(({ value }) => value),
    ).toEqual(['isEgo', 'otherFlag']);

    // The refusal crossed a string-only contract, so it is read back the way a
    // field's error region renders it.
    expect(
      readMessage(
        interfaceOwnedPickIssue(slotMap, FAMILY_SUBJECT, 'isEgo') ?? '',
      ),
    ).toBe(
      'This attribute is set by the Family Pedigree interface, which marks the participant, so it cannot be used here. Choose a different attribute.',
    );
    expect(
      interfaceOwnedPickIssue(slotMap, FAMILY_SUBJECT, 'isEgo', EGO_SLOT),
    ).toBeUndefined();
    expect(
      interfaceOwnedPickIssue(
        slotMap,
        { entity: 'node', type: 'someone-else' },
        'isEgo',
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
        'sexAssignedAtBirth',
        reversedCanonical,
      ),
    ).toBeUndefined();
    // The labels are participant copy the interview never branches on.
    expect(
      interfaceOwnedOptionsIssue(
        optionMap,
        FAMILY_SUBJECT,
        'sexAssignedAtBirth',
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
          'sexAssignedAtBirth',
          staleOptions,
        ) ?? '',
      ),
    ).toBe(
      'These options are set by the interface that uses this attribute and cannot be changed here. Reopen this row to start from the current options.',
    );
    expect(
      interfaceOwnedOptionsIssue(
        optionMap,
        { entity: 'node', type: 'someone-else' },
        'sexAssignedAtBirth',
        staleOptions,
      ),
    ).toBeUndefined();
  });

  it('groups schema-derived variable and entity-type usage with structured hits', () => {
    const context = protocolContextFromSections(sections());
    const variableUsage = buildVariableUsageIndex(context);
    const entityUsage = buildEntityTypeUsageIndex(context);

    expect(variableUsage[variableRoleKey(SUBJECT, 'category')]).toHaveLength(2);
    expect(
      variableUsage[variableRoleKey(SUBJECT, 'category')]?.map(
        ({ path }) => path[2],
      ),
    ).toEqual(expect.arrayContaining(['prompts', 'form']));
    expect(entityUsage[entityTypeUsageKey('node', 'person')]).toHaveLength(2);
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
      sexAssignedAtBirth: {
        name: 'sexAssignedAtBirth',
        label: 'sexAssignedAtBirth',
        type: 'categorical' as const,
        options: [{ label: { en: 'Drifted' }, value: 'drifted' }],
      },
      stamped: {
        name: 'stamped',
        label: 'stamped',
        type: 'ordinal' as const,
        readOnly: true,
        options: [{ label: { en: 'Low' }, value: 1 }],
      },
      ordinary: {
        name: 'ordinary',
        label: 'ordinary',
        type: 'categorical' as const,
        options: [{ label: { en: 'Yes' }, value: 'yes' }],
      },
      plain: { name: 'plain', label: 'plain', type: 'text' as const },
    };

    // The CANONICAL set, not the drifted one the codebook happens to hold:
    // the canonical set is what the protocol rule enforces, so showing the
    // drift as authoritative would invite the researcher to keep it.
    expect(
      lockedVariableOptions(
        variables,
        'sexAssignedAtBirth',
        optionMap[variableRoleKey(FAMILY_SUBJECT, 'sexAssignedAtBirth')],
      ),
    ).toEqual(PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS);
    expect(lockedVariableOptions(variables, 'stamped')).toEqual([
      { label: { en: 'Low' }, value: 1 },
    ]);
    expect(lockedVariableOptions(variables, 'ordinary')).toBeUndefined();
    // An attribute with no option list at all cannot have one locked.
    expect(lockedVariableOptions(variables, 'plain')).toBeUndefined();
    expect(lockedVariableOptions(variables, 'missing')).toBeUndefined();
    expect(lockedVariableOptions(variables, undefined)).toBeUndefined();
    expect(lockedVariableOptions(undefined, 'stamped')).toBeUndefined();
  });

  /**
   * Which stages manage a variable's options is derived from the stages that
   * bind it. Nothing is stored in the codebook, so removing the stage releases
   * them, and sex assigned at birth (a fixed set, not a managed one) is not
   * among them.
   */
  describe('options a stage manages', () => {
    const GENDER_KEY = variableRoleKey(FAMILY_SUBJECT, 'genderIdentity');

    it('derives the managing stages from the stages that bind the variable', () => {
      const map = buildStageManagedOptionMap(
        protocolContextFromSections(familySections()),
      );

      expect(map[GENDER_KEY]).toEqual([
        { stageId: FAMILY_STAGE_ID, stageLabel: 'Family Pedigree' },
      ]);
      expect(
        map[variableRoleKey(FAMILY_SUBJECT, 'sexAssignedAtBirth')],
      ).toBeUndefined();
    });

    it('holds nothing once no stage binds the variable', () => {
      const released = protocolContextFromSections({
        ...familySections(),
        [sectionId({ kind: 'stage', stageId: FAMILY_STAGE_ID })]: {
          id: FAMILY_STAGE_ID,
          type: 'FamilyPedigree',
          label: 'Family Pedigree',
          subject: FAMILY_SUBJECT,
          prompt: 'Build your family',
          nodeConfiguration: {
            nameAttribute: 'name',
            nameField: { prompt: { en: 'Name' } },
            sexAssignedAtBirthAttribute: 'sexAssignedAtBirth',
            egoAttribute: 'isEgo',
          },
          edgeConfiguration: {
            type: 'family-edge',
            kindAttribute: 'relationshipKind',
            gestationalCarrierAttribute: 'isGestationalCarrier',
            currentPartnerAttribute: 'isCurrentPartner',
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
          'genderIdentity',
          editingFrom,
        );

      // The codebook's own editor, and any other stage.
      expect(ask()).toEqual(['Family Pedigree']);
      expect(ask({ stageId: 'another', draftBindings: new Set() })).toEqual([
        'Family Pedigree',
      ]);
      // The stage that binds it, and a stage whose unsaved draft does.
      expect(
        ask({ stageId: FAMILY_STAGE_ID, draftBindings: new Set() }),
      ).toBeUndefined();
      expect(
        ask({ stageId: 'new-stage', draftBindings: new Set([GENDER_KEY]) }),
      ).toBeUndefined();
      // Another attribute of the same type is not managed.
      expect(
        stageManagedOptionsLock(map, FAMILY_SUBJECT, 'isEgo'),
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
