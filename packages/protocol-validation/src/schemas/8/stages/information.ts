import { z } from 'zod';

import { duplicateIdRefinement } from '../../../utils/validation-helpers.ts';
import { baseStageSchema } from './base.ts';

const ItemSizeSchema = z.enum(['SMALL', 'MEDIUM', 'LARGE']);

const baseItemSchema = z.strictObject({
  id: z.string(),
  content: z.string(),
  description: z.string().optional(),
});

// Text items render plain content and have no asset-sizing treatment.
const textItemSchema = baseItemSchema.extend({
  type: z.literal('text'),
});

// Size is an image/video sizing treatment, so it only applies to asset items.
const assetItemSchema = baseItemSchema.extend({
  type: z.literal('asset'),
  size: ItemSizeSchema.optional(),
});

const ItemSchema = z.discriminatedUnion('type', [
  textItemSchema,
  assetItemSchema,
]);

export type Item = z.infer<typeof ItemSchema>;

export const informationStage = baseStageSchema.extend({
  type: z.literal('Information'),
  title: z.string().optional(),
  items: z.array(ItemSchema).superRefine(duplicateIdRefinement('Items')),
});
