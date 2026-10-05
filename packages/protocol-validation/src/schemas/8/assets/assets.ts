import { z } from 'zod';

const baseAssetSchema = z.strictObject({
  id: z.string().optional(),
  name: z.string(),
});

// source is written verbatim as a zip entry name on export, so reject path
// separators and parent-directory segments to prevent zip-slip entry names.
export function isSafeAssetSource(source: string): boolean {
  return (
    source.length > 0 &&
    source !== '..' &&
    !source.includes('/') &&
    !source.includes('\\')
  );
}

export const assetSourceSchema = z.string().refine(isSafeAssetSource, {
  message: 'Asset source must be a filename without path separators or ".."',
});

const videoAudioAssetSchema = baseAssetSchema.extend({
  type: z.enum(['video', 'audio']),
  source: assetSourceSchema,
});

const fileAssetSchema = baseAssetSchema.extend({
  type: z.enum(['image', 'network', 'geojson']),
  source: assetSourceSchema,
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
