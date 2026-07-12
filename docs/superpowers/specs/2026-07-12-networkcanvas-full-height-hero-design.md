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
it across four rows:

1. a first row capped at 20% of the viewport height that vertically centers the
   headline;
2. a two-column media row containing the 4:3 video and marketing copy; and
3. a full-width compact news ticker; and
4. a centered download call to action.

Tablet and desktop rows will use 2.5rem gaps so the media, ticker, and call to
action read as distinct elements. The complete grid will be centered within the
hero's available height so unused space is not assigned solely to the headline.

The media row will switch to two columns at the tablet-portrait breakpoint. This
is important at intermediate desktop widths, where the current stacked 4:3 video
is taller than the available above-the-fold area. The media frame will also cap
its width at 48% of viewport height on larger, shorter screens, preserving its
4:3 ratio while leaving room for the ticker and call to action on separate lines.

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

Component tests will verify the viewport-height shell, the vertically centered
headline, the tablet two-column media row, the separate ticker and call-to-action
rows, and the ticker's new responsive breakpoint. Existing hydration and motion
tests will remain intact.

Verification will include the website test suite, typecheck, formatting, lint,
`knip`, production build, and browser measurements at mobile, intermediate
tablet/desktop, and wide desktop sizes. The intermediate review viewport should
fit the complete hero within one viewport without clipping.
