import { z } from 'zod';

import { duplicateIdRefinement } from '../../../utils/validation-helpers.ts';
import { assetReference } from '../asset-reference.ts';
import { localizedString } from '../localized-string.ts';
import { baseStageSchema } from './base.ts';

const ItemSizeSchema = z.enum(['SMALL', 'MEDIUM', 'LARGE']);

// A text item's `description` is never shown to a participant, so it stays a
// plain researcher note; an asset item's is the media's alt text.
const textItemSchema = z.strictObject({
  id: z.string(),
  type: z.literal('text'),
  content: localizedString(z.string().min(1), 'markdown'),
  description: z.string().optional(),
});

// Size is an image/video sizing treatment, so it only applies to asset items.
const assetItemSchema = z.strictObject({
  id: z.string(),
  type: z.literal('asset'),
  content: assetReference(),
  description: localizedString(z.string(), 'plain').optional(),
  size: ItemSizeSchema.optional(),
});

const ItemSchema = z.discriminatedUnion('type', [
  textItemSchema,
  assetItemSchema,
]);

export type Item = z.infer<typeof ItemSchema>;

export const informationStage = baseStageSchema.extend({
  type: z.literal('Information'),
  title: localizedString(z.string().min(1), 'plain'),
  items: z.array(ItemSchema).superRefine(duplicateIdRefinement('Items')),
});
