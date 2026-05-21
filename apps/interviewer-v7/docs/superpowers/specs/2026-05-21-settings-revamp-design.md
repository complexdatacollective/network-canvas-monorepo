# Settings dialog revamp

Date: 2026-05-21
Scope: `apps/interviewer-v7`

## Problem

`SettingsDialog` carries three accumulated issues:

1. **A Display tab with no options.** It renders a single "Display preferences" row whose only content is an em-dash placeholder.
2. **The Security tab duplicates wizard UI by hand.** Both the wizard's `Step4Behavior` and the Security tab implement the same three controls (idle timeout select + the two require-unlock toggles), independently. Drift is already visible: the wizard uses `SelectField` + `UnconnectedField`; the Security tab uses a raw `<select>` styled with a one-off `INPUT_PILL_CLASS`. The Security tab also ends with a "Lock now" button that duplicates the lock icon already in the top action bar.
3. **The Device tab is half-broken on Electron.** It renders a Storage row sourced from `navigator.storage.estimate()`, which returns no usable usage/quota inside the Chromium app (no IndexedDB usage there — data lives in SQLCipher). The progress bar shows 0 % and the row label says "Unknown", which is worse than not showing it. The Device tab also has Platform and Installation ID rows that are duplicated verbatim on the About tab.

Separately, there is no facility in the running app to generate test interview data for export-pipeline validation. The functionality exists in `@codaco/protocol-utilities` and is exercised in `fresco-next`; we want the same affordance here.

## Goal

Reshape `SettingsDialog` into four sections, eliminate the duplications, fix Storage on Electron, share the behavior controls with the setup wizard, and add a synthetic-data section that mirrors `fresco-next`'s.

## Sections

The new section list, in order, with **About as the default landing tab**:

1. **About** — App version, Storage, Installation ID.
2. **Data export** — unchanged contents, but rows reformatted with fresco-ui `UnconnectedField` (see § fresco-ui rollover).
3. **Security** — info Alert, shared behavior controls, ManageAuthenticator.
4. **Synthetic data** — new.

The **Display** and **Device** tabs are deleted. Their navigation entries and the routing branches in `SettingsDialog` are removed.

The `section` state initial value changes from `'device'` to `'about'`. `NAV_ITEMS` becomes four entries (About → Info icon, Data export → Upload, Security → Shield, Synthetic data → FlaskConical).

## Storage on Electron

`src/lib/platform/storage.ts` becomes platform-dispatching, matching the rest of `lib/db/api`:

- Web / Capacitor path unchanged — `navigator.storage.estimate()`.
- Electron path calls a new IPC `system:storageInfo` returning `{ dbBytes: number | null; diskFreeBytes: number | null; diskTotalBytes: number | null }`.

`StorageEstimate` widens to:

```ts
export type StorageEstimate = {
  usage: number | null; // db bytes (electron) / IDB usage (web/capacitor)
  quota: number | null; // disk total (electron) / IDB quota (web/capacitor)
  free: number | null; // disk free (electron only) / quota - usage (web/capacitor)
  percent: number | null;
};
```

`estimateStorage()` builds the appropriate fields from whichever path it took. The About-tab Storage row renders:

- If `usage === null && quota === null`: label = "Unknown", no progress bar.
- Else: `${formatBytes(usage)} of ${formatBytes(quota)} (X%)` plus the existing `ProgressBar`.

### Electron IPC

`electron/main.ts` registers `system:storageInfo`. The handler resolves the DB path via the existing service (`getDbPath()` or equivalent — add an accessor if not present), runs `fs.promises.stat(dbPath).then(s => s.size)` for `dbBytes`, and runs `fs.statfsSync(app.getPath('userData'))` for `bavail * bsize` (free) and `blocks * bsize` (total). Each call is wrapped in a try/catch that resolves to `null` for that field.

`electron/preload.ts` exposes `api.system.storageInfo()`. `src/global.d.ts` adds the matching signature on the `electronAPI` declaration. `storage.ts` in the renderer calls it behind `if (isElectron)`.

## Shared behavior controls

A new `src/components/SecurityBehaviorControls.tsx`:

```ts
type Behavior = {
  idleTimeoutMinutes: IdleTimeoutMinutes;
  requireUnlockOnResume: boolean;
  requireUnlockOnExport: boolean;
};

type Props = {
  value: Behavior;
  onChange: (next: Behavior) => void;
  disabled?: boolean;
};
```

It renders the same three `UnconnectedField`s currently inside `Step4Behavior` (auto-lock-after `SelectField`, requireUnlockOnResume `ToggleField`, requireUnlockOnExport `ToggleField`), driven from props.

