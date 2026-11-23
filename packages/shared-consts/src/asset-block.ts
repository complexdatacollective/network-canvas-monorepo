/**
 * The words a file shown as a block in a page's text is described in: the
 * kinds of file a block can show, the sizes and positions it can be given,
 * and what it does where it says nothing. The block's markdown form, which
 * these settings are written in, is protocol-validation's (`AssetBlock`).
 *
 * They are here rather than beside that grammar so that what draws a block
 * and has no other need of protocol-validation (fresco-ui's rich text
 * editor) holds the same list, not a copy of it.
 */

/** The kinds of file a block can show. */
export const ASSET_BLOCK_KINDS = ['image', 'audio', 'video'] as const;
export type AssetBlockKind = (typeof ASSET_BLOCK_KINDS)[number];

/** Whether `value` is a kind of file a block can show. */
export const isAssetBlockKind = (value: unknown): value is AssetBlockKind =>
  ASSET_BLOCK_KINDS.some((kind) => kind === value);

/** How tall an image or a video may be, smallest first. */
export const ASSET_BLOCK_SIZES = ['small', 'medium', 'large'] as const;
export type AssetBlockSize = (typeof ASSET_BLOCK_SIZES)[number];

/** Whether `value` is a size a block can be given. */
export const isAssetBlockSize = (value: unknown): value is AssetBlockSize =>
  ASSET_BLOCK_SIZES.some((size) => size === value);

/** Where a block sits across the page, in the direction its text runs. */
export const ASSET_BLOCK_ALIGNMENTS = ['start', 'center', 'end'] as const;
export type AssetBlockAlignment = (typeof ASSET_BLOCK_ALIGNMENTS)[number];

/** Whether `value` is a position a block can be given. */
export const isAssetBlockAlignment = (
  value: unknown,
): value is AssetBlockAlignment =>
  ASSET_BLOCK_ALIGNMENTS.some((alignment) => alignment === value);

/**
 * How a block is shown where it does not say: the settings left unwritten.
 * A block with no size has none (it takes its own height), so size has no
 * default here.
 */
export const ASSET_BLOCK_DEFAULTS = {
  align: 'center',
  autoplay: true,
  loop: true,
} as const satisfies Readonly<{
  align: AssetBlockAlignment;
  autoplay: boolean;
  loop: boolean;
}>;

/**
 * A block as an editor holds it: every setting present, the ones its text
 * leaves out at their defaults. The shape fresco-ui's rich text node
 * carries as its attributes, and the one a markdown adapter reads from and
 * writes to that node.
 */
export type AssetBlockAttributes = Readonly<{
  /** The file, by its id in the protocol's assets. */
  assetId: string;
  /** What the file shows or says, for a reader who cannot see or hear it. */
  description: string;
  /** How tall the file may be shown; `null` leaves it its own height. */
  size: AssetBlockSize | null;
  /** Where the file sits across the text. */
  align: AssetBlockAlignment;
  /** Whether audio or video starts by itself. */
  autoplay: boolean;
  /** Whether audio or video starts again when it ends. */
  loop: boolean;
}>;
