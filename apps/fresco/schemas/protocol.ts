import 'server-only';
import { z } from 'zod';

import { CurrentProtocolSchema } from '@codaco/protocol-validation';

const assetInsertSchema = z.object({
  key: z.string(),
  assetId: z.string(),
  name: z.string(),
  type: z.string(),
  url: z.string(),
  size: z.number(),
  value: z.string().optional(),
});

export type AssetInsertType = z.infer<typeof assetInsertSchema>;

export const protocolInsertSchema = z.object({
  protocol: CurrentProtocolSchema,
  // Supplied by the importer rather than derived here from `protocol`: the
  // hash identifies the document the researcher uploaded, which the parse
  // output that reaches this action is no longer a faithful copy of (spec
  // decision 15). Deriving it a second time is what would let the stored hash
  // drift away from the one duplicate detection just checked.
  protocolHash: z.string().min(1),
  protocolName: z.string(),
  newAssets: z.array(assetInsertSchema),
  existingAssetIds: z.array(z.string()),
  originalFile: z.object({
    key: z.string(),
    url: z.string(),
  }),
});
