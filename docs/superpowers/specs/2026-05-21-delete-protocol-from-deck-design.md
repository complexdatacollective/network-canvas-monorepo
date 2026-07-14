# Delete a protocol from the ProtocolDeck

## Background

`apps/interviewer-v7/src/components/ProtocolCarousel/ProtocolDeck.tsx` renders
the Home screen's fanned protocol deck. Users can import protocols and start
interviews from it, but there is currently no way to remove a protocol. Stale
or accidentally-imported protocols accumulate, and the CLAUDE.md routing notes
(which referenced a now-removed `Protocols.tsx` cascade-delete screen) are out
of step with the current Variation F home shell — the deck IS the protocol
manager.

The Electron data layer already supports the destructive operation:
`protocols.delete(hash)` in `electron/db/service.ts:341` cascades to `assets`
and `sessions` inside a single SQLCipher transaction, and the IPC handler,
preload bridge, and ambient global types for `db.protocols.delete(hash)` all
exist. What's missing is the Dexie-side cascade, the renderer-side DB facade
wrapper, the confirmation dialog, and the UI affordance.

## Goals

Let the user delete a protocol from the ProtocolDeck, with a confirmation
dialog that escalates to destructive intent when un-exported interview data
would be lost. Deleting a protocol cascades to all its sessions and assets so
no orphaned rows remain.

Non-goals:

- A bulk delete UI (one protocol at a time).
- Recovery / soft delete — the operation is permanent.
- Deleting individual sessions from the deck (the DataView already supports
  per-session selection separately).
- Interrupting an in-flight interview that happens to belong to the deleted
  protocol. The deck is only reachable from `/`, so we assume the user has
  navigated away before deleting.

## Design

### Affordance and placement

The delete control is an `IconButton` from `@codaco/fresco-ui/Button`,
rendered **only on the active card**, in the card's footer row alongside the
existing "Start new interview" `Button`. The footer becomes a flex row:

```
| [   Start new interview   ] [🗑] |
                                ^^^ IconButton size="xl" — aspect-square
                                    (~48px) matches chevron touch targets
```

Why this placement:

- The "Start new interview" button is already active-only, so the delete
  control follows the same lifecycle — no clutter on inactive peeking cards,
  no overlay menu to discover.
- The card's heading and meta row are untouched (the user's explicit
  constraint).
- `size="xl"` `IconButton` is the touch-target size already used by the
  surrounding chevron row (ProtocolDeck.tsx:429), so the affordance reads
  as part of the deck's vocabulary, not a foreign control.
- The import card is not deletable, so it never gets the icon.

Behaviour:

- `color="destructive"` and `variant="text"` on the IconButton so it reads
  as a hazard, not a primary CTA.
- Icon: `Trash2` from `lucide-react`.
- `aria-label`: `` `Delete ${protocol.name}` ``.
- `onClick` calls `event.stopPropagation()` so the card's `onActivate`
  (which starts a new interview) does not also fire.

### Confirmation dialog

`useDialog()` from `@codaco/fresco-ui/dialogs/useDialog` is already available
because `DialogProvider` is mounted in
`apps/interviewer-v7/src/providers/AppProviders.tsx`. The handler calls
`openDialog({ type: 'choice', ... })` and branches on whether the protocol has
**un-exported** sessions:

```ts
const unexportedCount = sessions.filter(
  (s) => s.protocolHash === protocol.hash && s.exportedAt === null,
).length;
const totalCount = sessions.filter(
  (s) => s.protocolHash === protocol.hash,
).length;
```

| Case                                                           | `intent`      | Title                            | Body                                                                                                                                                                                                   | Primary label     |
| -------------------------------------------------------------- | ------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| `unexportedCount === 0` (no sessions, or all already exported) | `default`     | `` `Delete ${protocol.name}?` `` | `"Removes the protocol from this device."` plus, when `totalCount > 0`, `` ` ${totalCount} interview record(s) will also be deleted.` `` plus `"This cannot be undone."`                               | `"Delete"`        |
| `unexportedCount > 0`                                          | `destructive` | `` `Delete ${protocol.name}?` `` | `` `${unexportedCount} interview record(s) have not been exported and will be permanently lost if you delete this protocol. Export them first if you want to keep the data. This cannot be undone.` `` | `"Delete anyway"` |

