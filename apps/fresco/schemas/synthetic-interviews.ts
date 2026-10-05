import { z } from 'zod';

export const MAX_SYNTHETIC_INTERVIEWS = 1000;

export const generateSyntheticInterviewsSchema = z.object({
  protocolId: z.string().min(1),
  count: z.number().int().min(1).max(MAX_SYNTHETIC_INTERVIEWS),
  simulateDropOut: z.boolean().default(true),
  respectSkipLogicAndFiltering: z.boolean().default(false),
});

export const syntheticGenerationFailureSchema = z.object({
  error: z.string(),
  diagnostic: z.string().optional(),
  details: z
    .array(z.object({ subject: z.string(), reason: z.string() }))
    .optional(),
});

export type SyntheticGenerationFailure = z.infer<
  typeof syntheticGenerationFailureSchema
>;

export const syntheticGenerationEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('progress'),
    current: z.number().int().nonnegative(),
    total: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('complete'),
    created: z.number().int().nonnegative(),
  }),
  syntheticGenerationFailureSchema.extend({ type: z.literal('error') }),
]);
