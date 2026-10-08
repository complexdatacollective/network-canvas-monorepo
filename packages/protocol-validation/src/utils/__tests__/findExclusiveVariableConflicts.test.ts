import { describe, expect, it } from 'vitest';

import {
  GENDER_IDENTITY_OPTIONS,
  GENDER_IDENTITY_TERMS,
} from '../../schemas/9/__tests__/pedigreeGenderFixtures.ts';
import {
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
} from '../../schemas/9/family-pedigree-values.ts';
import ProtocolSchemaV9 from '../../schemas/9/schema.ts';
import {
  findExclusiveVariableConflicts,
  findStageManagedOptionBindings,
} from '../findExclusiveVariableConflicts.ts';
import { localized, localizedOptions } from '../test-utils.ts';

type Stage = Record<string, unknown>;

const nodeConfiguration = {
  nameAttribute: 'fmName',
  genderIdentity: { attribute: 'genderIdentity', terms: GENDER_IDENTITY_TERMS },
  sexAssignedAtBirthAttribute: 'sexAssignedAtBirth',
  egoAttribute: 'isEgo',
};

const edgeConfiguration = {
  type: 'family_edge',
  kindAttribute: 'relationshipKind',
  gestationalCarrierAttribute: 'isGestationalCarrier',
  currentPartnerAttribute: 'isCurrentPartner',
};

const familyPedigree = (overrides: Stage = {}): Stage => ({
  id: 'fp1',
  label: localized('Family Pedigree'),
  type: 'FamilyPedigree',
  subject: { entity: 'node', type: 'family_member' },
  prompt: localized('Build your family'),
  nodeConfiguration,
  edgeConfiguration,
  ...overrides,
});

const protocolWith = (stages: Stage[]) => ({
  name: 'Pedigree protocol',
  schemaVersion: 9 as const,
  localization: { defaultLocale: 'en', locales: ['en'] },
  codebook: {
    node: {
      family_member: {
        name: 'Family member',
        label: localized('Family member'),
        color: 'node-color-seq-1',
        shape: { default: 'circle' as const },
        variables: {
          fmName: {
            name: 'fm_name',
            label: 'fm_name',
            type: 'text',
            component: 'Text',
          },
          isEgo: { name: 'is_ego', label: 'is_ego', type: 'boolean' },
          genderIdentity: {
            name: 'genderIdentity',
            label: 'genderIdentity',
            type: 'categorical',
            options: GENDER_IDENTITY_OPTIONS,
          },
          sexAssignedAtBirth: {
            name: 'sexAssignedAtBirth',
            label: 'sexAssignedAtBirth',
            type: 'categorical',
            options: localizedOptions(PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS),
          },
          hasConditionX: {
            name: 'hasConditionX',
            label: 'hasConditionX',
            type: 'boolean',
          },
          fmLayout: { name: 'fmLayout', label: 'fmLayout', type: 'layout' },
        },
      },
    },
    edge: {
      family_edge: {
        name: 'Family edge',
        label: localized('Family edge'),
        color: 'edge-color-seq-1',
        variables: {
          relationshipKind: {
            name: 'relationshipKind',
            label: 'relationshipKind',
            type: 'categorical',
            options: localizedOptions(PEDIGREE_RELATIONSHIP_KIND_OPTIONS),
          },
          isGestationalCarrier: {
            name: 'isGestationalCarrier',
            label: 'isGestationalCarrier',
            type: 'boolean',
          },
          isCurrentPartner: {
            name: 'isCurrentPartner',
            label: 'isCurrentPartner',
            type: 'boolean',
          },
        },
      },
    },
  },
  stages,
});

