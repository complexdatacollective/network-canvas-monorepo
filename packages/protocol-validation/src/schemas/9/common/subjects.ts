import { z } from 'zod';

import { entityTypeReference } from '../entity-type-reference.ts';
import {
  STAGE_NODE_TYPE_CAPABILITY,
  type NodeSubjectStageType,
} from '../stage-capabilities.ts';

// Shared by every stage's list, so the stage schemas add no tagged instance.
const NODE_TYPE_ELEMENT = entityTypeReference({ entity: 'node' });

// The duplicate check runs before the cap, so a stage capped at one type
// still reports a repeated type as a repeat.
const nodeTypesList = (maxTypes?: number) => {
  const list = z
    .array(NODE_TYPE_ELEMENT)
    .min(1)
    .superRefine((types, ctx) => {
      types.forEach((type, index) => {
        if (types.indexOf(type) !== index) {
          ctx.addIssue({
            code: 'custom',
            message: `Node type "${type}" is listed more than once.`,
            path: [index],
          });
        }
      });
    });
  return maxTypes === undefined ? list : list.max(maxTypes);
};

export const NodeStageSubjectSchema = z.strictObject({
  entity: z.literal('node'),
  types: nodeTypesList(),
});

/**
 * The node subject of one stage type: a list of node types, capped at one
 * where the capability table says the stage runs a single type.
 */
export const nodeStageSubjectFor = (stageType: NodeSubjectStageType) =>
  z.strictObject({
    entity: z.literal('node'),
    types: nodeTypesList(
      STAGE_NODE_TYPE_CAPABILITY[stageType] === 'single' ? 1 : undefined,
    ),
  });

export const EdgeStageSubjectSchema = z.strictObject({
  entity: z.literal('edge'),
  type: entityTypeReference({ entity: 'edge' }),
});

export const EgoStageSubjectSchema = z.strictObject({
  entity: z.literal('ego'),
});

export const StageSubjectSchema = z.union([
  EgoStageSubjectSchema,
  NodeStageSubjectSchema,
  EdgeStageSubjectSchema,
]);

export type NodeStageSubject = z.infer<typeof NodeStageSubjectSchema>;

export type StageSubject = z.infer<typeof StageSubjectSchema>;

/**
 * One entity a reference, form or rule is about: the participant, one node
 * type or one edge type.
 */
export type ResolvedSubject =
  | { entity: 'ego' }
  | { entity: 'node'; type: string }
  | { entity: 'edge'; type: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads raw protocol data as one resolved subject. A singular node or edge
 * subject and an ego subject pass through; a node subject listing exactly one
 * type resolves to that type; one listing several resolves to nothing, since
 * no single type answers for the stage. Anything else is not a subject.
 */
export const resolveSubjectValue = (
  value: unknown,
): ResolvedSubject | undefined => {
  if (!isRecord(value)) return undefined;
  if (value.entity === 'ego') return { entity: 'ego' };
  if (value.entity === 'edge') {
    return typeof value.type === 'string'
      ? { entity: 'edge', type: value.type }
      : undefined;
  }
  if (value.entity !== 'node') return undefined;
  if (typeof value.type === 'string')
    return { entity: 'node', type: value.type };
  const { types } = value;
  if (
    Array.isArray(types) &&
    types.length === 1 &&
    typeof types[0] === 'string'
  ) {
    return { entity: 'node', type: types[0] };
  }
  return undefined;
};
