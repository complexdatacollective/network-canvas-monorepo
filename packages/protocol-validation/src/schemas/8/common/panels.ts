import { z } from 'zod';

import { assetReference } from '../asset-reference.ts';
import { FilterSchema } from '../filters/index.ts';

export const panelSchema = z.strictObject({
  id: z.string(),
  title: z.string().min(1),
  filter: FilterSchema.optional(),
  // Either a manifest asset id or the sentinel naming the interview network
  // itself. `ignoreValues` keeps the sentinel out of the asset usage index.
  dataSource: z.union([
    assetReference({ ignoreValues: ['existing'] }),
    z.literal('existing'),
  ]),
});

export type Panel = z.infer<typeof panelSchema>;
