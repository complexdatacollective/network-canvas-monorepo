import { describe, expect, it } from 'vitest';

import { BIOLOGICAL_SEX_OPTIONS } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { protocolContextFromSections } from '../../protocol-context.ts';
import {
  buildEntityTypeUsageIndex,
  buildExclusiveVariableSlotMap,
  buildInterfaceOwnedOptionMap,
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
  variableRoleConflicts,
  variableRoleKey,
} from '../variableRoles.ts';

const FORM_STAGE_ID = 'form-stage';
const BIN_STAGE_ID = 'bin-stage';
const SUBJECT = { entity: 'node', type: 'person' } as const;
const FAMILY_SUBJECT = { entity: 'node', type: 'family-member' } as const;
const FAMILY_STAGE_ID = 'family-stage';
const EGO_SLOT = 'familyPedigree.nodeConfig.egoVariable';

const sections = (): Record<string, SectionDoc> => ({
  [sectionId({ kind: 'codebookNode', typeId: 'person' })]: {
    name: 'Person',
    color: 'node-color-seq-1',
    shape: { default: 'circle' },
    variables: {
      category: {
        name: 'Category',
        type: 'categorical',
        options: [
          { label: 'One', value: 'one' },
          { label: 'Two', value: 'two' },
        ],
      },
    },
  },
  [sectionId({ kind: 'stage', stageId: FORM_STAGE_ID })]: {
    id: FORM_STAGE_ID,
    type: 'AlterForm',
    label: 'Form',
    subject: SUBJECT,
    introductionPanel: { title: 'Introduction', text: 'Answer a question.' },
    form: { fields: [{ variable: 'category', prompt: 'Category?' }] },
  },
  [sectionId({ kind: 'stage', stageId: BIN_STAGE_ID })]: {
    id: BIN_STAGE_ID,
    type: 'CategoricalBin',
    label: 'Bin',
    subject: SUBJECT,
    prompts: [{ id: 'prompt-1', text: 'Sort people.', variable: 'category' }],
  },
  // Put the bin first to prove exclusion follows the stage id through the
  // canonical order rather than assuming an app-local editor index.
  [sectionId({ kind: 'stageOrder' })]: {
    stages: [BIN_STAGE_ID, FORM_STAGE_ID],
  },
});

const familySections = (): Record<string, SectionDoc> => ({
  [sectionId({ kind: 'stage', stageId: FAMILY_STAGE_ID })]: {
    id: FAMILY_STAGE_ID,
    type: 'FamilyPedigree',
    label: 'Family Pedigree',
    nodeConfig: {
      type: FAMILY_SUBJECT.type,
      nodeLabelVariable: 'name',
      egoVariable: 'isEgo',
      relationshipVariable: 'relationshipToEgo',
      biologicalSexVariable: 'biologicalSex',
    },
    edgeConfig: {
      type: 'family-edge',
      relationshipTypeVariable: 'relationshipType',
      isActiveVariable: 'isActive',
      isGestationalCarrierVariable: 'isGestationalCarrier',
      gameteRoleVariable: 'gameteRole',
    },
    censusPrompt: 'Build your family',
    framing: { mode: 'fixed', value: 'gamete' },
    boundaries: {
      requireGrandparents: 'off',
      requireChildrenContributors: 'off',
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
      { label: 'Bin', value: 'bin-only' },
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

    expect(interfaceOwnedPickIssue(slotMap, FAMILY_SUBJECT, 'isEgo')).toBe(
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
    const reversedCanonical = BIOLOGICAL_SEX_OPTIONS.toReversed();
    const staleOptions = BIOLOGICAL_SEX_OPTIONS.map((option, index) =>
      index === 0 ? { ...option, label: 'Changed label' } : option,
    );

    expect(
      interfaceOwnedOptionsIssue(
        optionMap,
        FAMILY_SUBJECT,
        'biologicalSex',
        reversedCanonical,
      ),
    ).toBeUndefined();
    expect(
      interfaceOwnedOptionsIssue(
        optionMap,
        FAMILY_SUBJECT,
        'biologicalSex',
        staleOptions,
      ),
    ).toBe(
      'These options are set by the interface that uses this attribute and cannot be changed here. Close this dialog and reopen it to start from the current options.',
    );
    expect(
      interfaceOwnedOptionsIssue(
        optionMap,
        { entity: 'node', type: 'someone-else' },
        'biologicalSex',
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
      biologicalSex: {
        name: 'biologicalSex',
        type: 'categorical' as const,
        options: [{ label: 'Drifted', value: 'drifted' }],
      },
      stamped: {
        name: 'stamped',
        type: 'ordinal' as const,
        readOnly: true,
        options: [{ label: 'Low', value: 1 }],
      },
      ordinary: {
        name: 'ordinary',
        type: 'categorical' as const,
        options: [{ label: 'Yes', value: 'yes' }],
      },
      plain: { name: 'plain', type: 'text' as const },
    };

    // The CANONICAL set, not the drifted one the codebook happens to hold:
    // the canonical set is what the protocol rule enforces, so showing the
    // drift as authoritative would invite the researcher to keep it.
    expect(
      lockedVariableOptions(
        variables,
        'biologicalSex',
        optionMap[variableRoleKey(FAMILY_SUBJECT, 'biologicalSex')],
      ),
    ).toEqual(BIOLOGICAL_SEX_OPTIONS);
    expect(lockedVariableOptions(variables, 'stamped')).toEqual([
      { label: 'Low', value: 1 },
    ]);
    expect(lockedVariableOptions(variables, 'ordinary')).toBeUndefined();
    // An attribute with no option list at all cannot have one locked.
    expect(lockedVariableOptions(variables, 'plain')).toBeUndefined();
    expect(lockedVariableOptions(variables, 'missing')).toBeUndefined();
    expect(lockedVariableOptions(variables, undefined)).toBeUndefined();
    expect(lockedVariableOptions(undefined, 'stamped')).toBeUndefined();
  });

  it('keeps colon-containing subjects and variables in distinct keys', () => {
    expect(
      variableRoleKey({ entity: 'node', type: 'person:alias' }, 'flagged'),
    ).not.toBe(
      variableRoleKey({ entity: 'node', type: 'person' }, 'alias:flagged'),
    );
  });
});
