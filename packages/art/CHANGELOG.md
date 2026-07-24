# @codaco/art

## 0.1.4

### Patch Changes

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
