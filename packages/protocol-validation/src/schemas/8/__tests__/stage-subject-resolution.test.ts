import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  BIOLOGICAL_SEX_OPTIONS,
  GAMETE_ROLE_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/shared-consts';

import { collectEntityAttributeReferences } from '../../../utils/collectEntityAttributeReferences.ts';
import { getEntityAttributeReferenceDescriptor } from '../entity-attribute-reference.ts';
import ProtocolSchemaV8 from '../schema.ts';
import { getStageSubjectResolution } from '../stage-subject-resolution.ts';
import { stageSchema } from '../stages/index.ts';

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

const issueMessagesAt = (protocol: unknown, path: (string | number)[]) => {
  const result = ProtocolSchemaV8.safeParse(protocol);
  if (result.success) return [];
  return result.error.issues
    .filter((issue) => issue.path.join('.') === path.join('.'))
    .map((issue) => issue.message);
};

describe('stage subjects resolve during collection', () => {
  it('existence-checks a FamilyPedigree nomination prompt variable', () => {
    const protocol = protocolWith([
      familyPedigree({
        nominationPrompts: [
          { id: 'np', text: 'Who has this?', variable: 'notInCodebook' },
        ],
      }),
    ]);
    expect(
      issueMessagesAt(protocol, [
        'stages',
        0,
        'nominationPrompts',
        0,
        'variable',
      ]),
    ).toContain('The attribute "notInCodebook" does not exist in the codebook');
  });

  it('existence-checks a FamilyPedigree node form field variable', () => {
    const protocol = protocolWith([
      familyPedigree({
        nodeConfig: {
          type: 'family_member',
          nodeLabelVariable: 'fmName',
          egoVariable: 'isEgo',
          relationshipVariable: 'relationshipToEgo',
          biologicalSexVariable: 'biologicalSex',
          form: [{ variable: 'notInCodebook', prompt: 'Tell us more' }],
        },
      }),
    ]);
    expect(
      issueMessagesAt(protocol, [
        'stages',
        0,
        'nodeConfig',
        'form',
        0,
        'variable',
      ]),
    ).toContain('The attribute "notInCodebook" does not exist in the codebook');
  });

  it('existence-checks a NarrativePedigree disease variable through sourceStageId', () => {
    const protocol = protocolWith([
      familyPedigree(),
      narrativePedigree('notInCodebook'),
    ]);
    expect(
      issueMessagesAt(protocol, ['stages', 1, 'diseases', 0, 'variable']),
    ).toContain('The attribute "notInCodebook" does not exist in the codebook');
  });

  it('accepts a pedigree pair whose references all exist', () => {
    const protocol = protocolWith([
      familyPedigree({
        nominationPrompts: [
          { id: 'np', text: 'Who has this?', variable: 'hasConditionX' },
        ],
        nodeConfig: {
          type: 'family_member',
          nodeLabelVariable: 'fmName',
          egoVariable: 'isEgo',
          relationshipVariable: 'relationshipToEgo',
          biologicalSexVariable: 'biologicalSex',
          form: [{ variable: 'fmName', prompt: 'Their name' }],
        },
      }),
      narrativePedigree('hasConditionX'),
    ]);
    const result = ProtocolSchemaV8.safeParse(protocol);
    expect(
      result.success ? [] : result.error.issues.map((issue) => issue.message),
    ).toEqual([]);
  });

  it('resolves the subject on the hit itself, so no consumer re-derives one', () => {
    const protocol = protocolWith([
      familyPedigree({
        nominationPrompts: [
          { id: 'np', text: 'Who has this?', variable: 'hasConditionX' },
        ],
      }),
      narrativePedigree('hasConditionX'),
    ]);
    const subjectAt = (path: (string | number)[]) =>
      collectEntityAttributeReferences(protocol).find(
        (hit) => hit.path.join('.') === path.join('.'),
      )?.subject;

    expect(
      subjectAt(['stages', 0, 'nominationPrompts', 0, 'variable']),
    ).toEqual({ entity: 'node', type: 'family_member' });
    expect(subjectAt(['stages', 1, 'diseases', 0, 'variable'])).toEqual({
      entity: 'node',
      type: 'family_member',
    });
  });

  it('leaves a NarrativePedigree disease unresolved when sourceStageId dangles', () => {
    const protocol = protocolWith([
      familyPedigree(),
      { ...narrativePedigree('hasConditionX'), sourceStageId: 'nope' },
    ]);
    const hit = collectEntityAttributeReferences(protocol).find(
      (candidate) =>
        candidate.path.join('.') ===
        ['stages', 1, 'diseases', 0, 'variable'].join('.'),
    );
    expect(hit?.subject).toBeUndefined();
    // The dangling id itself is what gets reported, not a phantom attribute.
    expect(issueMessagesAt(protocol, ['stages', 1, 'sourceStageId'])).toEqual([
      'NarrativePedigree sourceStageId "nope" does not reference an existing stage.',
    ]);
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
