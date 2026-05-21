# Sample protocol ghost card + ghost-import pattern

A "ghost" deck card represents the sample protocol on the home screen and, more generally, any in-flight import. The same pattern replaces the import dialog's progress/success states: once an import begins, the dialog closes and a ghost card in the deck shows progress, then transitions into the final `DeckCard` on success (or vanishes on failure).

## Why

Two problems addressed in one move:

1. **No path to the sample protocol from the app.** New users with no `.netcanvas` file have to find one out-of-band. The sample is the canonical onboarding artefact, but today nothing surfaces it.
2. **Import progress is hidden in a modal.** The current `ImportDialog` blocks the deck behind a "Importing…" state, then a "Imported" state with a "Start an interview" CTA. The user can't see the deck change as a result of their action; once they close the dialog, the success modal's CTA is the only way to launch without scrolling back to their new card.

A ghost card co-located with the rest of the deck makes both flows continuous: the user sees the new card appear, watch it import, and become real in the same surface they were already looking at.

## Architecture overview

`DeckEntry` gains two kinds — `sample` and `pending` — alongside the existing `protocol` and `import`. The deck order becomes:

```
real protocols → sample (if not dismissed) → "Import a protocol"
```

`HomeRoute` owns the lifecycle. It already orchestrates `reload()`, dialog state, and pending-session state, so a `pendingImports: PendingImport[]` slice and a `startImport(source)` helper sit naturally there. `ImportDialog` becomes a source-picker only; its progress/success branches are deleted.

`importProtocolFromFile` / `importProtocolFromUrl` gain an additive `onProgress` callback so the URL fetcher can stream a determinate progress signal and both paths can emit phase transitions.

`StoredSettings.sampleProtocolDismissed: boolean` (default `false`) drives whether the sample ghost is shown; a toggle in `SettingsDialog` lets the user bring it back. A successful sample install sets the flag to `true` so the ghost doesn't co-exist with the real card.

## Data model

```ts
// src/components/ProtocolCarousel/DeckCard.tsx
export type DeckEntry =
  | { kind: 'protocol'; protocol: ProtocolWithCounts }
  | { kind: 'sample' }
  | { kind: 'pending'; pending: PendingImport }
  | { kind: 'import' };

// src/lib/protocol/importProtocol.ts
export type ImportPhase = 'fetching' | 'extracting' | 'saving';

// src/components/ProtocolCarousel/DeckCard.tsx — co-located with DeckEntry
export type PendingImport = {
  id: string; // crypto.randomUUID() — React key + lookup
  label: string; // 'Sample Protocol', filename, or URL host
  source: 'file' | 'url' | 'sample';
  phase: ImportPhase;
  progress?: number; // 0..1, only when 'fetching' has a Content-Length
};
```

## Lifecycle

```
1. user picks file / pastes URL / clicks Install on sample card
2. HomeRoute.startImport(source) pushes a PendingImport into state
3. ImportDialog (if open) closes immediately
4. importProtocol*() runs with onProgress → mutates the matching PendingImport
5a. success → if source === 'sample' updateSettings({ sampleProtocolDismissed: true });
              await reload(); remove the PendingImport;
              deck now contains the real protocol, the ghost is gone
5b. failure → remove the PendingImport; destructive toast surfaces the error
```

Concurrent imports are not a designed-for feature, but the array shape supports them. If a user starts two imports (e.g. file import while a URL fetch is still streaming), both ghosts render and resolve independently.

## `importProtocol*` progress callback

Signature change is additive — existing callers can omit `onProgress`:

```ts
type ProgressEvent = { phase: ImportPhase; progress?: number };
type OnProgress = (event: ProgressEvent) => void;

importProtocolFromFile(file: File, onProgress?: OnProgress): Promise<ImportProtocolResult>;
importProtocolFromUrl(url: string, onProgress?: OnProgress): Promise<ImportProtocolResult>;
```

- **URL path** switches from `await response.arrayBuffer()` to `response.body.getReader()`, accumulating chunks. Emits `{ phase: 'fetching', progress: received / contentLength }` per chunk when Content-Length is present; indeterminate (`progress: undefined`) when not. Then `{ phase: 'extracting' }` once buffered, then `{ phase: 'saving' }` right before `saveProtocol`.
- **File path** emits `{ phase: 'extracting' }` immediately and `{ phase: 'saving' }` before save. No determinate progress (the file is already in memory).
- The `ImportProtocolResult` union is unchanged — failures still surface as `{ success: false, error, message }` and bubble out of the same `await` site.

