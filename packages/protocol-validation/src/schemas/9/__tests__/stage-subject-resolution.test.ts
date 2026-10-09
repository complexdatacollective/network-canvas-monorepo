import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { collectEntityAttributeReferences } from '../../../utils/collectEntityAttributeReferences.ts';
import { localized, localizedOptions } from '../../../utils/test-utils.ts';
import { getEntityAttributeReferenceDescriptor } from '../entity-attribute-reference.ts';
import {
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
} from '../family-pedigree-values.ts';
import ProtocolSchemaV9 from '../schema.ts';
import { getStageSubjectResolution } from '../stage-subject-resolution.ts';
import { familyPedigreeWordingIn } from '../stage-wording/family-pedigree.ts';
import { stageSchema } from '../stages/index.ts';
import { narrativePedigreeWords } from './canvas-stage-words.ts';
import { pedigreeNameField } from './family-pedigree-text.ts';
import {
  GENDER_IDENTITY_OPTIONS,
  GENDER_IDENTITY_TERMS,
} from './pedigreeGenderFixtures.ts';

type Stage = Record<string, unknown>;

const familyPedigree = (overrides: Stage = {}): Stage => ({
  id: 'fp1',
  label: localized('Family Pedigree'),
  type: 'FamilyPedigree',
  wording: familyPedigreeWordingIn(),
  subject: { entity: 'node', type: 'family_member' },
  prompt: localized('Build your family'),
  nodeConfiguration: {
    nameAttribute: 'fmName',
    nameField: pedigreeNameField(),
    genderIdentity: {
      attribute: 'genderIdentity',
      terms: GENDER_IDENTITY_TERMS,
    },
    sexAssignedAtBirthAttribute: 'sexAssignedAtBirth',
    egoAttribute: 'isEgo',
  },
  edgeConfiguration: {
    type: 'family_edge',
    kindAttribute: 'relationshipKind',
    gestationalCarrierAttribute: 'isGestationalCarrier',
    currentPartnerAttribute: 'isCurrentPartner',
  },
  ...overrides,
});

const narrativePedigree = (attribute: string): Stage => ({
  id: 'np1',
  label: localized('Narrative Pedigree'),
  type: 'NarrativePedigree',
  sourceStageId: 'fp1',
  ...narrativePedigreeWords(),
  diseases: [
    {
      id: 'd1',
      label: localized('Condition X'),
      color: 'node-color-seq-1',
      attribute,
      inheritancePattern: 'autosomalDominant',
    },
  ],
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
            component: 'Toggle',
          },
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

const issueMessagesAt = (protocol: unknown, path: (string | number)[]) => {
  const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
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
          fields: [
            { variable: 'notInCodebook', prompt: localized('Tell us more') },
          ],
        },
      }),
    ]);
    expect(
      issueMessagesAt(protocol, ['stages', 0, 'form', 'fields', 0, 'variable']),
    ).toContain('The attribute "notInCodebook" does not exist in the codebook');
  });

  it('existence-checks a NarrativePedigree disease attribute through sourceStageId', () => {
    const protocol = protocolWith([
      familyPedigree(),
      narrativePedigree('notInCodebook'),
    ]);
    expect(
      issueMessagesAt(protocol, ['stages', 1, 'diseases', 0, 'attribute']),
    ).toContain('The attribute "notInCodebook" does not exist in the codebook');
  });

  it('resolves a NarrativePedigree disease against its source pedigree subject', () => {
    const protocol = protocolWith([
      familyPedigree(),
      narrativePedigree('hasConditionX'),
    ]);
    const hit = collectEntityAttributeReferences(protocol).find(
      (candidate) =>
        candidate.path.join('.') ===
        ['stages', 1, 'diseases', 0, 'attribute'].join('.'),
    );
    expect(hit?.subject).toEqual({ entity: 'node', type: 'family_member' });
    const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
    expect(
      result.success ? [] : result.error.issues.map((issue) => issue.message),
    ).toEqual([]);
  });

  it('leaves a NarrativePedigree disease unresolved when sourceStageId dangles', () => {
    const protocol = protocolWith([
      familyPedigree(),
      { ...narrativePedigree('hasConditionX'), sourceStageId: 'nope' },
    ]);
    const hit = collectEntityAttributeReferences(protocol).find(
      (candidate) =>
        candidate.path.join('.') ===
        ['stages', 1, 'diseases', 0, 'attribute'].join('.'),
    );
    expect(hit?.subject).toBeUndefined();
    expect(issueMessagesAt(protocol, ['stages', 1, 'sourceStageId'])).toEqual([
      'NarrativePedigree sourceStageId "nope" does not reference an existing stage.',
    ]);
  });

  it('existence-checks a FamilyPedigree person attribute', () => {
    const protocol = protocolWith([
      familyPedigree({
        nodeConfiguration: {
          nameAttribute: 'notInCodebook',
          nameField: pedigreeNameField(),
          genderIdentity: {
            attribute: 'genderIdentity',
            terms: GENDER_IDENTITY_TERMS,
          },
          sexAssignedAtBirthAttribute: 'sexAssignedAtBirth',
          egoAttribute: 'isEgo',
        },
      }),
    ]);
    expect(
      issueMessagesAt(protocol, [
        'stages',
        0,
        'nodeConfiguration',
        'nameAttribute',
      ]),
    ).toContain('The attribute "notInCodebook" does not exist in the codebook');
  });

  it('accepts a pedigree whose references all exist', () => {
    const protocol = protocolWith([
      familyPedigree({
        form: {
          fields: [
            { variable: 'hasConditionX', prompt: localized('Affected?') },
          ],
        },
      }),
    ]);
    const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
    expect(
      result.success ? [] : result.error.issues.map((issue) => issue.message),
    ).toEqual([]);
  });

  it('resolves the subject on the hit itself, so no consumer re-derives one', () => {
    const protocol = protocolWith([
      familyPedigree({
        form: {
          fields: [
            { variable: 'hasConditionX', prompt: localized('Affected?') },
          ],
        },
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
    expect(
      subjectAt(['stages', 0, 'nodeConfiguration', 'egoAttribute']),
    ).toEqual({ entity: 'node', type: 'family_member' });
    expect(
      subjectAt(['stages', 0, 'edgeConfiguration', 'kindAttribute']),
    ).toEqual({
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
