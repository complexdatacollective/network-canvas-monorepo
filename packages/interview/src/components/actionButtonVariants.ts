import { cva } from '@codaco/fresco-ui/utils/cva';

// Used by ActionButton, QuickAddField, and NodeForm.

// The container centres a single icon with flexbox and sizes it itself.
//
// Lucide SVGs carry intrinsic `width="24" height="24"` attributes. The previous
// `[&_.lucide]:h-16 [&_.lucide]:w-auto` set a definite height but left width to
// `w-auto`, relying on the browser to back-derive it from `aspect-ratio` plus
// those intrinsic attributes — a resolution that is inconsistent across engines
// and can leave the box near its 24px intrinsic width while 64px tall. That
// non-square box is what pushed icons off-centre. A definite `size-16` square
// removes the ambiguity, so any Lucide icon centres reliably. Custom icons (no
// `.lucide` class, non-square viewBoxes) fill the container height and keep
// their aspect ratio. Descendant (`[&_…]`) rather than direct-child (`[&>…]`)
// selectors so wrapper divs (e.g. AnimatePresence motion.div) don't break them.
export const actionCircleVariants = cva({
  base: 'elevation-high flex items-center justify-center overflow-hidden rounded-full [&_.lucide]:aspect-square [&_.lucide]:size-16 [&_svg:not(.lucide)]:h-full [&_svg:not(.lucide)]:w-auto',
});

export const actionIconClass = 'h-full w-auto';

export const actionPlusBadgeVariants = cva({
  base: 'bg-platinum text-charcoal absolute -top-2 -right-4 flex size-10 items-center justify-center rounded-full shadow-lg',
});

export const actionPlusIconClass = 'size-6';
