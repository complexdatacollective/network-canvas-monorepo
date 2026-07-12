# NetworkCanvas.com Page-Wide Background Blobs Design

## Goal

Replace the hero-scoped `BackgroundLights` decoration with a subtle
`BackgroundBlobs` layer that remains visible behind the entire homepage while
the visitor scrolls. The background must add depth without competing with text,
media, or calls to action.

## Composition

The homepage root will own one fixed, viewport-sized decorative layer. The
layer will sit behind every homepage section, while all existing content will
remain in a single foreground stacking context. It will be pointer-inert and
hidden from assistive technology.

`HeroIntro` will continue to own the entrance sequence, but it will no longer
render a background component. The homepage will otherwise retain its existing
section order, copy, and the separate `multi-2.svg` decoration around the
Design Principles section.

## Appearance

The background will use `@codaco/art`'s existing `BackgroundBlobs` component
with existing Network Canvas theme colors. The containing layer will use about
10% opacity, keeping the blobs visible but highly transparent. The layer will
fill the viewport and remain fixed during scrolling so the long homepage has
consistent coverage without repeating the component per section.

## Accessibility and Motion

The layer will use `aria-hidden`, disable pointer events, and remain behind all
interactive content. Existing reduced-motion handling in `@codaco/art` will be
preserved; the page will not introduce a separate animation loop or motion
preference implementation.

## Testing and Verification

Component tests will verify that the page-wide composition renders
`BackgroundBlobs` once with the approved palette and that `HeroIntro` no longer
owns the background. Existing entrance, hydration, media, and reduced-motion
tests will remain intact.

Verification will include the website test suite, typecheck, formatting, lint,
`knip`, production build, and desktop/mobile browser checks for scroll coverage,
text contrast, pointer behavior, and reduced motion.
