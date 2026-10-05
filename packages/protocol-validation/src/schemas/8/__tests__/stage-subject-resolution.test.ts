import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { collectEntityAttributeReferences } from '../../../utils/collectEntityAttributeReferences.ts';
import { getEntityAttributeReferenceDescriptor } from '../entity-attribute-reference.ts';
import {
  PEDIGREE_GENDER_IDENTITY_OPTIONS,
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
} from '../family-pedigree-values.ts';
import ProtocolSchemaV8 from '../schema.ts';
import { getStageSubjectResolution } from '../stage-subject-resolution.ts';
import { stageSchema } from '../stages/index.ts';

type Stage = Record<string, unknown>;

const familyPedigree = (overrides: Stage = {}): Stage => ({
  id: 'fp1',
  label: 'Family Pedigree',
  type: 'FamilyPedigree',
  subject: { entity: 'node', type: 'family_member' },
  prompt: 'Build your family',
  personAttributes: {
    nameVariable: 'fmName',
    genderIdentityVariable: 'genderIdentity',
    sexAssignedAtBirthVariable: 'sexAssignedAtBirth',
    egoVariable: 'isEgo',
  },
  relationship: {
    type: 'family_edge',
    kindVariable: 'relationshipKind',
    gestationalCarrierVariable: 'isGestationalCarrier',
    currentPartnerVariable: 'isCurrentPartner',
  },
  ...overrides,
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
          genderIdentity: {
            name: 'genderIdentity',
            type: 'categorical',
            options: PEDIGREE_GENDER_IDENTITY_OPTIONS,
          },
          sexAssignedAtBirth: {
            name: 'sexAssignedAtBirth',
            type: 'categorical',
            options: PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
          },
          hasConditionX: {
            name: 'hasConditionX',
            type: 'boolean',
            component: 'Toggle',
          },
        },
      },
    },
    edge: {
      family_edge: {
        name: 'Family edge',
        color: 'edge-color-seq-1',
        variables: {
          relationshipKind: {
            name: 'relationshipKind',
            type: 'categorical',
            options: PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
          },
          isGestationalCarrier: {
            name: 'isGestationalCarrier',
            type: 'boolean',
          },
          isCurrentPartner: { name: 'isCurrentPartner', type: 'boolean' },
        },
      },
    },
  },
  stages,
});

const issueMessagesAt = (protocol: unknown, path: (string | number)[]) => {
  const result = ProtocolSchemaV8.safeParse(protocol);
  if (result.success) return [];
  return result.error.issues
    .filter((issue) => issue.path.join('.') === path.join('.'))
    .map((issue) => issue.message);
};

describe('stage subjects resolve during collection', () => {
  it('existence-checks a FamilyPedigree form field variable', () => {
    const protocol = protocolWith([
      familyPedigree({
        form: {
          fields: [{ variable: 'notInCodebook', prompt: 'Tell us more' }],
        },
      }),
    ]);
    expect(
      issueMessagesAt(protocol, ['stages', 0, 'form', 'fields', 0, 'variable']),
    ).toContain('The attribute "notInCodebook" does not exist in the codebook');
  });

  it('existence-checks a FamilyPedigree person attribute', () => {
    const protocol = protocolWith([
      familyPedigree({
        personAttributes: {
          nameVariable: 'notInCodebook',
          genderIdentityVariable: 'genderIdentity',
          sexAssignedAtBirthVariable: 'sexAssignedAtBirth',
          egoVariable: 'isEgo',
        },
      }),
    ]);
    expect(
      issueMessagesAt(protocol, [
        'stages',
        0,
        'personAttributes',
        'nameVariable',
      ]),
    ).toContain('The attribute "notInCodebook" does not exist in the codebook');
  });

  it('accepts a pedigree whose references all exist', () => {
    const protocol = protocolWith([
      familyPedigree({
        form: { fields: [{ variable: 'hasConditionX', prompt: 'Affected?' }] },
      }),
    ]);
    const result = ProtocolSchemaV8.safeParse(protocol);
    expect(
      result.success ? [] : result.error.issues.map((issue) => issue.message),
    ).toEqual([]);
  });

  it('resolves the subject on the hit itself, so no consumer re-derives one', () => {
    const protocol = protocolWith([
      familyPedigree({
        form: { fields: [{ variable: 'hasConditionX', prompt: 'Affected?' }] },
      }),
    ]);
    const subjectAt = (path: (string | number)[]) =>
      collectEntityAttributeReferences(protocol).find(
        (hit) => hit.path.join('.') === path.join('.'),
      )?.subject;

    expect(subjectAt(['stages', 0, 'form', 'fields', 0, 'variable'])).toEqual({
      entity: 'node',
      type: 'family_member',
    });
    expect(subjectAt(['stages', 0, 'personAttributes', 'egoVariable'])).toEqual(
      { entity: 'node', type: 'family_member' },
    );
    expect(subjectAt(['stages', 0, 'relationship', 'kindVariable'])).toEqual({
      entity: 'edge',
      type: 'family_edge',
    });
  });
});

/**
 * Every `stageSubject` reference has to be resolvable, and a stage type is the
 * only thing that can say how. A new stage type that holds such a reference but
 * neither carries a `subject` field nor declares a resolution would have its
 * references collected with no subject — silently skipped by the existence
 * check and by every interface-owned rule. That is the failure this guards.
 */
describe('every stage type can resolve its own subject', () => {
  const usesStageSubject = (schema: z.ZodType): boolean => {
    const seen = new Set<z.ZodType>();
    const visit = (candidate: z.ZodType): boolean => {
      if (seen.has(candidate)) return false;
      seen.add(candidate);
      const descriptor = getEntityAttributeReferenceDescriptor(candidate);
      if (descriptor?.subject === 'stageSubject') return true;
      const children: unknown[] = [];
      if (candidate instanceof z.ZodObject) {
        children.push(...Object.values(candidate.shape));
      } else if (candidate instanceof z.ZodArray) {
        children.push(candidate.element);
      } else if (candidate instanceof z.ZodRecord) {
        children.push(candidate.valueType);
      } else if (candidate instanceof z.ZodUnion) {
        children.push(...candidate.options);
      } else if (
        candidate instanceof z.ZodOptional ||
        candidate instanceof z.ZodNullable ||
        candidate instanceof z.ZodDefault
      ) {
        children.push(candidate.unwrap());
      } else if (candidate instanceof z.ZodPipe) {
        children.push(candidate.in);
      }
      return children.some(
        (child) => child instanceof z.ZodType && visit(child),
      );
    };
    return visit(schema);
  };

  const stageOptions = stageSchema.options;

  it('covers every stage in the union', () => {
    expect(stageOptions.length).toBeGreaterThan(10);
  });

  it.each(
    stageOptions.map((option) => {
      const typeField: unknown = option.shape.type;
      const name =
        typeField instanceof z.ZodLiteral
          ? String([...typeField.values][0])
          : 'unknown';
      return [name, option] as const;
    }),
  )('%s declares or carries a subject', (_name, option) => {
    if (!usesStageSubject(option)) return;
    const carriesSubjectField = Object.hasOwn(option.shape, 'subject');
    const declaresResolution = getStageSubjectResolution(option) !== undefined;
    expect(carriesSubjectField || declaresResolution).toBe(true);
  });
});
