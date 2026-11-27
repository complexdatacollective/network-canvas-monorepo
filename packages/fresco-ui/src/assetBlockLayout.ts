import type { AssetBlockSize } from '@codaco/protocol-validation';

import { cva } from './utils/cva';

/**
 * How a block of a page draws its file: the one place the interview, which
 * shows the page, and an editor, which shows the page as it will be shown,
 * both read it from, so the two cannot come to draw a block differently.
 *
 * Here rather than in either of them because this is the package both depend
 * on, and every app's Tailwind scan already reads its source.
 */

/**
 * The space a block of a page keeps from what is above and below it: none at
 * the start or the end of its container.
 */
export const assetBlockSpacingVariants = cva({
  base: 'not-first:mt-4 not-last:mb-4',
});

/**
 * The custom property that the height of a picture being resized is given in
 * (see `assetBlockMediaVariants`' `dragged`): set on an element that contains
 * the picture, in pixels.
 */
export const ASSET_BLOCK_DRAGGED_HEIGHT = '--asset-block-dragged-height';

/**
 * An image or video. Each size is a band the height is held to; without one
 * the file is as tall as it is at the page's full width.
 *
 * Held to a height, it is drawn in the middle of a box as wide as the page:
 * every block is centred on its line, since markdown has no way to place an
 * image anywhere else.
 *
 * `dragged` is for an editor, while the researcher drags a picture's resize
 * handle: the picture is held to the height in `ASSET_BLOCK_DRAGGED_HEIGHT`
 * in place of its size, so that it grows and shrinks with the pointer. The
 * interview never draws a picture that way.
 *
 * Apply it to the media element itself, in the interview and in an editor
 * alike, so that both draw a picture at each size to the same width. An
 * element that has to measure the
 * height a size holds a file to can read it back as its computed
 * `max-height`.
 */
export const assetBlockMediaVariants = cva({
  // As wide as the page, the picture drawn whole and centred inside it.
  base: 'w-full object-contain',
  variants: {
    size: {
      small: 'max-h-48',
      medium: 'max-h-96',
      large: 'max-h-[60vh]',
    } satisfies Record<AssetBlockSize, string>,
    dragged: {
      true: 'max-h-(--asset-block-dragged-height)',
      false: '',
    },
  },
});

/**
 * The line an audio player sits in. A player is as wide as the browser draws
 * it, and is centred on its line, as every block is.
 */
export const assetBlockAudioRowVariants = cva({
  base: 'flex justify-center',
});
