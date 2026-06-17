import { cva } from '@codaco/fresco-ui/utils/cva';

// Used by ActionButton, QuickAddField, and NodeForm.

// The container centres a single icon with flexbox and sizes it itself, so the
// icon must never carry its own height/width utilities (those would conflict in
// the cascade and, for Lucide icons whose glyph geometry isn't symmetric within
// the 24×24 viewBox, leave the icon visibly off-centre).
//
// Lucide icons (`.lucide`, square 24×24 viewBox) are constrained to a fixed
// square. Custom icons (no `.lucide` class, non-square viewBoxes) fill the
// container height and keep their aspect ratio. Descendant (`[&_…]`) rather
// than direct-child (`[&>…]`) selectors so wrapper divs (e.g. AnimatePresence
// motion.div) don't break the rules.
export const actionCircleVariants = cva({
  base: 'elevation-high flex items-center justify-center overflow-hidden rounded-full [&_.lucide]:aspect-square [&_.lucide]:size-16 [&_svg:not(.lucide)]:h-full [&_svg:not(.lucide)]:w-auto',
});

export const actionIconClass = 'h-full w-auto';

export const actionPlusBadgeVariants = cva({
  base: 'bg-platinum text-charcoal absolute -top-2 -right-4 flex size-10 items-center justify-center rounded-full shadow-lg',
});

export const actionPlusIconClass = 'size-6';
