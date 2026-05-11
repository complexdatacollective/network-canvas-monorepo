# OneToManyDyadCensus: scrollable collection with unclipped layoutId animation

## Problem

The `OneToManyDyadCensus` stage shows a focal "source" node in the stage header and a list of target nodes in a `Collection`. When the user advances steps, the source node animates between the collection cell and the header via framer-motion's shared-`layoutId` animation.

Making the collection scrollable requires `overflow-auto` on the `ScrollArea` viewport. That overflow clips the moving node mid-animation, because the layout-animated DOM lives inside the scroll viewport for at least part of the transition.

A previous workaround toggled `overflow-visible` during transitions (`packages/interview/src/interfaces/OneToManyDyadCensus/OneToManyDyadCensus.tsx:224`). That hack collapses any scrollTop offset back to 0 during the transition and briefly paints overflowing items through surrounding stage UI. We need a fix that preserves scroll position and leaves the scroll viewport untouched.

## Goals

- The Collection is genuinely scrollable (`overflow-auto` on the viewport at all times).
- The "Click/tap all that apply" heading stays fixed; only the node list scrolls.
- The shared-layoutId animation between the header source node and its collection cell renders without clipping.
- Both `removeAfterConsideration` modes are supported, in both forward and backward navigation.

## Non-goals

- Restructuring the stage layout (the focal node stays as a floating header above the Surface).
- Changing the Collection or ScrollArea internals.
- Animating any nodes other than the source crossing the boundary.

## Key insight: only the *returning* source needs lifting

When step changes A → B with `removeAfterConsideration: false`:

- **B (incoming):** new motion node mounts in the header (`<div className="interface">`), which is outside any overflow context. Motion applies the layout transform to the header DOM. **Already unclipped.**
- **A (returning):** new motion node mounts inside the Collection's `ScrollArea` viewport. Motion applies the transform to a DOM node that lives inside `overflow: auto`. **This is the clipped element.**

So exactly one node per transition needs to be lifted out of the scroll viewport: the source that is *returning to the collection*. With `removeAfterConsideration: true`, the previous source does not return to the collection at all, so no lifting is needed in that mode.

## Architecture

Lift the returning source via a `position: fixed` portal into `#stage` (the stage container in `Shell.tsx` that already serves as `usePortalTarget("stage")`).

### Components

**`OneToManyDyadCensus`** (existing, modified)

- Removes the `viewportClassName` overflow toggle. The Collection's viewport keeps `overflow-auto` permanently.
- Adds state:
  - `returningSourceId: string | null` — the node ID being lifted, if any.
  - `overlayRect: { top: number; left: number; width: number; height: number } | null` — the screen rect to anchor the portal at.
- Adds a ref `placeholderRef` keyed on the returning source's placeholder cell so `useLayoutEffect` can measure it post-commit.
- `renderItem` branches: when `node[entityPrimaryKeyProperty] === returningSourceId`, returns a sized, non-motion placeholder `<div>` (ref'd) of the same width/height as the node. Otherwise, returns `ConnectedMotionNode` as today.
- `useLayoutEffect` runs after the step-change render. It reads `placeholderRef.current.getBoundingClientRect()` and calls `setOverlayRect`. This schedules a second render before paint.
- `useBeforeNext` sets `returningSourceId` synchronously (alongside `setCurrentStep` and `setIsTransitioning`) — only when `removeAfterConsideration` is false.

**`TransitionOverlay`** (new, small)

- Props: `nodeId`, `rect`, `onComplete`, plus whatever `ConnectedMotionNode` needs (`type`).
- Renders via `createPortal(..., stageElement)` from `usePortalTarget("stage")`.
- Renders a `ConnectedMotionNode` with `layoutId={nodeId}` and inline `style={{ position: "fixed", top, left, width, height }}`.
- Calls `props.onComplete()` from `onLayoutAnimationComplete`.

### State machine (forward, `removeAfterConsideration: false`)

1. **User triggers next.** `useBeforeNext` callback fires in an event handler, batching:
   - `setCurrentStep(prev + 1)`
   - `setIsTransitioning(true)`
   - `setReturningSourceId(source[entityPrimaryKeyProperty])` (the *current* source, which becomes the previous source after commit)

2. **Render 1 (post-commit, pre-paint):**
   - Header: `<AnimatePresence>` renders the new source B with `layoutId=B`. The old A motion node remains briefly under `mode="popLayout"` for the exit / layout match.
   - Collection: items render normally except the cell whose key matches `returningSourceId`, which renders a non-motion sized placeholder `<div ref={placeholderRef}>`. No `layoutId` on the placeholder.
   - Overlay portal: not yet mounted (`overlayRect` is still `null`).
   - Motion at this point sees:
     - `layoutId=A` only in the exiting header element → no layout-animation start yet, just exit semantics deferred.
     - `layoutId=B`: old DOM in collection (last render), new DOM in header → animates the header DOM. Unclipped, runs to completion.

3. **`useLayoutEffect`** runs after Render 1's DOM commit, before the browser paints:
   - Reads `placeholderRef.current.getBoundingClientRect()`.
   - Calls `setOverlayRect({ top, left, width, height })`.
   - Schedules Render 2 before paint, so Render 1 is not visible to the user.

4. **Render 2 (still pre-paint):**
   - Overlay portal mounts `ConnectedMotionNode` for the returning source at `position: fixed` with the measured rect.
   - Motion now sees `layoutId=A` in two places: header (exiting) and overlay (new). It pairs them and starts a layout animation on the overlay DOM, transforming it from the header rect → the fixed rect.
   - Both source and destination of A's animation are outside any overflow → **unclipped.**

5. **`onLayoutAnimationComplete`** on the overlay node fires:
   - Clears `returningSourceId`, `overlayRect`, `isTransitioning`.
   - Collection's cell for A returns to a normal `ConnectedMotionNode`. The hand-off is seamless because the overlay sat at the same screen position as the cell.
   - Safety fallback: keep the existing 800ms timeout (`useEffect` keyed on `isTransitioning`) in case `onLayoutAnimationComplete` doesn't fire.

### State machine: `removeAfterConsideration: true`

`useBeforeNext` skips `setReturningSourceId` (or sets it to `null`) when `removeAfterConsideration` is true. The previous source is filtered out of `filteredTargets`, has no new motion node to pair with its exit, and just plays whatever exit AnimatePresence provides. The new source B animates collection → header on header DOM as today. No portal involvement.

### Backward navigation

`useBeforeNext` with `direction === "backwards"`: the *current* source is being demoted back into the collection (its slot at `sortedSource[currentStep - 1]` will reappear or remain in `filteredTargets`). The same `returningSourceId = source[entityPrimaryKeyProperty]` assignment applies, and the rest of the machine is identical.

Edge case: with `removeAfterConsideration: true`, backward navigation also makes a previously-removed source reappear. The previous source moves from header back into the collection, which means it *also* needs lifting in this case. The rule is symmetric: set `returningSourceId` whenever the current source has an entry in the *post-step* `filteredTargets`. This can be expressed as: if the post-step filteredTargets includes the current source's ID, lift it.

### Prompt change

The Collection re-mounts on prompt change (`key={promptIndex}`), so layoutIds don't carry across. The overlay path is irrelevant; the existing `useEffect` that resets `currentStep` and `isTransitioning` is preserved (it just doesn't need to manage `returningSourceId` for the prompt-change path — clear it to `null`).