describe('findExclusiveVariableConflicts', () => {
  it('reports nothing for a well-formed pedigree', () => {
    const protocol = protocolWith([familyPedigree()]);
    expect(findExclusiveVariableConflicts(protocol)).toEqual([]);
    const result = ProtocolSchemaV9.safeParse(protocol);
    expect(result.success ? null : result.error.issues).toBeNull();
  });

  // A Sociogram prompt that sets `highlight.variable` without
  // `allowHighlighting` colours nodes by a value it never writes — the same
  // kind of read as grouping a narrative map by edgeConfiguration. Rejecting it
  // would forbid showing the participant their own node on a map of the family
  // the pedigree built.
  it('accepts a display-only sociogram highlight on an interface-owned variable', () => {
    const protocol = protocolWith([
      familyPedigree(),
      {
        id: 'sg1',
        label: localized('Map your family'),
        type: 'Sociogram',
        subject: { entity: 'node', type: 'family_member' },
        background: { concentricCircles: 4 },
        prompts: [
          {
            id: 'p1',
            text: localized('Place your family'),
            layout: { layoutVariable: 'fmLayout' },
            highlight: { allowHighlighting: false, variable: 'isEgo' },
          },
        ],
      },
    ]);
    expect(findExclusiveVariableConflicts(protocol)).toEqual([]);
    const result = ProtocolSchemaV9.safeParse(protocol);
    expect(result.success ? null : result.error.issues).toBeNull();
  });

  // The same field IS a writer once the participant can tap it: highlighting
  // would let them turn the pedigree's own participant marker on and off.
  it('still reports a tap-to-highlight sociogram prompt on an interface-owned variable', () => {
    const protocol = protocolWith([
      familyPedigree(),
      {
        id: 'sg1',
        label: localized('Map your family'),
        type: 'Sociogram',
        subject: { entity: 'node', type: 'family_member' },
        background: { concentricCircles: 4 },
        prompts: [
          {
            id: 'p1',
            text: localized('Place your family'),
            layout: { layoutVariable: 'fmLayout' },
            highlight: { allowHighlighting: true, variable: 'isEgo' },
          },
        ],
      },
    ]);
    const conflicts = findExclusiveVariableConflicts(protocol);
    expect(conflicts.map((conflict) => conflict.path)).toEqual([
      ['stages', 1, 'prompts', 0, 'highlight', 'variable'],
    ]);
    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(false);
  });

  it('reports a form field bound to the participant marker', () => {
    const protocol = protocolWith([
      familyPedigree({
        form: {
          fields: [
            {
              variable: 'isEgo',
              prompt: localized('Are you the participant?'),
            },
          ],
        },
      }),
    ]);
    const conflicts = findExclusiveVariableConflicts(protocol);
    expect(conflicts.map((conflict) => conflict.path)).toEqual([
      ['stages', 0, 'form', 'fields', 0, 'variable'],
    ]);
    expect(conflicts[0]?.owner.slot).toBe(
      'familyPedigree.nodeConfiguration.egoAttribute',
    );
    expect(conflicts[0]?.variableName).toBe('is_ego');
    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(false);
  });

  it('accepts two FamilyPedigree stages that share one node type and its structural slots', () => {
    // Only one of them asks about gender identity: the options of a gender
    // identity attribute are managed by one stage.
    const { genderIdentity: _omitted, ...withoutGender } = nodeConfiguration;
    const protocol = protocolWith([
      familyPedigree(),
      familyPedigree({
        id: 'fp2',
        label: localized('Second pedigree'),
        nodeConfiguration: withoutGender,
      }),
    ]);
    expect(findExclusiveVariableConflicts(protocol)).toEqual([]);
    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(true);
  });

  it('reports one variable claimed by two DIFFERENT exclusive slots', () => {
    const protocol = protocolWith([
      familyPedigree({
        edgeConfiguration: {
          ...edgeConfiguration,
          currentPartnerAttribute: 'isGestationalCarrier',
        },
      }),
    ]);
    const conflicts = findExclusiveVariableConflicts(protocol);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.path).toEqual([
      'stages',
      0,
      'edgeConfiguration',
      'currentPartnerAttribute',
    ]);
  });

  it('does not report a skip-logic filter rule that tests an interface-derived variable', () => {
    const protocol = protocolWith([
      familyPedigree(),
      {
        id: 'info1',
        label: localized('Wrap up'),
        type: 'Information',
        items: [
          {
            id: 'i1',
            type: 'text',
            content: localized('Thanks'),
            size: 'MEDIUM',
          },
        ],
        skipLogic: {
          action: 'SKIP',
          filter: {
            join: 'OR',
            rules: [
              {
                id: 'r1',
                type: 'node',
                options: {
                  type: 'family_member',
                  attribute: 'isEgo',
                  operator: 'EXISTS',
                },
              },
            ],
          },
        },
      },
    ]);
    expect(findExclusiveVariableConflicts(protocol)).toEqual([]);
  });

  it('leaves the gender-identity variable free to be bound elsewhere', () => {
    // Binning family members by gender is legitimate authoring: the interface
    // owns the OPTIONS, not the reference. Only the options are locked.
    const protocol = protocolWith([
      familyPedigree(),
      {
        id: 'cb1',
        label: localized('Sort by gender'),
        type: 'CategoricalBin',
        subject: { entity: 'node', type: 'family_member' },
        prompts: [
          {
            id: 'p1',
            text: localized('Sort your family'),
            variable: 'genderIdentity',
          },
        ],
      },
    ]);
    expect(findExclusiveVariableConflicts(protocol)).toEqual([]);
  });

  it('still rejects a bin whose options have drifted from the interface-owned set', () => {
    const base = protocolWith([
      familyPedigree(),
      {
        id: 'cb1',
        label: localized('Sort by sex assigned at birth'),
        type: 'CategoricalBin',
        subject: { entity: 'node', type: 'family_member' },
        prompts: [
          {
            id: 'p1',
            text: localized('Sort your family'),
            variable: 'sexAssignedAtBirth',
          },
        ],
      },
    ]);
    const familyMember = base.codebook.node.family_member;
    const protocol = {
      ...base,
      codebook: {
        ...base.codebook,
        node: {
          family_member: {
            ...familyMember,
            variables: {
              ...familyMember.variables,
              sexAssignedAtBirth: {
                name: 'sexAssignedAtBirth',
                label: 'sexAssignedAtBirth',
                type: 'categorical',
                // Option labels are localized copy, so only a changed value
                // drifts.
                options: localizedOptions<string>(
                  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
                ).map((option) =>
                  option.value === 'female'
                    ? { ...option, value: 'woman' }
                    : option,
                ),
              },
            },
          },
        },
      },
    };
    const result = ProtocolSchemaV9.safeParse(protocol);
    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some((issue) =>
        issue.message.includes(
          'The sex assigned at birth attribute "sexAssignedAtBirth" used by a Family Pedigree stage must keep its fixed options.',
        ),
      ),
    ).toBe(true);
  });

  it('returns nothing for a non-object input', () => {
    expect(findExclusiveVariableConflicts(null)).toEqual([]);
  });
});

