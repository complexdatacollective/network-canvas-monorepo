import { z } from 'zod';

export const NodeStageSubjectSchema = z.strictObject({
  entity: z.literal('node'),
  type: z.string(),
});

export const EdgeStageSubjectSchema = z.strictObject({
  entity: z.literal('edge'),
  type: z.string(),
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
