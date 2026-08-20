import { describe, expect, it } from 'vitest';

import {
  BIOLOGICAL_SEX_OPTIONS,
  GAMETE_ROLE_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/shared-consts';

import ProtocolSchemaV8 from '../../schemas/8/schema.ts';
import { findExclusiveVariableConflicts } from '../findExclusiveVariableConflicts.ts';

type Stage = Record<string, unknown>;

const familyPedigree = (overrides: Stage = {}): Stage => ({
  id: 'fp1',
  label: 'Family Pedigree',
  type: 'FamilyPedigree',
  nodeConfig: {
    type: 'family_member',
    nodeLabelVariable: 'fmName',
    egoVariable: 'isEgo',
    relationshipVariable: 'relationshipToEgo',
    biologicalSexVariable: 'biologicalSex',
  },
  edgeConfig: {
    type: 'family_edge',
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
  ...overrides,
});

const narrativePedigree = (variable: string): Stage => ({
  id: 'np1',
  label: 'Narrative Pedigree',
  type: 'NarrativePedigree',
  sourceStageId: 'fp1',
  diseases: [
    {
      id: 'd1',
      label: 'Condition X',
      color: 'node-color-seq-1',
      variable,
      inheritancePattern: 'autosomalDominant',
    },
  ],
});

const protocolWith = (stages: Stage[]) => ({
  name: 'Pedigree protocol',
  schemaVersion: 8 as const,
  codebook: {
    node: {
      family_member: {
        name: 'Family member',
        color: 'node-color-seq-1',
        shape: { default: 'circle' as const },
        variables: {
          fmName: { name: 'fm_name', type: 'text', component: 'Text' },
          isEgo: { name: 'is_ego', type: 'boolean' },
          relationshipToEgo: { name: 'fm_relationship_to_ego', type: 'text' },
          biologicalSex: {
            name: 'biologicalSex',
            type: 'categorical',
            options: BIOLOGICAL_SEX_OPTIONS,
          },
          hasConditionX: { name: 'hasConditionX', type: 'boolean' },
          hadTesting: { name: 'hadTesting', type: 'boolean' },
          fmLayout: { name: 'fmLayout', type: 'layout' },
        },
      },
    },
    edge: {
      family_edge: {
        name: 'Family edge',
        color: 'edge-color-seq-1',
        variables: {
          relationshipType: {
            name: 'relationshipType',
            type: 'categorical',
            options: RELATIONSHIP_TYPE_OPTIONS,
          },
          isActive: { name: 'isActive', type: 'boolean' },
          isGestationalCarrier: {
            name: 'isGestationalCarrier',
            type: 'boolean',
          },
          gameteRole: {
            name: 'gameteRole',
            type: 'categorical',
            options: GAMETE_ROLE_OPTIONS,
          },
        },
      },
    },
  },
  stages,
});

describe('findExclusiveVariableConflicts', () => {
  it('reports nothing for a well-formed pedigree pair', () => {
    const protocol = protocolWith([
      familyPedigree({
        nominationPrompts: [
          { id: 'np', text: 'Who has this?', variable: 'hasConditionX' },
        ],
      }),
      narrativePedigree('hasConditionX'),
    ]);
    expect(findExclusiveVariableConflicts(protocol)).toEqual([]);
    expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(true);
  });

  it('reports a nomination prompt bound to the ego variable', () => {
    const protocol = protocolWith([
      familyPedigree({
        nominationPrompts: [
          { id: 'np', text: 'Who has this?', variable: 'isEgo' },
        ],
      }),
    ]);
    const conflicts = findExclusiveVariableConflicts(protocol);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.path).toEqual([
      'stages',
      0,
      'nominationPrompts',
      0,
      'variable',
    ]);
    expect(conflicts[0]?.owner.slot).toBe(
      'familyPedigree.nodeConfig.egoVariable',
    );
    expect(conflicts[0]?.variableName).toBe('is_ego');
    expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(false);
  });

  // A disease row DECLARES what a variable means — "who is affected by this" —
  // so pointing one at the pedigree's own participant marker contradicts the
  // interface exactly as a second writer would, and paints the participant as
  // affected in every interview.
  it('reports a disease mapped onto an interface-owned slot', () => {
    const protocol = protocolWith([
      familyPedigree(),
      narrativePedigree('isEgo'),
    ]);
    const conflicts = findExclusiveVariableConflicts(protocol);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.path).toEqual([
      'stages',
      1,
      'diseases',
      0,
      'variable',
    ]);
    expect(conflicts[0]?.owner.slot).toBe(
      'familyPedigree.nodeConfig.egoVariable',
    );
    expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(false);
  });

  it('does not report a skip-logic filter rule that tests an interface-derived variable', () => {
    const protocol = protocolWith([
      familyPedigree(),
      {
        id: 'info1',
        label: 'Wrap up',
        type: 'Information',
        items: [{ id: 'i1', type: 'text', content: 'Thanks', size: 'MEDIUM' }],
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

  // A Sociogram prompt that sets `highlight.variable` without
  // `allowHighlighting` colours nodes by a value it never writes — the same
  // kind of read as grouping a narrative map by relationship. Rejecting it
  // would forbid showing the participant their own node on a map of the family
  // the pedigree built.
  it('accepts a display-only sociogram highlight on an interface-owned variable', () => {
    const protocol = protocolWith([
      familyPedigree(),
      {
        id: 'sg1',
        label: 'Map your family',
        type: 'Sociogram',
        subject: { entity: 'node', type: 'family_member' },
        background: { concentricCircles: 4 },
        prompts: [
          {
            id: 'p1',
            text: 'Place your family',
            layout: { layoutVariable: 'fmLayout' },
            highlight: { allowHighlighting: false, variable: 'isEgo' },
          },
        ],
      },
    ]);
    expect(findExclusiveVariableConflicts(protocol)).toEqual([]);
    const result = ProtocolSchemaV8.safeParse(protocol);
    expect(result.success ? null : result.error.issues).toBeNull();
  });

  // The same field IS a writer once the participant can tap it: highlighting
  // would let them turn the pedigree's own participant marker on and off.
  it('still reports a tap-to-highlight sociogram prompt on an interface-owned variable', () => {
    const protocol = protocolWith([
      familyPedigree(),
      {
        id: 'sg1',
        label: 'Map your family',
        type: 'Sociogram',
        subject: { entity: 'node', type: 'family_member' },
        background: { concentricCircles: 4 },
        prompts: [
          {
            id: 'p1',
            text: 'Place your family',
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
    expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(false);
  });

  it('reports a form field bound to an exclusive structural variable', () => {
    const protocol = protocolWith([
      familyPedigree({
        nodeConfig: {
          type: 'family_member',
          nodeLabelVariable: 'fmName',
          egoVariable: 'isEgo',
          relationshipVariable: 'relationshipToEgo',
          biologicalSexVariable: 'biologicalSex',
          form: [{ variable: 'isEgo', prompt: 'Are you the participant?' }],
        },
      }),
    ]);
    const conflicts = findExclusiveVariableConflicts(protocol);
    expect(conflicts.map((conflict) => conflict.path)).toEqual([
      ['stages', 0, 'nodeConfig', 'form', 0, 'variable'],
    ]);
  });

  it('accepts two FamilyPedigree stages that share one node type and its structural slots', () => {
    const protocol = protocolWith([
      familyPedigree(),
      familyPedigree({ id: 'fp2', label: 'Second pedigree' }),
    ]);
    expect(findExclusiveVariableConflicts(protocol)).toEqual([]);
    expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(true);
  });

  it('reports one variable claimed by two DIFFERENT exclusive slots', () => {
    const protocol = protocolWith([
      familyPedigree({
        nodeConfig: {
          type: 'family_member',
          nodeLabelVariable: 'fmName',
          egoVariable: 'isEgo',
          relationshipVariable: 'isEgo',
          biologicalSexVariable: 'biologicalSex',
        },
      }),
    ]);
    const conflicts = findExclusiveVariableConflicts(protocol);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.path).toEqual([
      'stages',
      0,
      'nodeConfig',
      'relationshipVariable',
    ]);
  });

  it('leaves the biological-sex variable free to be bound elsewhere', () => {
    // Binning family members by sex is legitimate authoring: the interface owns
    // the OPTIONS, not the reference. Only the options are locked.
    const protocol = protocolWith([
      familyPedigree(),
      {
        id: 'cb1',
        label: 'Sort by sex',
        type: 'CategoricalBin',
        subject: { entity: 'node', type: 'family_member' },
        prompts: [
          { id: 'p1', text: 'Sort your family', variable: 'biologicalSex' },
        ],
      },
    ]);
    expect(findExclusiveVariableConflicts(protocol)).toEqual([]);
  });

  it('still rejects a bin whose options have drifted from the interface-owned set', () => {
    const protocol = protocolWith([
      familyPedigree(),
      {
        id: 'cb1',
        label: 'Sort by sex',
        type: 'CategoricalBin',
        subject: { entity: 'node', type: 'family_member' },
        prompts: [
          { id: 'p1', text: 'Sort your family', variable: 'biologicalSex' },
        ],
      },
    ]);
    protocol.codebook.node.family_member.variables.biologicalSex = {
      name: 'biologicalSex',
      type: 'categorical',
      options: BIOLOGICAL_SEX_OPTIONS.map((option) =>
        option.value === 'female' ? { ...option, label: 'Woman' } : option,
      ),
    };
    const result = ProtocolSchemaV8.safeParse(protocol);
    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some((issue) =>
        issue.message.includes(
          'biological sex attribute "biologicalSex" must use its fixed set of options',
        ),
      ),
    ).toBe(true);
  });

  it('returns nothing for a non-object input', () => {
    expect(findExclusiveVariableConflicts(null)).toEqual([]);
  });
});
