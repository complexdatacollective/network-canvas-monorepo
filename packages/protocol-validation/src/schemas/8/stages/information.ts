import { z } from 'zod';

import { findDuplicateId } from '~/utils/validation-helpers';

import { baseStageSchema } from './base';

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

// Also consumed by the FamilyPedigree stage, whose intro screen reuses the
// Information content-item model.
export const ItemSchema = z.discriminatedUnion('type', [
  textItemSchema,
  assetItemSchema,
]);

export type Item = z.infer<typeof ItemSchema>;

export const informationStage = baseStageSchema.extend({
  type: z.literal('Information'),
  title: z.string().optional(),
  items: z.array(ItemSchema).superRefine((items, ctx) => {
    // Check for duplicate item IDs
    const duplicateItemId = findDuplicateId(items);
    if (duplicateItemId) {
      ctx.addIssue({
        code: 'custom' as const,
        message: `Items contain duplicate ID "${duplicateItemId}"`,
        path: [],
      });
    }
  }),
});
