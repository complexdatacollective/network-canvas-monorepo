# NarrativePedigree zoom controls — design

**Date:** 2026-07-08
**Status:** Approved (pending spec review)
**Scope:** `@codaco/interview` → `NarrativePedigree` interface only

## Goal

Add zoom in / zoom out / reset controls to the read-only NarrativePedigree
interface, exposed as buttons in a floating `SegmentedToolbar` pinned to the
bottom-right of the pedigree view.

## Background

`NarrativePedigree` (`packages/interview/src/interfaces/NarrativePedigree/`) is a
read-only interface that renders pedigree data from a referenced FamilyPedigree
stage. It renders absolutely-positioned node `<div>`s plus an SVG edge layer
inside an `overflow-auto` scroll container (`NarrativePedigreeView.tsx`, ~712
lines). There is currently no zoom/scale — only native scrolling.

`SegmentedToolbar` already exists
(`packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.tsx`; Base UI toolbar +
motion drag handle, button/toggle/group segments). `ZoomIn`, `ZoomOut`, and
`LocateFixed` icons are available from `lucide-react`. Geospatial provides an
existing floating-toolbar precedent.

## Mechanism

Zoom is a `transform: scale(z)` applied to the pedigree content, inside the
existing `overflow-auto` scroll viewport. CSS transforms do not change the layout
box size, so scrollbars won't react to scale on their own. The view is therefore
structured as three nested layers:

```
overflow-auto viewport        (existing scroll container)
 └ sizer div                  width/height = naturalW·z × naturalH·z
    └ scaled content          transform: scale(z); transform-origin: top left
       └ pedigree layout      natural size
```

- The **sizer** reserves the scaled footprint so the viewport produces correct
  scrollbars at any zoom.
- The **scaled content** applies the transform with `transform-origin: top left`
  so the sizer and the visual content stay aligned.
- `naturalW/H` are read from a ref via `ResizeObserver` on the content.
  `offsetWidth`/`offsetHeight` are unaffected by CSS transforms, so measurement is
  independent of the current scale and tracks prompt/layout changes without the
  layout needing to expose its dimensions.

## Controls

A floating `SegmentedToolbar` pinned to the bottom-right of the pedigree view,
with three button segments:

- `ZoomOut` (−)
- `ZoomIn` (+)
- separator
- `LocateFixed` (reset)

Behaviour:

- **Bounds:** 0.5× – 2.0×.
- **Step:** multiplicative, ~×1.25 per click, clamped to bounds.
- **Disabled states:** − disables at 0.5×; + disables at 2.0×.
- **Reset:** returns to 1.0× and recenters scroll to the initial top-centre
  position (matching the default `items-start` / `justify-center-safe` layout).

### Zoom-to-centre

On each +/−, scroll is adjusted so the viewport's centre point stays fixed:

```
newScroll = (scroll + viewport/2) · (newZ / oldZ) − viewport/2
```

applied independently to the horizontal and vertical axes and clamped to the
scrollable range. This keeps zooming from throwing the participant off-target.

### No-overlap padding

The toolbar floats over the viewport (fixed screen position), not the scrolled
content. The scrolled content therefore gets extra bottom + right padding equal to
the toolbar footprint + margin, so any node can always be scrolled clear of the
toolbar.

## Structure / isolation

`NarrativePedigreeView.tsx` is already ~712 lines. Extract a small, self-contained
`ZoomableViewport` component under `NarrativePedigree/components/` that owns:

- the `overflow-auto` scroll container,
- the three nested layers (sizer / scaled content),
- content measurement (`ResizeObserver`),
- scroll-anchoring on zoom and reset,
- the floating `SegmentedToolbar` with the three buttons.

`NarrativePedigreeView` wraps the pedigree content in `ZoomableViewport`. Zoom
state is view-local and ephemeral — it resets on stage entry and is **not**
persisted. No schema, codebook, protocol, or migration change.

The zoom step / clamp / reset / scroll-anchor arithmetic is factored into a pure
helper module so it can be unit-tested without the DOM.

## Accessibility / motion

- Buttons carry `aria-label`s ("Zoom in", "Zoom out", "Reset zoom") and disabled
  states at bounds.
- `SegmentedToolbar` provides roving focus and toolbar semantics.
- Any scale transition is gated on `prefers-reduced-motion` — it snaps instantly
  when reduced motion is requested.

## Out of scope (YAGNI)

- Wheel / pinch / keyboard zoom (buttons only).
- Changing the **initial** view to fit-on-load (initial render stays 1.0× with
  native scroll; reset returns to 1.0×, not fit-to-view).
- Wiring zoom into the editable FamilyPedigree interface (NarrativePedigree only).

## Testing

- Unit-test the pure zoom helper: step up/down, clamp at both bounds, reset to
  1.0×, and the scroll-anchor arithmetic.
- Update `NarrativePedigreeView.stories.tsx` so the toolbar is visible, and add an
  interactive test: click + and assert scale increases; click reset and assert it
  returns to 1.0×.

## Release

Add a changeset for `@codaco/interview` at PR time (feature in a published
library).
