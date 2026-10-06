import { describe, expect, it } from 'vitest';

import { findExclusiveVariableConflicts } from '../../../../utils/findExclusiveVariableConflicts.ts';
import {
  PEDIGREE_GENDER_IDENTITY_OPTIONS,
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
} from '../../family-pedigree-values.ts';
import ProtocolSchemaV8 from '../../schema.ts';
import {
  FAMILY_PEDIGREE_BUILD_PROMPT_ID,
  familyPedigreeStage,
} from '../family-pedigree.ts';

const base = {
  id: 'fp1',
  label: 'Family Pedigree',
  type: 'FamilyPedigree' as const,
  subject: { entity: 'node' as const, type: 'person' },
  prompt: 'Draw your family',
  nodeConfiguration: {
    nameVariable: 'name',
    genderIdentityVariable: 'gender',
    sexAssignedAtBirthVariable: 'sab',
    egoVariable: 'isEgo',
  },
  edgeConfiguration: {
    type: 'family',
    kindVariable: 'kind',
    gestationalCarrierVariable: 'carrier',
    currentPartnerVariable: 'current',
  },
};

const protocolWith = (
  stage: Record<string, unknown>,
  genderOptions: {
    value: string;
    label: string;
  }[] = PEDIGREE_GENDER_IDENTITY_OPTIONS,
) => ({
  name: 'Pedigree protocol',
  schemaVersion: 8 as const,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' as const },
        variables: {
          name: { name: 'Name', type: 'text' as const, component: 'Text' },
          isEgo: { name: 'IsEgo', type: 'boolean' as const },
          hd: { name: 'HeartDisease', type: 'boolean' as const },
          gender: {
            name: 'Gender',
            type: 'categorical' as const,
            options: genderOptions,
          },
          sab: {
            name: 'Sab',
            type: 'categorical' as const,
            options: PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
          },
        },
      },
    },
    edge: {
      family: {
        name: 'Family',
        color: 'edge-color-seq-1',
        variables: {
          kind: {
            name: 'Kind',
            type: 'categorical' as const,
            options: PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
          },
          carrier: { name: 'Carrier', type: 'boolean' as const },
          current: { name: 'Current', type: 'boolean' as const },
        },
      },
    },
  },
  stages: [stage],
});

describe('familyPedigreeStage', () => {
  it('accepts a minimal stage', () => {
    expect(familyPedigreeStage.safeParse(base).success).toBe(true);
  });

  it('accepts each framing, or leaving it to the participant', () => {
    for (const framing of ['gendered', 'gamete', 'participantPreference']) {
      expect(familyPedigreeStage.safeParse({ ...base, framing }).success).toBe(
        true,
      );
    }
    expect(
      familyPedigreeStage.safeParse({ ...base, framing: 'neutral' }).success,
    ).toBe(false);
  });

  it('accepts researcher-defined person fields', () => {
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        form: { fields: [{ variable: 'age', prompt: 'How old are they?' }] },
      }).success,
    ).toBe(true);
  });

  it('requires nodeConfiguration', () => {
    const { nodeConfiguration: _omitted, ...withoutNodeConfiguration } = base;
    expect(
      familyPedigreeStage.safeParse(withoutNodeConfiguration).success,
    ).toBe(false);
  });

  it('requires every person attribute', () => {
    const { egoVariable: _omitted, ...incomplete } = base.nodeConfiguration;
    expect(
      familyPedigreeStage.safeParse({ ...base, nodeConfiguration: incomplete })
        .success,
    ).toBe(false);
  });

  it('requires a relationship configuration', () => {
    const { edgeConfiguration: _omitted, ...withoutRelationship } = base;
    expect(familyPedigreeStage.safeParse(withoutRelationship).success).toBe(
      false,
    );
  });

  it('requires a non-empty prompt', () => {
    expect(familyPedigreeStage.safeParse({ ...base, prompt: '' }).success).toBe(
      false,
    );
  });

  it('accepts nomination prompts, optionally limited by sex at birth', () => {
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        nominationPrompts: [
          { id: 'heart', text: 'Who has had heart disease?', variable: 'hd' },
          {
            id: 'ovarian',
            text: 'Who has had ovarian cancer?',
            variable: 'oc',
            onlyForSexAssignedAtBirth: 'female',
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('rejects nomination prompts that reuse an id, or the family prompt id', () => {
    const prompt = { id: 'heart', text: 'Who?', variable: 'hd' };
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        nominationPrompts: [prompt, { ...prompt, variable: 'other' }],
      }).success,
    ).toBe(false);
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        nominationPrompts: [{ ...prompt, id: FAMILY_PEDIGREE_BUILD_PROMPT_ID }],
      }).success,
    ).toBe(false);
  });

  it('rejects an empty list of nomination prompts, or another limit', () => {
    expect(
      familyPedigreeStage.safeParse({ ...base, nominationPrompts: [] }).success,
    ).toBe(false);
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        nominationPrompts: [
          {
            id: 'heart',
            text: 'Who?',
            variable: 'hd',
            onlyForSexAssignedAtBirth: 'intersex',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects the keys of the retired census interface', () => {
    expect(
      familyPedigreeStage.safeParse({ ...base, censusPrompt: 'Build' }).success,
    ).toBe(false);
  });
});

describe('FamilyPedigree in a whole protocol', () => {
  it('accepts a stage bound to correctly shaped codebook variables', () => {
    const result = ProtocolSchemaV8.safeParse(protocolWith(base));
    expect(result.success ? null : result.error.issues).toBeNull();
  });

  it('rejects a gender-identity variable whose options differ from the owned set', () => {
    const result = ProtocolSchemaV8.safeParse(
      protocolWith(base, [
        { value: 'woman', label: 'Woman' },
        { value: 'man', label: 'Man' },
      ]),
    );
    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some((issue) =>
        issue.message.includes(
          'gender identity attribute "gender" must use its fixed set of options',
        ),
      ),
    ).toBe(true);
  });

  it('requires each nomination prompt variable to be a boolean', () => {
    const withNomination = (variable: string) =>
      ProtocolSchemaV8.safeParse({
        ...protocolWith({
          ...base,
          nominationPrompts: [{ id: 'heart', text: 'Who?', variable }],
        }),
      });
    const accepted = withNomination('hd');
    expect(accepted.success ? null : accepted.error.issues).toBeNull();
    expect(withNomination('name').success).toBe(false);
    // Nor can it be the variable marking the participant.
    expect(withNomination('isEgo').success).toBe(false);
  });

  it('detects the participant marker being reused as a form field', () => {
    const stage = {
      ...base,
      form: {
        fields: [{ variable: 'isEgo', prompt: 'Are you the participant?' }],
      },
    };
    const protocol = protocolWith(stage);
    const conflicts = findExclusiveVariableConflicts(protocol);
    expect(conflicts.map((conflict) => conflict.path)).toEqual([
      ['stages', 0, 'form', 'fields', 0, 'variable'],
    ]);
    expect(ProtocolSchemaV8.safeParse(protocol).success).toBe(false);
  });
});
