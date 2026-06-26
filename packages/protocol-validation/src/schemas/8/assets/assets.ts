import { z } from 'zod';

const baseAssetSchema = z.strictObject({
  id: z.string().optional(),
  name: z.string(),
});

const videoAudioAssetSchema = baseAssetSchema.extend({
  type: z.enum(['video', 'audio']),
  source: z.string(),
});

const fileAssetSchema = baseAssetSchema.extend({
  type: z.enum(['image', 'network', 'geojson']),
  source: z.string(),
});

const apiKeyAssetSchema = baseAssetSchema.extend({
  type: z.enum(['apikey']),
  value: z.string().min(1, { message: 'API key value must not be empty' }),
});

export const assetSchema = z.discriminatedUnion('type', [
  fileAssetSchema,
  apiKeyAssetSchema,
  videoAudioAssetSchema,
]);

export type Asset = z.infer<typeof assetSchema>;
