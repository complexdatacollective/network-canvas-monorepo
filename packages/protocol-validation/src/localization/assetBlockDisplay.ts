import {
  ASSET_BLOCK_DEFAULTS,
  type AssetBlockAlignment,
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
 * Whether where a block sits across the page can be seen. An image or video
 * with no size is as wide as the page, which leaves it nowhere else to sit,
 * so its position shows only once it is held to a height. An audio player
 * always has room around it. `size` is the block's (absent) or an editor's
 * (`null`) way of saying it has none.
 */
export const assetBlockAlignmentShows = (
  kind: AssetBlockKind,
  size: AssetBlockSize | null | undefined,
): boolean => kind === 'audio' || (size !== undefined && size !== null);

/**
 * How a block is shown: each setting it writes, and `ASSET_BLOCK_DEFAULTS`
 * for each it leaves out. A block with no size has none, and takes its own
 * height.
 */
export const assetBlockSettings = (
  block: Pick<AssetBlock, 'size' | 'align' | 'autoplay' | 'loop'>,
): Readonly<{
  size: AssetBlockSize | undefined;
  align: AssetBlockAlignment;
  autoplay: boolean;
  loop: boolean;
}> => ({
  size: block.size,
  align: block.align ?? ASSET_BLOCK_DEFAULTS.align,
  autoplay: block.autoplay ?? ASSET_BLOCK_DEFAULTS.autoplay,
  loop: block.loop ?? ASSET_BLOCK_DEFAULTS.loop,
});
