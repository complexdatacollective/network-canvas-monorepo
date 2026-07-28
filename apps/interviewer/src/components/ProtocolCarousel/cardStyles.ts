import { cva } from '@codaco/fresco-ui/utils/cva';

export const CARD_RADIUS_PX = 28;

export const cardBase = cva({
  base: [
    'focus-visible:ring-sea-green focus-visible:ring-4 focus-visible:outline-none',
  ],
});

// Step headings down as labels get longer so they remain readable without
// crowding lower-priority card content. Pixel floors keep small cards legible.
export function cardHeadingSizeClass(label: string): string {
  if (label.length <= 24) return 'text-[max(20px,8cqi)]';
  if (label.length <= 48) return 'text-[max(18px,6.5cqi)]';
  return 'text-[max(16px,5cqi)]';
}
