# New-interview card-morph design

Date: 2026-05-19
Scope: `apps/interviewer-v7`

## Problem

When a user clicks "Start new interview" on the active protocol card on the Home screen, a standard `NewSessionDialog` (fresco-ui `Dialog`) fades in over the deck. The card and the dialog read as unrelated surfaces; the connection between "this protocol" and "the form that creates a session for it" is implicit.

## Goal

Treat the protocol card and the new-session dialog as the same surface. When the user activates the card, it visually morphs into a dialog: same Pattern banner, same protocol name and schema version, same description — just grown to fit the Case ID field and Start / Cancel buttons. The "Start new interview" button is replaced in place by the form. A backdrop fades in behind. Dismissal reverses the morph.

## Approach

`@codaco/fresco-ui` already supports shared-layout morphs: `Dialog.layoutId` is forwarded to `ModalPopup`, which switches from its default scale/fade enter to motion's shared-element animation when `layoutId` is set (`packages/fresco-ui/src/dialogs/Dialog.tsx:36`, `packages/fresco-ui/src/Modal/ModalPopup.tsx:71-85`). This spec wires up that machinery and redesigns `NewSessionDialog` so its layout mirrors the card, making the morph identity-preserving rather than a shape swap.

The morph element is the inner protocol card div inside `DeckCard.tsx` (the one held by `cardRef`), keyed `protocol-card-${hash}`. The morph target is the dialog popup with the same id.

### Why the morph is clean

The active card has identity transform: with `offset = index - activeIdx = 0`, `buildKeyframes` produces `translateY(0%) rotate(0deg) translateZ(0)` (`apps/interviewer-v7/src/components/DeckCard.tsx:94-110`). Only inactive cards carry fan rotation / depth, and only the active card can open the dialog (`handleActivate` scrolls to the card on first click and only triggers `onStartInterview` on the second; `apps/interviewer-v7/src/components/ProtocolDeck.tsx:227-242`). So motion measures a clean axis-aligned bounding box and the morph has no rotation snap at its boundaries.

### Why `NewSessionDialog` stops using fresco-ui `Dialog`

`Dialog` enforces a header row (title + close button) and standard surface spacing. The morph requires the popup to look like an expanded card — Pattern banner on top, protocol name as heading, then meta row, description, form, footer. That layout doesn't fit `Dialog`'s slots. `NewSessionDialog` therefore uses `Modal` + `ModalPopup` directly (both exported from `@codaco/fresco-ui`) and renders its own layout inside the popup. `ModalPopup` forwards `layoutId` and preserves Base UI's dismissible / focus-trap behavior because it still renders `Dialog.Popup` under the hood.

## Component changes

### `apps/interviewer-v7/src/components/DeckCard.tsx`

Protocol-card branch only (the import card is untouched).

- Add `isExpanding: boolean` to `DeckCardProps`.
- Convert the inner card root (the element currently holding `cardRef`) to `motion.div` from `motion/react`, with `layoutId={`protocol-card-${protocol.hash}`}`.
- When `isExpanding` is true, set `opacity: 0` on the card root. The deck slot keeps its width so the deck doesn't reflow.
- Leave the ScrollTimeline `Element.animate(...)` call attached. It writes via WAAPI to the card root; motion writes inline `transform` to the **dialog popup** (a different element), so they don't collide. The card is invisible during the morph so its WAAPI animation is visually irrelevant.

### `apps/interviewer-v7/src/components/ProtocolDeck.tsx`

- Add `expandingProtocolHash?: string` to `ProtocolDeckProps`.
- Forward `isExpanding={entry.kind === 'protocol' && entry.protocol.hash === expandingProtocolHash}` to each `DeckCard`.

### `apps/interviewer-v7/src/components/NewSessionDialog.tsx`

Significant redesign.

- Add `layoutId?: string` to `NewSessionDialogProps`.
- Replace fresco-ui `Dialog` with `Modal` + `ModalPopup` (both from `@codaco/fresco-ui/Modal`). Pass `layoutId` through to `ModalPopup`.
- Replace the in-flight protocol-name fetch with a full protocol fetch — the popup needs the protocol object (name, schemaVersion, description, importedAt) so the banner can render with the card's identity at morph time. Use the existing `ProtocolWithCounts` lookup — `listProtocols()` is already loaded on Home; pass `protocol` down as a prop instead of having the dialog re-fetch.
- Popup layout (top to bottom) — mirrors `DeckCard.tsx:210-279`:
  1. **Banner** (`h-[42.5%]` analogue, but sized to fit a dialog rather than a card aspect): `<Pattern seed={protocol.name}>` background, `<Heading level="h2">` with the protocol name (`text-white`, `font-black`, `tracking-tight`), and a monospace `Schema v{schemaVersion}` line.
  2. **Meta row**: `Imported <TimeAgo date={importedAt} />` and `{sessionCount} interview(s)` in the same monospace styling as the card.
  3. **Description**: `<p>` with the same `text-text/80 text-sm leading-[1.45]` styling (no `line-clamp` since the dialog has room).
  4. **Form area**: `<Field name="caseId" component={InputField}>` with the same `required` and `validateOnChange` props as today.
  5. **Footer**: `Cancel` (outline) and `Start interview` (`SubmitButton`) buttons, right-aligned on `phone-landscape+`, stacked on narrow viewports — match the spacing convention from fresco-ui's `DialogFooter`.