## Card variants

### `sample`

Dashed-border treatment mirroring the existing Import card so it reads as a ghost, but laid out with the protocol-card structure so the morph into a real card later feels continuous.

- Heading: **Sample Protocol**
- Body: short tagline — "A complete reference protocol from the Network Canvas team — useful for exploring how stages, prompts, and codebooks fit together."
- Footer action slot (where Start sits on a real card): **"Install sample protocol"** button.
- Click anywhere on the card body activates install — matches the Import card's click-anywhere behaviour.
- Trash IconButton in the same slot it occupies on real cards. Click sets `sampleProtocolDismissed: true` → ghost vanishes.

### `pending`

Same chrome as a real protocol card so the swap-in is visually continuous.

- Heading: `pending.label` (filename, URL host, or "Sample Protocol").
- Description slot replaced by a phase line: _Fetching…_ / _Extracting…_ / _Saving…_.
- Footer band (where Start sits on a real card) holds a progress bar: determinate when `pending.progress != null`, indeterminate sweep otherwise.
- Not clickable, no delete affordance — it's transient.

## Transitions

- **Sample → pending.** When the user clicks Install, the sample entry is replaced with a pending entry in the same deck slot. `AnimatePresence` cross-fades between them.
- **Pending → real card.** Cross-fade keyed by `pending.id` on the way out and `protocol.hash` on the way in. A `layoutId`-based morph (using the same `deckCardLayoutId` infra `NewSessionCardOverlay` uses) is feasible by giving the pending card a hash-derived `layoutId` on the swap frame, but it's a polish iteration. Ship the cross-fade first; upgrade if it feels off.
- **Pending → gone (failure).** Immediate exit cross-fade; toast surfaces the error.

## Sample protocol constant

```ts
// src/lib/protocol/sampleProtocol.ts
export const SAMPLE_PROTOCOL = {
  url: 'https://documentation.networkcanvas.com/protocols/Sample%20Protocol%20v4.netcanvas',
  name: 'Sample Protocol',
  description:
    'A complete reference protocol from the Network Canvas team — useful for exploring how stages, prompts, and codebooks fit together.',
} as const;
```

Single source of truth. `HomeRoute` and `DeckCard`'s sample variant both read from here.

## Settings

- `StoredSettings.sampleProtocolDismissed: boolean` (default `false`) added to `src/lib/db/types.ts` and `DEFAULT_SETTINGS`. Both Dexie and Electron settings stores round-trip the whole object, so no migration code is needed beyond the default.
- New toggle row in `SettingsDialog` near the existing setup-related controls: **"Show sample protocol on home screen"**, bound to `!sampleProtocolDismissed`.
- On successful sample install, `updateSettings({ sampleProtocolDismissed: true })` runs _before_ `reload()` so the ghost doesn't briefly co-exist with the real card.

## `ImportDialog` simplifies

The `mode === 'uploading'` and `mode === 'done'` branches and their associated state (`mode`, `imported`) are deleted. The dialog stays focused on source selection. Its existing `onImported(hash)` prop is replaced with:

```ts
type ImportRequest =
  | { source: 'file'; file: File; label: string }
  | { source: 'url'; url: string; label: string };

type ImportDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (request: ImportRequest) => void; // dialog closes itself after calling
};
```

The dialog derives the label (filename for files, URL host for URLs), invokes `onSubmit`, and closes. `HomeRoute` is responsible for spawning the `PendingImport` and running the importer.

The "Start an interview" CTA disappears with the success modal, but the user lands back on the deck with their new protocol card visible and can hit Start there directly.

## Out of scope

- No queue/throttle UI for concurrent imports; the data model supports an array but the UI doesn't expose a multi-import affordance.
- No telemetry on sample installs.
- No `layoutId` morph for the pending→real transition in this pass.
- No change to the Import card itself.
- No unification of `sampleProtocolDismissed` with `dismissedUpdates` — that array is for changelog-style notifications, not first-run education.
