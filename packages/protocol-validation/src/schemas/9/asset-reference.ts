import { z } from 'zod';

const ASSET_REFERENCE = 'assetReference' as const;

export type AssetReferenceDescriptor = {
  /**
   * Literal values at this site that are NOT asset ids. A name generator's
   * panel `dataSource` is either an asset id or the sentinel `'existing'`,
   * which names the interview network rather than anything in the manifest;
   * emitting a hit for it would put a phantom id in every usage index.
   */
  ignoreValues?: readonly string[];
};

/**
 * A string field holding an `assetManifest` key.
 *
 * Tagging the schema node — rather than hand-maintaining a list of paths in
 * each consumer — is what lets `collectAssetReferences` discover every asset
 * usage in a protocol, including the ones a stage type added after the
 * consumer was written. It is the asset counterpart of
 * `entityAttributeReference` and `entityTypeReference`.
 *
 * Unbranded, like `entityTypeReference`: asset ids flow through too much
 * runtime code (resolvers, importers, the manifest itself) for a brand to be
 * practical.
 *
 * The tag answers "which assets does this protocol USE?" and nothing more.
 * Whether a referenced asset exists in the manifest, and whether it is of the
 * right KIND for the site (a roster data source must be a `network` asset, a
 * map data source `network`, a background an image), is still decided by the
 * protocol-level refinements in `schema.ts`, which name each site themselves.
 * Folding those into this descriptor is worth doing, but it rewrites the
 * researcher-facing message of every asset validation rule and belongs in its
 * own change.
 */
export const assetReference = (descriptor: AssetReferenceDescriptor = {}) =>
  z
    .string()
    .min(1)
    .meta({ [ASSET_REFERENCE]: descriptor });

export const getAssetReferenceDescriptor = (
  schema: z.ZodType,
): AssetReferenceDescriptor | undefined => {
  const meta = schema.meta();
  const descriptor = meta?.[ASSET_REFERENCE];
  return descriptor as AssetReferenceDescriptor | undefined;
};
