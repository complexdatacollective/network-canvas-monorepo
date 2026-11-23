import type { RichTextAssetBlockAttributes } from '../form/fields/richText/assetBlockNode';

/**
 * A block's attributes as a block with nothing set holds them, with
 * `changes` over them. Written out rather than read from the editor, so a
 * test that expects them sees a changed default.
 */
export const assetBlockAttributes = (
  changes: Partial<RichTextAssetBlockAttributes> = {},
): RichTextAssetBlockAttributes => ({
  assetId: 'a1',
  description: '',
  size: null,
  align: 'center',
  autoplay: true,
  loop: true,
  ...changes,
});
