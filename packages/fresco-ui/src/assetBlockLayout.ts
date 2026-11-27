import type {
  AssetBlockAlignment,
  AssetBlockSize,
} from '@codaco/protocol-validation';

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
 * An image or video. Each size is a band the height is held to; without one
 * the file is as tall as it is at the page's full width.
 *
 * Held to a height, it is drawn inside a box as wide as the page, so where it
 * sits across the page is where it sits in that box. At the page's full width
 * there is nowhere else for it to sit, so `align` places it only once `size`
 * is given.
 *
 * Apply it to the media element itself; an element that has to measure the
 * height a size holds a file to can read it back as its computed
 * `max-height`.
 */
export const assetBlockMediaVariants = cva({
  variants: {
    size: {
      small: 'max-h-48',
      medium: 'max-h-96',
      large: 'max-h-[60vh]',
    } satisfies Record<AssetBlockSize, string>,
    // Placed only with a size: see the compound variants.
    align: {
      start: '',
      center: '',
      end: '',
    } satisfies Record<AssetBlockAlignment, string>,
  },
  compoundVariants: [
    {
      size: ['small', 'medium', 'large'],
      align: 'start',
      className: 'object-left rtl:object-right',
    },
    {
      size: ['small', 'medium', 'large'],
      align: 'end',
      className: 'object-right rtl:object-left',
    },
  ],
});

/**
 * The line an audio player sits in. A player is as wide as the browser draws
 * it, so it always has room around it to sit at the start, the middle or the
 * end of its line.
 */
export const assetBlockAudioRowVariants = cva({
  base: 'flex',
  variants: {
    align: {
      start: 'justify-start',
      center: 'justify-center',
      end: 'justify-end',
    } satisfies Record<AssetBlockAlignment, string>,
  },
});