describe('findStageManagedOptionBindings', () => {
  it('names the stage that binds the gender identity attribute, with its label', () => {
    const protocol = protocolWith([familyPedigree()]);
    expect(findStageManagedOptionBindings(protocol)).toEqual([
      {
        subject: { entity: 'node', type: 'family_member' },
        variableId: 'genderIdentity',
        descriptor: { owner: 'the kinship words each option takes' },
        stageId: 'fp1',
        stageLabel: 'Family Pedigree',
        path: ['stages', 0, 'nodeConfiguration', 'genderIdentity', 'attribute'],
      },
    ]);
  });

  it('returns one binding per stage when several stages bind the attribute', () => {
    const protocol = protocolWith([
      familyPedigree(),
      familyPedigree({ id: 'fp2', label: localized('Second family') }),
    ]);
    expect(
      findStageManagedOptionBindings(protocol).map(
        (binding) => binding.stageId,
      ),
    ).toEqual(['fp1', 'fp2']);
  });

  it('finds nothing when the stage does not ask about gender identity', () => {
    const { genderIdentity: _omitted, ...withoutGender } = nodeConfiguration;
    const protocol = protocolWith([
      familyPedigree({ nodeConfiguration: withoutGender }),
    ]);
    expect(findStageManagedOptionBindings(protocol)).toEqual([]);
  });

  it('does not bind variables that other stages merely write', () => {
    // A stage that only WRITES the variable (a form field asking it) does not
    // manage its options, and the pedigree's binding does not make the
    // variable exclusive: both are accepted together.
    const protocol = protocolWith([
      familyPedigree(),
      {
        id: 'ask',
        label: localized('Ask gender'),
        type: 'NameGenerator',
        subject: { entity: 'node', type: 'family_member' },
        form: {
          fields: [
            { variable: 'genderIdentity', prompt: localized('Gender?') },
          ],
        },
        prompts: [{ id: 'p1', text: localized('Name people') }],
      },
    ]);
    expect(
      findStageManagedOptionBindings(protocol).map(
        (binding) => binding.stageId,
      ),
    ).toEqual(['fp1']);
    expect(findExclusiveVariableConflicts(protocol)).toEqual([]);
  });
});
