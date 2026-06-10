# ProtocolDeck motion-native rewrite

**Date:** 2026-06-10
**Scope:** `apps/interviewer-v7/src/components/ProtocolCarousel/`

## Problem

`ProtocolDeck.tsx` is ~860 lines coordinating two animation systems that fight
each other. Swiper owns slide transforms and travel; motion owns enter/exit and
in-card layout animation. Everything the component is hated for exists to
bridge that boundary:

- `handleActivate(idx)` double-duty dispatch — "activate" means _slide to the
  card_ when it isn't active, or _run the kind-specific action_ when it is.
  Index-based, re-derives the slot, switches on kind, and every card receives
  an `onActivate: () => handleActivate(i)` closure.
- A ~90-line IIFE inside the render map building `DeckCardProps` per entry
  kind.
- A ~150-line exit choreography state machine: `exiting` map maintained via
  setState-during-render, `suppressActiveSyncRef`, `indexFixRef`,
  `renderDeckRef`, `committedKeysRef`, `handleScaleOutComplete` with manual
  neighbour search, `swiper.once('transitionEnd')` plus a `setTimeout`
  fallback — all because the Swiper React wrapper calls `swiper.update()` on
  any children change, which snaps the translate mid-animation.
- A window-level Enter handler with DOM tag-sniffing.
- `swiper.disable()` as a workaround for the wrapper not re-applying
  `mousewheel`/`keyboard`/`allowTouchMove` prop changes.
- A high-codepoint sentinel slot key (`'￿__import__'`) and a numeric priority
  ladder for slot merging.

## Decision

Remove Swiper entirely (it is used nowhere else in the app) and rebuild the
carousel natively in motion, so one animation system owns every transform.
Approved over (B) restructuring around Swiper — which keeps the boundary and
therefore the state machines — and (C) a CSS scroll-snap deck, which trades
the Swiper↔motion boundary for a scroller↔motion boundary (clipping, overlap
stride, and animated removal all fight a live scroll container).

### Requirements confirmed

- **Inputs (all must-haves):** touch/mouse drag with velocity-aware snap,
  mouse-wheel / trackpad step, keyboard arrows + Enter. Tablets (iPad /
  Android via Capacitor) are first-class, so drag feel matters most.
- **The in-place card morph is sacred.** When a slot's content changes kind
  (sample → installing → protocol) the same `DeckCard` instance must survive
  so its internals cross-fade/re-layout via `LayoutGroup`. The rendering model
  therefore keeps exactly one stable component type per slot.
- **Removal choreography is deliberately simplified** (the one behavioral
  divergence): today the deck travels away from an emptied slot before
  dropping it; the new model uses the conventional "exit in place, neighbours
  close the gap" pattern.

## Design

### File structure

```
ProtocolCarousel/
  ProtocolDeck.tsx       # orchestrator: builds entries, owns active index,
                         # renders carousel + nav row (~150 lines)
  deckEntries.ts         # pure module: DeckEntry type, slot keys, priority
                         # merge, sort (unit-tested)
  DeckCarousel.tsx       # motion-native carousel: gestures, slide poses,
                         # AnimatePresence
  DeckSlotCard.tsx       # entry kind → DeckCard props (the old IIFE, named)
  DeckCard.tsx           # unchanged
  ImportTriggerCard.tsx  # unchanged
  cardStyles.ts          # stale Swiper comment updated
```

`swiper` is removed from `apps/interviewer-v7/package.json` along with the
`swiper/css` imports. `ProtocolDeck`'s public props contract is unchanged;
`Home.tsx` is untouched.

### Coordinate system

One deck-level motion value `position` (a float in slide-index space), plus
one spring motion value per slide tracking that slide's own index. Every
visual property of a slide is a pure function of
`offset = slideIndex − position`:

| property | function of offset                          |
| -------- | ------------------------------------------- |
| x        | `offset × stride` (stride = 0.7 card width) |
| y        | `abs(offset) × 4%`                          |
| z        | `−abs(offset) × 400px` (perspective 1800px) |
| rotateZ  | `offset × 3°`                               |
| opacity  | plateau 1 at `abs(offset) ≤ 2`, 0 at `≥ 4`  |

This is the same math currently split across `creativeEffectConfig`,
`applyOpacityCurve`, and the SLOT/FAN constants, unified into one pure
`slidePose(offset)` function. Because each slide's index is itself a spring,
index shifts after a removal animate smoothly — no `indexFixRef`, no
suppress flag, no rebind-before-paint.

### Gestures

- **Drag:** motion pan gesture on the deck; `position` follows the pointer in
  index units; release snaps to the nearest index with a velocity-aware
  spring (standard motion carousel pattern).
- **Wheel:** accumulate delta past a threshold (same 30-delta as today) →
  step ±1.
- **Keyboard:** arrows step; Enter activates the active card. Same
  window-level listener semantics as today (works without focus), extracted
  into a hook with the same editable-target guard.
- **New-session lock:** one `disabled` boolean checked by all three handlers,
  replacing `swiper.disable()`, the conditional `mousewheel` props, and
  `allowTouchMove`.

### Enter/exit

`AnimatePresence` keyed by slot key. New slot → drop-in pose (first commit
mounts settled; the section-level cascade animates the deck as a whole).
Removed slot → exits in place (scale/fade) while neighbours' index springs
close the gap; the position spring re-targets if the active card was removed.
Deleted outright: the `exiting` map, the setState-during-render block,
`handleScaleOutComplete`, the `transitionEnd` + timeout fallback,
`renderDeckRef`, and `committedKeysRef`.

### Entries and activation

- `deckEntries.ts` keeps name-based slot keys (they are what makes the
  sample → installing → protocol morph land in one slot) and the
  pending > sample > protocol priority merge. The import card leaves the
  merge entirely — it is appended after sorting, killing the `'￿__import__'`
  sentinel and its priority rung.
- Each entry carries its primary action as data (start interview / install
  sample / open import dialog / none for pending), built once in
  `ProtocolDeck` from props.
- The slide wrapper owns one tap handler: tapping a non-active card animates
  to it; tapping the active card runs its primary action. `onActivate`
  index-closures and the `handleActivate(i)` re-dispatch are gone.
- `DeckSlotCard` renders one stable element per slot, deriving `DeckCard`
  props from the entry kind, preserving the morph.

### Accessibility

Swiper's A11y module is replaced with explicit markup: the section keeps
`aria-label="Protocol deck"`; far-away slides get `aria-hidden` + `inert`
matching their opacity-0 state (today they are invisible but still
focusable); dots/chevrons unchanged.

### Sizing

The ResizeObserver + section-padding math is kept as-is (optionally extracted
to a hook); cards remain square, sized from measured section height.

## Error handling

No new failure modes: the carousel is pure UI over props. Degenerate inputs
(empty protocol list → import card only; removal of the last protocol;
`initialProtocolHash` pointing at a deleted protocol) must behave as today —
the initial-scroll-once and clamp-active-index behaviors are preserved in the
new model.

## Testing

- **Unit:** `deckEntries` merge/sort/priority; `slidePose(offset)` math.
- **Storybook interaction tests** in the existing `ProtocolDeck.stories.tsx`:
  drag-snap, wheel step, keyboard navigation, slot add/remove choreography,
  new-session lock.
- **Manual:** drag feel on iPad and Android before merge — the one risk this
  design accepts by owning the gesture is that snap/momentum tuning needs
  human judgment on real hardware.
