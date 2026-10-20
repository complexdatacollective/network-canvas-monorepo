// Pill button looks from the mockup, shared by buttons and links.

const base =
  'inline-flex cursor-pointer items-center justify-center gap-2.5 rounded-full no-underline transition-[filter,background-color] hover:brightness-107 disabled:cursor-not-allowed disabled:hover:brightness-100 motion-reduce:transition-none';

// The sea-green call to action ("Generate protocol", "Open in Architect").
export const ctaButton = `${base} min-h-14 bg-sea-green px-7 font-display text-lg font-black text-on-light shadow-cta hover:text-on-light disabled:bg-paper-line disabled:text-ink-muted disabled:shadow-none`;

// Outlined pill on the dark page.
export const ghostButton = `${base} min-h-11 border-[1.5px] border-night-outline bg-transparent px-[18px] text-[0.9375rem] font-semibold text-white hover:bg-night-raised hover:text-white`;

// White pill on a paper card.
export const paperButton = `${base} min-h-12 border-[1.5px] border-paper-line bg-white px-[18px] text-[0.9375rem] font-bold text-ink hover:bg-paper-sunk`;
