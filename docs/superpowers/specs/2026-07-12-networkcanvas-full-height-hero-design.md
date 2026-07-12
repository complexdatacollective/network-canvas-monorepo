# NetworkCanvas.com Full-Height Hero Design

## Goal

Refactor the homepage's above-the-fold area so the navbar, headline, hero
video and marketing copy, news ticker, and download call to action form one
cohesive viewport-height composition on tablet and desktop screens.

## Layout

`HeroIntro` will establish the tablet-and-desktop viewport-height shell. Its
existing motion root will become a vertical flex layout so the navbar keeps its
natural height and `Hero` fills the remaining space.

`Hero` will retain the existing content and entrance sequence while distributing
it across three rows:

1. the centered headline;
2. a two-column media row containing the 4:3 video and marketing copy; and
3. a bottom rail containing the compact news ticker and download call to action.

The media row will switch to two columns at the tablet-portrait breakpoint. This
is important at intermediate desktop widths, where the current stacked 4:3 video
is taller than the available above-the-fold area. The bottom rail will use a
flexible ticker column and a content-sized call-to-action column.

## Responsive Behavior

On tablet and desktop, the hero shell will use `min-height: 100svh`. The layout
will normally occupy one viewport, but it may grow on unusually short viewports
to prevent content clipping. Mobile will retain natural document flow and stack
the headline, media, copy, ticker, and call to action vertically.

`NewsTicker` will use its compact single-line marquee from the tablet-portrait
breakpoint upward. Its stacked card remains the mobile presentation.

## Motion and Accessibility

The existing coordinated entrance order remains unchanged: navbar, headline,
media and copy, news ticker, then call to action. No new animation will be added,
and the existing reduced-motion behavior will continue to skip transforms and
delays.

The implementation will use minimum height rather than a fixed viewport height
so zoomed text, translated copy, and short screens cannot be clipped. Existing
links, focus behavior, semantic headings, video accessibility, and copy remain
unchanged.

## Testing and Verification

Component tests will verify the viewport-height shell, the flexible hero layout,
the tablet two-column media row, the combined bottom rail, and the ticker's new
responsive breakpoint. Existing hydration and motion tests will remain intact.

Verification will include the website test suite, typecheck, formatting, lint,
`knip`, production build, and browser measurements at mobile, intermediate
tablet/desktop, and wide desktop sizes. The intermediate review viewport should
fit the complete hero within one viewport without clipping.
