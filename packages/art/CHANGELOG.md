# @codaco/art

## 0.1.6

### Patch Changes

- c34db26: Node labels are easier to read. The node colors are adjusted, most of them darker, so their white labels stand out: all eight node colors now meet the WCAG AA contrast ratio of 4.5:1 for text, and the lighter half of each node stands out at 3:1 against the interview background. Nodes keep their two-tone diagonal.

  The node colors in the default and interview themes (`--node-1` to `--node-8`) are now derived from the brand colors rather than equal to them. The brand color Neon Coral is slightly lighter and less saturated, and Mustard, Neon Carrot, Sea Serpent, Kiwi and Paradise Pink shift in hue, so edge, ordinal and categorical colors, the destructive and warning colors, the loading spinner, Background Creator's color swatches, and generated background patterns built from them change color slightly too.

  In Architect, a read-only shape picker now tells assistive technology that its shapes are unavailable, matching the read-only type picker.

## 0.1.5

### Patch Changes

- aa4693a: Reopening the everything bar now re-checks its recent items before showing them, instead of briefly painting the rows the previous opening ended with. A recent entry that has since been renamed, or that the researcher no longer has access to, can no longer appear.

  A node whose label may no longer be revealed, and a rich text editor's link popover when the field becomes disabled, now update in the same step as the change rather than one frame after it.

## 0.1.4

### Patch Changes

- 1fb4daa: Keep PageBackground behind normal page content so translucent surfaces, images, and portalled overlays render in the correct layer.
- 3abfaf7: Keep unresolved weave backgrounds hidden when their focal point lies on a zero-valued axis.

## 0.1.3

### Patch Changes

- f586759: Keep the page background visible after its initial reveal instead of restarting the fade during scrolling.
- 1635d65: Add configurable weave parameters and scroll-linked background motion support.

## 0.1.2

### Patch Changes

- 8555eb4: Fixed the animated background (`BackgroundLights` and `BackgroundBlobs`) vanishing after a tab was left in the background for a while. The animation clock kept advancing while `requestAnimationFrame` was paused, so the first frame after returning teleported every blob far off-screen in a single step. Frame deltas are now capped so motion stays continuous across background/foreground cycles.

## 0.1.1

### Patch Changes

- 1a6d441: `Pattern` now renders a plain platinum-dark surface when `seed` is an empty
  string, instead of generating a pattern from an empty input. The `className`
  and `style` props are also forwarded to the underlying pattern component.
