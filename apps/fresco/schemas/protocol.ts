import 'server-only';
import { z } from 'zod';

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
  // The PRE-PARSE protocol document: the object the uploaded file contained
  // for a current-version protocol, the migration output for older ones.
  // `insertProtocol` derives BOTH the stored hash and the stored parse output
  // from this one field at its trust boundary, so no caller can store a hash
  // that does not identify the stored document. Deliberately not
  // `CurrentProtocolSchema`: parsing here would swap the document for the
  // schema's output, and a hash of that would fold schema-injected defaults
  // into protocol identity (spec decision 15). Only the two fields the hash
  // covers are named; `looseObject` passes the rest of the document through
  // untouched for the action's own `CurrentProtocolSchema` parse.
  protocolDocument: z.looseObject({
    codebook: z.unknown(),
    stages: z.unknown(),
  }),
  protocolName: z.string(),
  newAssets: z.array(assetInsertSchema),
  existingAssetIds: z.array(z.string()),
  originalFile: z.object({
    key: z.string(),
    url: z.string(),
  }),
});
