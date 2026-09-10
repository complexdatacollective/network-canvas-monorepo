import { z } from 'zod';

import { FilterSchema } from '../filters/index.ts';
import { stageReference } from '../stage-reference.ts';

const SkipLogicActionSchema = z.enum(['SHOW', 'SKIP']);
export type SkipLogicAction = z.infer<typeof SkipLogicActionSchema>;

export const SkipLogicDestinationSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('stage'),
    stageId: stageReference('skipLogic.destination.stageId'),
  }),
  z.strictObject({
    type: z.literal('finish'),
  }),
]);

export type SkipLogicDestination = z.infer<typeof SkipLogicDestinationSchema>;

export const SkipLogicSchema = z.strictObject({
  action: SkipLogicActionSchema,
  filter: FilterSchema,
  destination: SkipLogicDestinationSchema.optional(),
});

export type SkipLogic = z.infer<typeof SkipLogicSchema>;