Cancel label is `"Cancel"` in both cases. fresco-ui's `DialogProvider`
already handles the rest: `intent: 'destructive'` swaps the primary button to
the destructive palette **and** auto-focuses Cancel
(`DialogProvider.tsx:434`), which is exactly the "make accidental deletion
harder" behaviour the spec calls for. `default` intent auto-focuses Primary.

Singular/plural for `record(s)` is handled by branching on the count
(`'1 interview record has not been exported and will be permanently lost'`
vs `` `${n} interview records have not been exported and will be permanently lost` ``).

### Data layer

Cascade-delete sits in the DB facade so callers do not need to know about
sessions, assets, or platform differences.

**`apps/interviewer-v7/src/lib/db/api.ts`** — add the public surface:

```ts
export async function deleteProtocol(hash: string): Promise<void> {
  return isElectron
    ? electronProtocols.deleteProtocol(hash)
    : dexieProtocols.deleteProtocol(hash);
}
```

**`apps/interviewer-v7/src/lib/db/protocols.ts`** — Dexie implementation:

```ts
export async function deleteProtocol(hash: string): Promise<void> {
  await db.transaction('rw', db.protocols, db.sessions, db.assets, async () => {
    await db.assets.where('protocolHash').equals(hash).delete();
    await db.sessions.where('protocolHash').equals(hash).delete();
    await db.protocols.where('hash').equals(hash).delete();
  });
}
```

**`apps/interviewer-v7/src/lib/db/electron-protocols.ts`** — thin IPC wrapper
matching the existing pattern:

```ts
export async function deleteProtocol(hash: string): Promise<void> {
  return ipc().protocols.delete(hash);
}
```

Electron-side `protocols.delete(hash)` already cascades in a transaction
(`electron/db/service.ts:341`) — no change needed in the main process,
preload, or IPC handlers. The ambient type for
`window.electronAPI.db.protocols.delete: (hash: string) => Promise<void>`
already exists in `src/global.d.ts`.

### Wiring through the component tree

**`Home.tsx`** owns the orchestration:

```ts
const handleDeleteProtocol = useCallback(
  async (hash: string) => {
    const protocol = protocols.find((p) => p.hash === hash);
    if (!protocol) return;
    const protocolSessions = sessions.filter((s) => s.protocolHash === hash);
    const unexportedCount = protocolSessions.filter(
      (s) => s.exportedAt === null,
    ).length;
    const totalCount = protocolSessions.length;

    const confirmed = await openDialog({/* choice dialog as above */});
    if (confirmed !== true) return;

    try {
      await deleteProtocol(hash);
      toast.add({
        title: 'Protocol deleted',
        description: protocol.name,
        variant: 'success',
      });
      await reload();
    } catch (cause) {
      toast.add({
        title: 'Could not delete protocol',
        description: cause instanceof Error ? cause.message : String(cause),
        variant: 'destructive',
      });
    }
  },
  [openDialog, protocols, reload, sessions, toast],
);
```

It is passed down as `onDeleteProtocol` to `ProtocolDeck`. The existing
`initialProtocolHash` memo (Home.tsx:106–115) already falls back to the
most-recently-imported protocol when the remembered hash disappears, so no
extra cleanup is needed there. The pending-new-session check
(Home.tsx:99–101) already drops `pendingProtocolHash` when its protocol no
longer exists, so the new-session overlay collapses cleanly if the user
opened the form for a card and then deleted it (an unlikely path, but
defensive).

**`ProtocolDeck.tsx`** receives `onDeleteProtocol: (hash: string) => void`
and forwards a bound `onDelete` to each `DeckCard`:

```ts
onDelete={
  entry.kind === 'protocol'
    ? () => onDeleteProtocol(entry.protocol.hash)
    : undefined
}
```