### Initial mount

On stage mount, the source is `sortedSource[0]` and there is no previous source. The header simply renders the source for the first time; no layoutId crossover, no overlay. `returningSourceId` stays `null`.

## Files touched

- `packages/interview/src/interfaces/OneToManyDyadCensus/OneToManyDyadCensus.tsx` — state, ref, render branching, drop overflow toggle.
- `packages/interview/src/interfaces/OneToManyDyadCensus/TransitionOverlay.tsx` — new file. Small portal component.

No changes to `Collection`, `ScrollArea`, `InlineGridLayout`, or `ConnectedNode`.

## Open implementation details

- **LayoutGroup wrapping the portal.** Motion's `layoutId` pairing requires both elements to be reachable in the same `LayoutGroup` scope. Default root scope should cover this (React portals stay in the same React tree even when their DOM target differs), but if motion does not pair across the portal boundary in practice, wrap the stage region in `<LayoutGroup>` so the overlay is reached.
- **Placeholder sizing.** The placeholder must match the cell's measured width/height so `InlineGridLayout` doesn't reflow when the cell flips between motion node and placeholder. Approach: capture the cell's rect into a small ref-keyed map *before* the step change fires (during the last render where the node was a normal cell), so the placeholder can render with explicit `width`/`height` from that snapshot on Render 1. The placeholder ref is also used in step (3) to measure the *current* rect (which equals the snapshotted rect, since nothing has moved).
- **`AnimatePresence` mode.** Existing `mode="popLayout"` is preserved. The exiting header element keeps its layoutId until the layout animation against the overlay node resolves.
- **Cleanup ordering.** When `onLayoutAnimationComplete` fires, we clear `returningSourceId` first so the collection cell re-renders as a real motion node at the same screen position as the overlay, *then* unmount the overlay. The two should commit in the same render to avoid a 1-frame gap. If gap appears in practice, swap the order: keep the overlay mounted for one extra frame after re-enabling the motion node in the collection.

## Verification plan

Manual verification only (no unit tests planned — this is a visual animation behavior).

1. Run interview locally on a protocol that includes a `OneToManyDyadCensus` stage with at least 6 nodes (enough to force scrolling).
2. With `removeAfterConsideration: false`:
   - Step forward. Confirm the previous source flies smoothly into its collection cell, with no clipping at the ScrollArea boundary.
   - Step backward. Confirm symmetric behavior.
   - Scroll the collection to a non-zero position, then step forward. Confirm scroll position is preserved (no jump back to 0) and the animation still completes correctly.
3. With `removeAfterConsideration: true`:
   - Step forward. Confirm the new source flies from its collection cell to the header smoothly. Confirm the previous source's exit looks reasonable (no half-animation into a clipped location).
   - Step backward. Confirm the symmetric case (a previously-removed source reappearing) also animates without clipping.
4. Confirm scrolling works in steady state (between transitions) at all times.
