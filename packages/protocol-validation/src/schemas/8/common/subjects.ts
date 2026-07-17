import { z } from 'zod';

import { entityTypeReference } from '../entity-type-reference.ts';

export const NodeStageSubjectSchema = z.strictObject({
  entity: z.literal('node'),
  type: entityTypeReference({ entity: 'node' }),
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

export type StageSubject = z.infer<typeof StageSubjectSchema>;