Active-card snap after deletion: when `protocols` shrinks, the deck rebuilds
from `useMemo`. If the deleted card was the last slide, `activeIdx` may
point past the new end. After the deck length changes, we call
`swiperRef.current?.slideTo(Math.min(activeIdx, deck.length - 1), 0)` from
an effect keyed on `deck.length`, but **only when `activeIdx >= deck.length`** —
deleting a card before the active one should leave the active card where it
is. The `didInitialScroll` guard already handles the unrelated first-mount
case.

**`DeckCard.tsx`** gains an optional `onDelete?: () => void`. When present
and `isActive` is true, the footer renders both the "Start new interview"
Button and a destructive `IconButton`:

```tsx
{
  isActive && (
    <div className="mx-3 mb-3 flex items-center gap-2 @min-3xs:mx-4 @min-3xs:mb-4 @min-[320px]:mx-5 @min-[320px]:mb-5 @min-[380px]:mx-6 @min-[380px]:mb-6">
      <Button color="primary" className="flex-1 …">
        Start new interview
      </Button>
      {onDelete && (
        <IconButton
          size="xl"
          variant="text"
          color="destructive"
          icon={<Trash2 aria-hidden />}
          aria-label={`Delete ${protocol.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        />
      )}
    </div>
  );
}
```

The existing Start button's outer-margin classes move to the wrapper so the
two controls align inside the same footer band. The Start button itself
takes `flex-1`.

### Edge cases

- **Single protocol in the deck**: deleting it leaves the deck holding only
  the Import card. The Import card stays active (`activeIdx` clamps to 0),
  the chevron row hides itself because `deck.length > 1` is no longer true.
- **Pending new-session overlay on the deleted protocol**: the existing
  Home.tsx guard collapses the overlay; we do not need a manual close.
- **Concurrent deletes**: the button briefly stays interactive after first
  click while the dialog opens. fresco-ui's `DialogProvider` queues dialogs,
  so a double-click just stacks two confirmations on the same protocol —
  the second one resolves against an already-deleted protocol, the
  `protocols.find` guard returns and the operation is a no-op. No explicit
  disable needed.
- **Delete failure (DB locked, IPC error)**: caught in the handler; the
  user sees a destructive-variant toast with the error message, the deck
  reloads (which is a no-op on failure but cheap), no half-deleted state.

## Testing

Existing tests do not cover `ProtocolDeck` / `DeckCard` / `protocols.ts`.
Adding a focused Vitest unit test on Dexie `deleteProtocol(hash)` covers the
highest-risk code path:

`apps/interviewer-v7/src/lib/db/__tests__/protocols.test.ts` (new):

- Setup: import a protocol, create two sessions for it, save one asset
  against it. Import a second, unrelated protocol with one session and one
  asset.
- Act: call `deleteProtocol(hash)` for the first protocol.
- Assert: first protocol/sessions/assets are gone; second protocol's rows
  are untouched.

UI placement, dialog copy, and the Electron IPC path remain manual to
verify. The Electron `protocols.delete` already has its cascade behaviour
guaranteed by the existing transactional SQL — no new test there.

## Tradeoffs

**In-card footer placement vs. external chevron-row placement.** The
chevron-row option would keep the card layout completely untouched, but
the chevron row only renders when `deck.length > 1`. With a single
protocol, there would be no way to delete it. Placing the control in the
active card's footer solves that and groups the action with its target.

**Two dialog variants (default vs destructive) vs. one always-destructive
dialog.** Always-destructive is simpler, but the spec explicitly calls for
the destructive treatment only when un-exported data is at risk —
softening the cosmetic intensity when nothing irreversible is at stake
makes the destructive case feel more meaningful when it does appear.

**Cascade in the DB facade vs. orchestrating from the call site.** Doing
it at the call site (delete sessions, delete assets, delete protocol)
would leak storage-engine details into the UI. Pushing it into
`deleteProtocol(hash)` keeps the renderer agnostic to whether the cascade
is one SQLCipher transaction or three Dexie deletes inside a Dexie
transaction.
