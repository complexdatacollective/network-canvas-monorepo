// Visual proportions of the fanned deck — tuned together. Changing one
// without re-checking the others desyncs the drag stride from the painted
// fan.
//
// Slot stride as a fraction of card width: adjacent cards sit 0.7 card
// widths apart, reproducing the original 30% overlap.
export const SLOT_TO_CARD_RATIO = 0.7;
// With perspective 1800px, translateZ(-400) projects a card to
// (1800/2200) ≈ 82% of its size — cards further from active naturally
// appear behind via real 3D depth, not z-index.
export const DECK_PERSPECTIVE_PX = 1800;
const FAN_Z_STEP = 400;
const FAN_ROTATE_DEG = 3;
const FAN_DROP_RATIO = 0.04;

export type SlidePose = {
  x: number;
  y: number;
  z: number;
  rotateZ: number;
  opacity: number;
};

// Every visual property of a slide is a pure function of its offset from
// the deck position (offset = slideIndex − position, in slide-index units).
// Opacity plateaus at 1 for slides ≤ 2 away and fades to 0 by 4, so distant
// cards keep their full fan transform and the opacity does the hiding.
export function slidePose(
  offset: number,
  cardWidth: number,
  cardHeight: number,
): SlidePose {
  const abs = Math.abs(offset);
  return {
    x: offset * SLOT_TO_CARD_RATIO * cardWidth,
    y: abs * FAN_DROP_RATIO * cardHeight,
    z: -abs * FAN_Z_STEP,
    rotateZ: offset * FAN_ROTATE_DEG,
    opacity: abs <= 2 ? 1 : abs >= 4 ? 0 : 1 - (abs - 2) / 2,
  };
}
