// ScrollTimeline isn't in TypeScript's lib.dom yet. Declared narrowly here so
// both ProtocolDeck (perspective-origin tracking) and DeckCard (per-card fan
// keyframes) can resolve the constructor without reaching for `any`.
type ScrollTimelineCtor = new (options: {
  source: Element;
  axis?: 'block' | 'inline' | 'x' | 'y';
}) => AnimationTimeline;

export const getScrollTimelineCtor = (): ScrollTimelineCtor | undefined => {
  if (typeof globalThis === 'undefined') return undefined;
  return (globalThis as unknown as { ScrollTimeline?: ScrollTimelineCtor })
    .ScrollTimeline;
};