- Keep `FormStoreProvider` + `FormWithoutProvider` wrapping. The submit handler is unchanged: validate `caseId`, look up the protocol, call `createSession`, invoke `onCreated`.
- The popup is dismissible (default): backdrop click and Esc both close it, which triggers the reverse morph.
- Drop the `protocolName` `useState` + `useEffect`. The protocol arrives via props.

Updated `NewSessionDialogProps`:

```ts
type NewSessionDialogProps = {
  open: boolean;
  protocol: ProtocolWithCounts;
  sessionCount: number;
  onClose: () => void;
  onCreated: (session: StoredSession) => void;
  layoutId?: string;
};
```

### `apps/interviewer-v7/src/routes/Home.tsx`

- Pass `expandingProtocolHash={pendingProtocolHash ?? undefined}` to `ProtocolDeck`.
- When rendering `NewSessionDialog`, resolve the matching `ProtocolWithCounts` from `protocols` and the matching `sessionCount` from `sessions` (already in component state) and pass them in. Pass `layoutId={`protocol-card-${pendingProtocolHash}`}`.

### `apps/interviewer-v7/src/routes/Protocols.tsx`

- Update the `NewSessionDialog` call site to pass `protocol` + `sessionCount` (lookup against the route's existing state) and omit `layoutId`. With no `layoutId`, `ModalPopup` falls back to its default scale/fade animation — no morph, no visual regression.

## Edge cases and behavior

- **Cancel / Esc / backdrop click**: `closeDialog` runs → `pendingProtocolHash` becomes `null` → dialog unmounts → `AnimatePresence` runs the exit. Because the popup has `layoutId` and a matching `motion.div` still exists at the deck card's position, motion reverses the morph back into the slot. `DeckCard.isExpanding` flips to false; card opacity returns to 1 once exit completes.
- **Successful submit**: `onCreated` calls `navigate(`/interview/${session.id}`, { state: { fresh: true } })`. wouter swaps the route, `Home` unmounts, and the dialog's `AnimatePresence` parent unmounts with it — so no exit animation runs and no reverse morph plays. The route transition to `Interview` takes over visually. No special handling required in `NewSessionDialog`.
- **Active-card-changes-during-dialog**: not possible. Base UI's `Dialog.Root` traps focus inside the popup and the backdrop blocks pointer events. Keyboard handlers attached to `window` in `ProtocolDeck` still fire, but state changes there are irrelevant — the morph is keyed on the `pendingProtocolHash` captured when the dialog opened, not on the deck's `activeIdx`.
- **Import card**: doesn't open `NewSessionDialog`, doesn't get `layoutId`. Untouched.
- **`Protocols.tsx` call site**: no `layoutId`, no morph, falls back to `ModalPopup`'s default animation. Behavior is the same as today modulo the new prop shape (caller passes `protocol` + `sessionCount` instead of just `protocolHash`).
- **Deck reflow**: prevented. The card slot retains its width because only the inner card opacity changes; the surrounding flex item is untouched.
- **Wheel / arrow keys during morph**: focus is inside the popup, so `ProtocolDeck`'s `isEditableTarget` guard short-circuits arrow handling (the Case ID input is an `<input>`). Wheel events on the section beneath the backdrop can still fire, but they only drive scroll-snap; once the dialog closes the user lands back on the same active card.

## What this spec does NOT change

- The deck's fan transform, ScrollTimeline wiring, scroll-snap behavior, or chevron / dot-nav controls.
- Auth, persistence, or any IPC surface.
- `createSession`, validation, or the session-creation flow itself.
- The `Protocols.tsx` route's behavior — it just adapts to the new `NewSessionDialog` prop shape.
- Token / theme additions. The popup reuses existing surface tokens and the card's color palette.

## Acceptance

- Clicking the active protocol card's CTA on Home morphs the card into a centered dialog with the same Pattern banner, name, schema version, meta row, and description, plus a Case ID field and Cancel / Start interview buttons.
- A backdrop fades in behind the morphing card.
- The deck's other slots don't reflow during the morph.
- Cancel / Esc / backdrop click reverse the morph cleanly.
- Submitting navigates to `/interview/{id}` without an awkward intermediate animation.
- `Protocols.tsx`'s "Start new interview" continues to open a standard popup (no morph) with no visual regression.
- `pnpm typecheck` and `pnpm lint` pass.
