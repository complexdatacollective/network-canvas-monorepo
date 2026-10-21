import 'server-only';
import { type CurrentProtocol as LegacyProtocol } from 'fresco-schema-8/protocol-validation';
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
  protocolName: z.string(),
  newAssets: z.array(assetInsertSchema),
  existingAssetIds: z.array(z.string()),
  originalFile: z.object({
    key: z.string(),
    url: z.string(),
  }),
});

/**
 * What `insertProtocol` stores: a protocol at the current schema, or one the
 * researcher chose to keep at schema 8 when importing it.
 */
export type ProtocolInsert = Omit<
  z.infer<typeof protocolInsertSchema>,
  'protocol'
> & {
  protocol: z.infer<typeof protocolInsertSchema>['protocol'] | LegacyProtocol;
};
