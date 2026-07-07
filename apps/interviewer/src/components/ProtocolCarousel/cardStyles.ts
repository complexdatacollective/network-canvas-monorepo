import { cva } from '@codaco/fresco-ui/utils/cva';

export const CARD_RADIUS_PX = 28;

export const cardBase = cva({
  base: [
    'focus-visible:ring-sea-green focus-visible:ring-4 focus-visible:outline-none',
  ],
});
