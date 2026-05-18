# Protocol deck touch gestures

## Background

`apps/interviewer-v7/src/components/ProtocolDeck.tsx` renders the Home screen's
fanned protocol deck. Navigation today: mouse click on a card, ←/→/Enter keys,
chevron buttons, dot nav. There is no touch-specific affordance. On Capacitor
(iPad/Android) and on touch laptops, users expect to swipe the deck.

## Goals

Add touch gestures that feel native to the deck's existing motion language,
without altering keyboard/mouse behaviour.

Gestures in scope:

1. **Horizontal drag on the active card** with finger-follow, commit on
   release past a threshold, otherwise spring back.
2. **Tap on a peeking side card** to activate it (already works via `onClick`;
   ensure tap/drag disambiguation is correct).

Vertical swipes, pinch, and long-press are explicitly out of scope.

## Design

### Interaction

The active card gets motion's `drag="x"` with elastic resistance. On
`onDragEnd`, commit if either:

- `|info.offset.x|` exceeds **30%** of the rendered card width, OR
- `|info.velocity.x|` exceeds **500 px/s**.

Direction comes from the sign. If the commit target is out of bounds (at first
or last card), do nothing — motion's elastic snap-back is the boundary
feedback.

If no commit, the card springs back to its `rest` variant automatically —
motion handles this because the variant target hasn't changed.

Tap on a side card continues to call the existing `handleActivate(i)`. Motion
distinguishes tap from drag internally, so adding `drag` to the active card
does not break tapping on it either (a tap with no movement still fires
`onClick`).

### Page scroll

The deck section gets `touch-action: pan-y` so vertical page scroll passes
through and horizontal scroll is owned by the deck.

### Component changes

All changes in `apps/interviewer-v7/src/components/ProtocolDeck.tsx`:

- `DeckCard` gains three props:
  - `canPrev: boolean`
  - `canNext: boolean`
  - `onSwipeCommit: (direction: -1 | 1) => void`
- Active card (`isActive`) sets `drag="x"`, `dragElastic` (default), and
  `onDragEnd`. Non-active cards do not set `drag`.
- `onDragEnd` reads `info.offset.x` and `info.velocity.x`, reads the card's
  rendered width via a ref + `getBoundingClientRect()`, and calls
  `onSwipeCommit(-1)` for a right-swipe (previous) or `onSwipeCommit(1)` for a
  left-swipe (next), gated on `canPrev` / `canNext`.
- `ProtocolDeck` passes `i > 0`, `i < deck.length - 1`, and a callback that
  calls `setActiveIdx((idx) => idx + direction)` clamped to bounds.

### Thresholds

Both thresholds are local constants beside the existing fan tuning:

```ts
const SWIPE_COMMIT_DISTANCE_RATIO = 0.3; // 30% of card width
const SWIPE_COMMIT_VELOCITY = 500; // px/s
```

### What stays untouched

- Variants (`rest` / `peek`), hover/focus animations, dot nav, chevron
  buttons, keyboard handling. Drag does not interact with `whileHover` —
  they are independent gestures.

## Verification

- iPad Safari (Capacitor target) and Android Chrome (Capacitor target):
  - Swipe past threshold → commits in direction.
  - Short swipe → springs back.
  - Tap on side card → activates (no drag fired).
  - Drag into boundary at first/last card → elastic resistance, no commit.
  - Vertical page scroll over the deck → still works.
- Desktop mouse drag (motion's `drag` is gesture-agnostic) → same behaviour.
  Click still activates.

No automated test. The existing component has none, and motion's drag is
awkward to unit-test without a real input event stream. Flag this rather than
scaffold a harness.

## Out of scope

- Vertical / diagonal gestures.
- Pinch, rotate, long-press.
- Gesture handling on the dot nav or chevron buttons (they remain regular
  buttons).
- New dependencies.