- `Step4Behavior.tsx` is rewritten to read/write wizard state via `useWizard()` and forward `value` / `onChange` to `<SecurityBehaviorControls>`. The `TIMEOUT_OPTIONS`, `asBehavior`, and `DEFAULT_BEHAVIOR` helpers move with the field rendering into `SecurityBehaviorControls`. `Step4Behavior` retains responsibility for `setNextEnabled(true)` and `setNextLabel('Finish')`.
- The Settings → Security tab uses `<SecurityBehaviorControls>` with `value` synthesized from `auth.idleTimeoutMinutes` + `settings.requireUnlockOnResume` + `settings.requireUnlockOnExport`, and `onChange` that diffs the patch and writes `auth.setIdleTimeoutMinutes(...)` and/or `updateSettings({ requireUnlockOnResume, requireUnlockOnExport })`.

## Security tab content

In order, top to bottom:

1. **Alert** — fresco-ui `<Alert variant="info">` reading: "Use the lock button in the top bar to lock immediately." Replaces the "Lock now" button. The `handleLockNow` callback in `SettingsDialog` and the `Lock` icon import are removed.
2. **`<SecurityBehaviorControls>`** — three fields.
3. **`<ManageAuthenticator>`** — unchanged module; it already covers credential metadata, change PIN, re-enrol biometric, revoke.

The raw `INPUT_PILL_CLASS` constant is deleted (it had a single use). The new fields inherit fresco-ui styling.

The Security tab does **not** expose a method picker. Switching between `webauthn` / `biometric-native` / `pin` / `passphrase` / `none` requires `revoke()` first because the existing data is wiped — this is already surfaced via the Revoke button in `ManageAuthenticator`, which then drops the user back into the setup wizard on next launch. A method picker in Settings would imply non-destructive switching and the data model does not support that.

## Synthetic data section

Models after `fresco-next`'s `SyntheticInterviewDataSection`. Same controls, adapted to the local DB.

### Data model

Add an `isSynthetic` boolean to `StoredSession`:

```ts
// src/lib/db/types.ts
export type StoredSession = {
  // ... existing fields
  isSynthetic?: boolean;
};
```

The field is optional so existing rows (without it) read as non-synthetic.

- **Dexie schema** (`src/lib/db/db.ts`) — bump version, add an `isSynthetic` index so we can count and bulk-delete cheaply. The Dexie upgrade is a no-op for existing rows (they remain `undefined === false`).
- **Electron schema** (`electron/db/schema.ts`) — add `isSynthetic INTEGER NOT NULL DEFAULT 0` to the `sessions` table (camelCase to match the existing column naming: `protocolHash`, `caseId`, `startedAt`, `currentStep`). The DDL is `CREATE TABLE IF NOT EXISTS`, so on startup we also run an idempotent `ALTER TABLE sessions ADD COLUMN isSynthetic INTEGER NOT NULL DEFAULT 0`, guarded by a `PRAGMA table_info(sessions)` check that asks whether the column exists first. This matches the legacy-filename migration pattern already in `electron/db/service.ts`.
- **Electron + Dexie session modules** — `createSession()` accepts an optional `isSynthetic` argument; `markSessionFinished`, `updateSession`, list/get round-trip the column. Two new functions, both wired through `lib/db/api.ts`:
  - `countSyntheticSessions(): Promise<number>`
  - `deleteSyntheticSessions(): Promise<number>` — returns the number deleted.

