import {
  ASSET_BLOCK_DEFAULTS,
  type AssetBlockKind,
  type AssetBlockSize,
  isAssetBlockKind,
} from '@codaco/shared-consts';

import type { AssetBlock } from './assetBlock.ts';

/**
 * The entry a protocol's assets hold for `assetId`, or `undefined` when they
 * hold none. Only the manifest's own entries are read: an id such as
 * `constructor` or `__proto__` names a file only if the protocol has one by
 * that name, not whatever every object inherits under it.
 */
export const assetInManifest = <Entry>(
  assetManifest: Readonly<Record<string, Entry | undefined>> | undefined,
  assetId: string,
): Entry | undefined =>
  assetManifest !== undefined && Object.hasOwn(assetManifest, assetId)
    ? assetManifest[assetId]
    : undefined;

/**
 * The file a block names, as something a page can show: which kind of file
 * it is and its name. `undefined` when the protocol's assets hold no file by
 * that id, or hold one that is not an image, audio or video (a network or
 * an API key), since a page shows neither.
 */
export const assetBlockFile = <
  Entry extends Readonly<{ type?: string; name?: string }>,
>(
  assetManifest: Readonly<Record<string, Entry | undefined>> | undefined,
  assetId: string,
): Readonly<{ kind: AssetBlockKind; name: Entry['name'] }> | undefined => {
  const asset = assetInManifest(assetManifest, assetId);
  if (asset === undefined || !isAssetBlockKind(asset.type)) return undefined;
  return { kind: asset.type, name: asset.name };
};

/**
 * How a block is shown: each setting it writes, and `ASSET_BLOCK_DEFAULTS`
 * for each it leaves out. A block with no size has none, and takes its own
 * height.
 */
export const assetBlockSettings = (
  block: Pick<AssetBlock, 'size' | 'autoplay' | 'loop'>,
): Readonly<{
  size: AssetBlockSize | undefined;
  autoplay: boolean;
  loop: boolean;
}> => ({
  size: block.size,
  autoplay: block.autoplay ?? ASSET_BLOCK_DEFAULTS.autoplay,
  loop: block.loop ?? ASSET_BLOCK_DEFAULTS.loop,
});
