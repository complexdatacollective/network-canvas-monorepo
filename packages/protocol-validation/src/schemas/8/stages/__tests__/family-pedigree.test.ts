import { describe, expect, it } from 'vitest';

import { findExclusiveVariableConflicts } from '../../../../utils/findExclusiveVariableConflicts.ts';
import {
  PEDIGREE_GENDER_IDENTITY_OPTIONS,
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
} from '../../family-pedigree-values.ts';
import ProtocolSchemaV8 from '../../schema.ts';
import { familyPedigreeStage } from '../family-pedigree.ts';

const base = {
  id: 'fp1',
  label: 'Family Pedigree',
  type: 'FamilyPedigree' as const,
  subject: { entity: 'node' as const, type: 'person' },
  prompt: 'Draw your family',
  personAttributes: {
    nameVariable: 'name',
    genderIdentityVariable: 'gender',
    sexAssignedAtBirthVariable: 'sab',
    egoVariable: 'isEgo',
  },
  relationship: {
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

  it('accepts researcher-defined person fields', () => {
    expect(
      familyPedigreeStage.safeParse({
        ...base,
        form: { fields: [{ variable: 'age', prompt: 'How old are they?' }] },
      }).success,
    ).toBe(true);
  });

  it('requires personAttributes', () => {
    const { personAttributes: _omitted, ...withoutPersonAttributes } = base;
    expect(familyPedigreeStage.safeParse(withoutPersonAttributes).success).toBe(
      false,
    );
  });

  it('requires every person attribute', () => {
    const { egoVariable: _omitted, ...incomplete } = base.personAttributes;
    expect(
      familyPedigreeStage.safeParse({ ...base, personAttributes: incomplete })
        .success,
    ).toBe(false);
  });

  it('requires a relationship configuration', () => {
    const { relationship: _omitted, ...withoutRelationship } = base;
    expect(familyPedigreeStage.safeParse(withoutRelationship).success).toBe(
      false,
    );
  });

  it('requires a non-empty prompt', () => {
    expect(familyPedigreeStage.safeParse({ ...base, prompt: '' }).success).toBe(
      false,
    );
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