Synthetic sessions are **visible in the regular Sessions list** unchanged — no filtering, no pill (matches fresco-next's behaviour). Export treats them identically to real sessions.

### Generation library

A new `src/lib/synthetic/generate.ts`:

```ts
type GenerateOptions = {
  protocolHash: string;
  count: number;
  simulateDropOut: boolean;
  respectSkipLogicAndFiltering: boolean;
  onProgress?: (current: number, total: number) => void;
};

export async function generateSyntheticSessions(
  opts: GenerateOptions,
): Promise<number>;
```

The function:

1. Loads the protocol via `getProtocolByHash()`.
2. For each `i` of `count`:
   - Calls `generateNetwork(protocol.codebook, protocol.protocol.stages, undefined, { simulateDropOut, respectSkipLogicAndFiltering })` from `@codaco/protocol-utilities`.
   - Writes a `StoredSession` via `createSession()` with `isSynthetic: true`, `caseId: \`synthetic-${cuid()}\``, `protocolHash`, `protocolName: protocol.name`, `initialNetwork: result.network`, then immediately `updateSession()`with`currentStep`, `stageMetadata`, and `finishedAt = now`when`!result.droppedOut`.
   - Emits `onProgress(i + 1, count)`.
3. Replicates `fresco-next`'s "minimum 10% completed" guard when `simulateDropOut` is on: counts dropouts, and for any deficit below `Math.max(1, Math.ceil(count * 0.1))` it regenerates the worst-offending sessions in place with `simulateDropOut: false` and a `finishedAt` timestamp.

Unique-id source: use the `uuid` import already present in `src/lib/db/sessions.ts` — `caseId: \`synthetic-${uuid()}\``. No new dependency.

### UI

Added to `SettingsDialog` as the `'synthetic'` section:

- `SelectField` (Native) — protocol picker, populated from `listProtocols()` on tab mount. Disabled if zero protocols imported (with a hint: "Import a protocol first.").
- `InputField` (number, `min={1}`, `max={1000}`) — count.
- `ToggleField` — Simulate participant drop-out. Default `true`.
- `ToggleField` — Respect skip logic and filtering. Default `false`.
- `Button` — Generate. Disabled while `isGenerating`, while no protocol selected, or while no protocols exist.
- `ProgressBar` — visible while `isGenerating`, horizontal, percent-progress driven by the `onProgress` callback. Below it: "{current} / {total} interviews generated".
- `Row` — "Delete synthetic data" with descriptive copy showing the live count (`There are currently N synthetic sessions on this device.`) and a destructive `Button` that opens a `confirm()` dialog ("Delete N synthetic sessions? This cannot be undone.") before calling `deleteSyntheticSessions()`. The count refreshes after generation completes and after deletion.

The dropdown uses fresco-ui field components throughout — no raw `<select>` / `<input>`.

## fresco-ui rollover

Every raw input in `SettingsDialog` is replaced.

- Idle-timeout `<select>` → `SelectField` (Native) inside `SecurityBehaviorControls`.
- The two `<input type="number">` rows on Data export already use `InputField`, but the surrounding `<Row>` wrapper hand-rolls the label/description treatment. Switch to `UnconnectedField` with `label` / `hint` / `inline` props instead. The `<Row>` helper stays for non-field rows (Storage, Installation ID, App version) where there's no editable control.
- `ManageAuthenticator`'s PIN-change form currently uses three raw `<input type="password">` elements with hand-rolled tracking. Replace the **two new** PIN entries (new + confirm) with `SegmentedCodeField` (same component the wizard uses for `Step3PinConfigure`), wired through `UnconnectedField` with local `useState`. The **current** PIN field stays a `PasswordField` (the user re-enters with feedback, no per-digit advancement needed).
- The `INPUT_PILL_CLASS` constant in `SettingsDialog` is deleted.
- `NAV_BUTTON_BASE` styling stays — that's the section nav, not an input.

## File-by-file change list

### Renderer

- **`src/components/SettingsDialog.tsx`** — section nav reduced to four items; default state `'about'`; bodies for About / Data export / Security / Synthetic data; `INPUT_PILL_CLASS`, `handleLockNow`, `Lock` import removed.
- **`src/components/SecurityBehaviorControls.tsx`** — new.
- **`src/components/SetupWizard/Step4Behavior.tsx`** — rewritten to delegate rendering to `SecurityBehaviorControls`.
- **`src/components/ManageAuthenticator.tsx`** — replace the new + confirm PIN raw inputs with `SegmentedCodeField` via `UnconnectedField`. Current PIN becomes `PasswordField`. Remove the three large `<label>` blocks.
- **`src/lib/platform/storage.ts`** — `estimateStorage()` becomes platform-dispatching; `StorageEstimate` widens with `free`.
- **`src/global.d.ts`** — adds `api.system.storageInfo()` signature.
- **`src/lib/db/types.ts`** — `StoredSession.isSynthetic?: boolean`.
- **`src/lib/db/db.ts`** (Dexie) — schema bump, add `isSynthetic` index.
- **`src/lib/db/sessions.ts`** — `createSession` accepts `isSynthetic`; add `countSyntheticSessions`, `deleteSyntheticSessions`.
- **`src/lib/db/electron-sessions.ts`** — same surface as Dexie, dispatched through IPC.
- **`src/lib/db/api.ts`** — add `countSyntheticSessions` and `deleteSyntheticSessions` dispatch functions.
- **`src/lib/synthetic/generate.ts`** — new.

### Main process

- **`electron/main.ts`** — register `system:storageInfo`.
- **`electron/preload.ts`** — expose `system.storageInfo`.
- **`electron/db/schema.ts`** — `sessions.is_synthetic` column.
- **`electron/db/service.ts`** — idempotent `ALTER TABLE ... ADD COLUMN` guarded by `PRAGMA table_info`; round-trip `is_synthetic` in CRUD.
- **`electron/handlers/dbHandlers.ts`** — handlers for the two new DB IPCs (`db:sessions:countSynthetic`, `db:sessions:deleteSynthetic`).

## Invariants preserved

- Single-user invariant — synthetic sessions still have no user identifier; `caseId` continues to be a per-session opaque string, just prefixed `synthetic-`.
- The platform facade in `lib/db/api.ts` keeps the renderer ignorant of `isElectron` branching.
- Wizard and Settings share a single source of truth for behavior controls — drift between the two has a structural fix, not a convention.
- Re-enrol / revoke flows in `ManageAuthenticator` are unchanged in behaviour, only PIN-input UI is swapped.

## Out of scope

- Visible "synthetic" pill on `SessionCard` in the Sessions list — matches fresco-next which doesn't display one; revisit if a researcher reports confusion.
- Background / cancellable generation — synchronous in-process loop is sufficient for `count ≤ 1000`.
- A method picker in Settings that switches between security modes non-destructively — the data model does not support it.
- Reworking `ManageAuthenticator`'s information-density (mode / credential / enrolled grid) — keep the existing presentation.
- Display preferences as a feature — when display options exist they'll get their own section back; until then the tab adds noise.
