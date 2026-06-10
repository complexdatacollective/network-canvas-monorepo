import { cva } from '@codaco/fresco-ui/utils/cva';

export const CARD_RADIUS_PX = 28;

export const cardBase = cva({
  base: [
    'focus-visible:ring-sea-green focus-visible:ring-4 focus-visible:outline-none',
  ],
});

// backdrop-blur is intentionally NOT here — backdrop-filter doesn't propagate
// through ancestor stacking contexts created by transform/perspective, and the
// Swiper carousel applies both. ProtocolDeck puts the blur on the slide's
// direct child wrapper instead (the wrapper is itself transformed, but
// backdrop-filter on a transformed element reads from outside it, which works).
export const importCardClass = cva({
  base: [
    'border-outline bg-surface/50 text-text/80 flex flex-col items-center justify-center gap-3 border-[3px] border-dashed',
  ],
});
