# Interviewer-v8 — Offline-First PWA (single-target migration)

**Date:** 2026-07-01
**Status:** Approved (design)
**App:** `apps/interviewer-v8` (`@codaco/interviewer-v8`); removes `packages/biometric-keystore`

## Summary

Convert interviewer-v8 from a tri-target app (Electron desktop / Capacitor
tablet / Vite web) into a **single installable, offline-first Progressive Web
App at full feature parity**, retiring the Electron and Capacitor stacks
entirely. The web/Dexie data layer already persists protocols, sessions, and
assets in IndexedDB and already resolves assets to blob URLs offline, so the
data side is largely done. The real work is:

1. **Retire native first** — delete Electron + Capacitor and collapse the
   three-way `isElectron`/`isCapacitor` platform fork, leaving a clean web-only
   baseline the rest builds on.
2. **Add encrypted-at-rest storage + web-native key custody** — replace the
   Electron SQLCipher DEK model with a Web Crypto DEK that encrypts participant
   data in IndexedDB, unlocked by PIN/passphrase (PBKDF2) or **biometric via
   WebAuthn PRF**, with a passphrase recovery path.
3. **Add the PWA shell + update UX** — `vite-plugin-pwa`, manifest/icons, and
   the architect-web "prompt to reload" flow, made session-aware so an update
   never reloads mid-interview.
4. **Add offline awareness** — warn (but allow) when starting an
   internet-requiring (Geospatial) protocol offline.

The app is **alpha with no released users**, so there is **no data migration, no
backwards-compatibility, and no changeset** (interviewer-v8 is unreleased).

## Goals

- The full app — every screen, all installed protocols, and all protocol assets
  — loads and runs with no network connection.
- The app is installable (`display: standalone`, manifest + icons).
- Participant data is **encrypted at rest** in IndexedDB, matching the guarantee
  the retired SQLCipher desktop build provided.
- **Biometric unlock works in the browser** via WebAuthn + the PRF extension,
  deriving the key that unwraps the data-encryption key — replacing the native
  macOS-keychain and Capacitor biometric mechanisms with one standards-based
  path. A recovery passphrase protects against passkey loss.
- Updates mirror architect-web: a non-intrusive "new version available — reload"
  prompt, **never applied while an interview is in progress**.
- Starting an internet-requiring protocol offline **warns but is allowed**;
  starting fully-offline-capable protocols is unaffected.
- Electron, Capacitor, and all native-only dependencies are removed from the
  codebase and the monorepo.

## Non-goals

- **Offline map tiles.** Mapbox tiles/search stay network-only (ToS + volume);
  offline Geospatial degrades to a warning + graceful stage error.
- **Server sync / multi-user.** The app stays single-user and offline-first with
  manual export; no user identifier is introduced.
- **Data migration.** No released users exist.
- **Import-from-URL.** Removed (CORS-bound after native removal); protocols come
  from file import or the bundled sample/development protocols.
- **Retaining any native target.** This is a one-way migration to web-only.

## Decisions (from brainstorming)

| Decision             | Choice                                                                                                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target               | **PWA replaces all native apps.** Electron + Capacitor removed entirely.                                                                                                                                                                              |
| Sequencing           | **Native teardown first**, then encrypted vault, then PWA shell, then offline UX — one deliverable.                                                                                                                                                   |
| At-rest crypto       | **Encrypt IndexedDB with a real DEK** (Web Crypto AES-GCM), unwrapped by the user's auth. Not OS-disk-encryption-only.                                                                                                                                |
| Encryption mechanism | **Our own Web Crypto encrypted-table wrapper over Dexie** (Level-2), not `dexie-encrypted` and not a DBCore middleware. Keeps the DEK a non-extractable `CryptoKey`, binds AAD to `table:primaryKey`, avoids the async-crypto-in-transaction pitfall. |
| Biometric on web     | **Real biometric via WebAuthn + PRF extension**, deriving a KEK that wraps the DEK.                                                                                                                                                                   |
| Biometric recovery   | **Passphrase recovery alongside biometric** — DEK is dual-wrapped (PRF KEK _and_ passphrase KEK); either unlocks. Deliberately breaks the old "one auth mode per vault" invariant.                                                                    |
| Update UX            | **Mirror architect-web** (`registerType: 'prompt'`, silent on fresh load, prompt in an open session) **plus a session-aware guard** — no reload during an active interview.                                                                           |
| SW registration      | **All web loads** (not install-gated). Required for installability (Chrome only offers install when a SW with a fetch handler is registered) and because offline field use is core.                                                                   |
| Geospatial offline   | **Warn but allow**, reusing the existing `protocolRequiresInternet()`; no tile precaching.                                                                                                                                                            |
| `none` auth mode     | **Kept as honest plaintext** (no DEK), for low-risk/dev use; the wizard states the implication.                                                                                                                                                       |

## Current-state facts that shape the design

- **Build topology:** one renderer config, `apps/interviewer-v8/vite.renderer.config.ts`
  (`createRendererConfig`), consumed by `vite.config.ts` (web, `outDir: dist`,
  port 5180 — also the Capacitor `webDir`) and `electron.vite.config.ts`
  (Electron renderer + `electron/` main/preload). No PWA tooling exists today.
- **Platform fork:** `src/lib/platform/platform.ts` collapses to a 3-way enum at
  load (`electron` via `window.electronAPI`, `capacitor` via
  `Capacitor.isNativePlatform()`, else `web`). Every subsystem branches on it.
- **Storage:** `src/lib/db/api.ts` is the facade. Electron uses SQLCipher via IPC
  (`electron/db/service.ts`, `electron-*.ts` wrappers); **web and Capacitor share
  the Dexie/IndexedDB backend** (`src/lib/db/db.ts`, `protocols.ts`,
  `sessions.ts`) storing protocols, sessions, settings, and assets-as-Blobs.
  The web/Capacitor path stores data **plaintext** today.
- **Assets:** `src/lib/assets/assetResolver.ts` already resolves asset ids to
  blob URLs from the stored assets — offline-capable already.
- **Auth:** five modes, never combined (per app CLAUDE.md) —
  `biometric-keystore` (Electron macOS, native Rust keychain),
  `biometric-native` (Capacitor plugin), `pin`, `passphrase`, `none`. On **web**
  today, only `pin`/`passphrase`/`none` work and the PIN/passphrase path is
  **verifier-only** (no key is derived, because web data is plaintext). Key
  custody for Electron lives in the main process (`electron/auth/vault.ts`,
  PBKDF2 envelope wrapping a random DEK). `src/lib/auth/` holds the renderer
  clients, `AuthContext`/`AuthGate`, idle/blur lock (`idle.ts`), and step-up
  auth (`StepUpAuthProvider`/`StepUpAuthDialog`) driving
  `requireUnlockOnEnter`/`Exit`/`Export`.
- **Network dependence:** `protocolRequiresInternet()` already exists inline at
  `src/components/ProtocolCarousel/DeckSlotCard.tsx:26` —
  `protocol.protocol.stages.some((s) => s.type === 'Geospatial')`. Geospatial
  (`packages/interview/src/interfaces/Geospatial/useMapbox.ts`,
  `useGeospatialSearch.ts`) is the **only** internet-dependent stage (Mapbox
  tiles + optional search). External-data rosters (`loadExternalData.ts`) are
  offline when the URL is a bundled asset. PostHog analytics is off-by-default,
  fire-and-forget. Import-from-URL (`fetchFromUrl.ts`) is the other network call;
  it is **removed** in Workstream A.1, leaving Geospatial as the sole runtime
  internet dependency. **No online/offline detection or connectivity banner exists.**
- **Updates:** `src/lib/update/*` branches Electron (`electron-updater`),
  Capacitor (GitHub releases → store URL), and web (a "simulated" update that
  just links to a release page). `UpdateDialog.tsx`/`StatusRow.tsx`/`useUpdateCheck.ts`
  surface it. `__APP_VERSION__` is injected at build time
  (`src/lib/platform/appVersion.ts`).
- **Reference:** `apps/architect-web` is a working `vite-plugin-pwa` PWA; its
  design is `docs/superpowers/specs/2026-06-26-architect-web-offline-pwa-design.md`.
  Reusable units: `vite.config.ts` VitePWA block, `PwaUpdateBanner.tsx`,
  `PwaInstallNudge.tsx`, `installPrompt.ts`, `pwa.ts`
  (`isRunningAsInstalledPwa`/`requestPersistentStorage`), `pwa-assets.config.ts`.
  Its hard-won lesson: **SW registration must not be install-gated** or the app
  becomes un-installable.

## Workstream A — Native teardown (first)

Collapsing the platform fork before the crypto work removes the three-way
branching the vault/storage rewrite would otherwise have to thread through.

**Delete:**

- `electron/` (main, preload, handlers, `auth/`, `db/`, `update/`),
  `electron.vite.config.ts`, `electron-builder.config.cjs`, Electron
  `build-resources/`.
- `capacitor.config.ts`, `android/`, `ios/`, `scripts/cap-dev.mjs`,
  `scripts/sync-platform-versions.mjs`, `scripts/generate-icon-assets.mjs`
  (repurpose for PWA icons — see Workstream C), `scripts/add-ios-app-icon.mjs`.
- `packages/biometric-keystore` (the entire workspace package).

**Remove dependencies** from `apps/interviewer-v8/package.json`: `electron`,
`electron-vite`, `electron-builder`, `electron-updater`, `@capacitor/*`,
`@capacitor/cli`, `@capacitor/assets`, `@aparajita/capacitor-biometric-auth`,
`better-sqlite3-multiple-ciphers`, `@codaco/biometric-keystore`. Remove the
`electron:*`, `capacitor:*`, and `assets:generate-*` scripts. `main` field
(`dist-electron/...`) removed.

**Collapse branching:**

- `src/lib/platform/platform.ts` — remove `isElectron`/`isCapacitor` and the
  enum; the app is always web. Keep `hostAppName`. Remove `window.electronAPI` /
  `window.electronAPI?.update` types from `src/global.d.ts`.
- `src/lib/db/api.ts` — delete the `electron-protocols.ts`/`electron-sessions.ts`/
  `electron-settings.ts` wrappers and their branches; the Dexie backend is the
  only path.
- `src/lib/auth/api.ts` — delete `electron.ts` (IPC) and the native-biometric
  dispatch; auth is rebuilt in Workstream B.
- `src/lib/files/pickFile.ts` + `download.ts` — drop the Electron dialog IPC and
  `@capacitor/filesystem`/`@capacitor/share` branches; the web paths become the
  only paths, reworked in **Workstream A.1** (`download.ts` gains the Web Share
  sheet; `pickFile.ts` relaxes its `accept`).
- `src/lib/files/fetchFromUrl.ts`, `importProtocolFromUrl`/`deriveNameFromUrl` +
  the streamed-fetch branch in `src/lib/protocol/importProtocol.ts`, the
  `source: 'url'` request in `useProtocolImport.ts`, and the **"Import from URL"**
  section of `ImportDialog.tsx` — **removed** (see Workstream A.1). URL import is
  dropped; the sample/development protocols are bundled instead.
- `src/lib/update/*`, `UpdateDialog.tsx`, `StatusRow.tsx` update affordance,
  `useUpdateCheck.ts`, `storeUrls.ts`, `checkForUpdate.ts` — removed; replaced by
  the SW-driven update in Workstream C.
- `SettingsDialog.tsx` (Electron `storage.free` branch, native update controls),
  `SetupWizard` biometric steps (`Step3BiometricConfigure.tsx`, etc.) — rewired
  to the WebAuthn path in Workstream B.

**Monorepo:** update `pnpm-workspace.yaml` (drop `packages/biometric-keystore`),
`knip.json` (drop the biometric-keystore / Capacitor-SPM ignores that no longer
apply), `turbo.json` (drop any electron/capacitor tasks), and catalogs if a dep
becomes unused elsewhere.

**Result:** a plain Vite web SPA on Dexie — plaintext, PIN/passphrase
verifier-only. This is the baseline for B–D.

## Workstream A.1 — File I/O & protocol sources on the web platform

Native removal takes away three escape hatches — Electron/Capacitor URL fetch
(CORS-free), `@capacitor/share`, and native file dialogs. Their web-platform
replacements, and the one feature deliberately dropped:

### Protocol sources — file import + bundled protocols (URL import removed)

- **Import from URL is removed.** After native removal the only fetch path is
  CORS-bound `fetch()`, which cannot read an arbitrary cross-origin `.netcanvas`.
  Rather than run a proxy, the feature is dropped: delete `fetchFromUrl.ts`,
  `importProtocolFromUrl`/`deriveNameFromUrl`, the `source: 'url'` request, and the
  ImportDialog URL field + its tests. This also removes one of the app's last
  network dependencies.
- **Sample + development protocols are bundled** and install **locally, with no
  network fetch**. The sample protocol currently installs by fetching
  `documentation.networkcanvas.com/...` (`sampleProtocol.ts`); instead, bundle the
  `@codaco/sample-protocol` (and, dev-only, `@codaco/development-protocol`) bytes
  as a build asset and install them through the existing JSZip → migrate →
  validate → save pipeline from local bytes. The development protocol stays gated
  behind `import.meta.env.DEV` (matching the existing dev-only Library entry).
- **File import is the primary source**, mechanism unchanged — `<input
type="file">` in `pickFile.ts`, which already works on iPadOS/Android (opens the
  Files picker). See the `accept` fix below.

### File import on tablets — `accept` fix

`accept=".netcanvas,application/zip"` can grey out `.netcanvas` files in the iOS
Files picker: iOS matches by UTI, and a `.netcanvas` extension resolves to the
generic `public.data`, not `public.zip-archive`. **Fix:** relax `accept` (drop it
or add `application/octet-stream`) so `.netcanvas` files are selectable, and rely
on the existing post-selection validation (JSZip extract + schema validate) to
reject wrong files gracefully.

### Export → Web Share sheet, with download fallback

`download.ts` collapses to a single web path replacing both the Electron save
dialog and the Capacitor share:

- If `navigator.canShare?.({ files: [file] })` → `navigator.share({ files:
[file], title })` — raises the **native share sheet on iPadOS Safari and Android
  Chrome** (parity with the retired `@capacitor/share`).
- Else → `URL.createObjectURL` + `<a download>` (desktop / Firefox).

**User-gesture constraint:** unlike `@capacitor/share`, Web Share must be invoked
**synchronously within a user activation** — you cannot `await` a long archive
build and then call `share()` (iOS Safari throws `NotAllowedError`). So the export
flow (`src/lib/export/exportSessions.ts` + the DataView `useSessionMutations.ts`
trigger) becomes two-step: **build the archive with progress → present a "Share /
Save" affordance → `navigator.share()` fires on that tap.** `navigator.canShare`
with `files` is feature-detected at runtime (`navigator.share`/`canShare` are in
the TS DOM lib; no custom typing needed — unlike `beforeinstallprompt`, declared
for the install nudge in Workstream C).

## Workstream B — Web-native encrypted vault (`src/lib/vault/`)

Replaces the deleted Electron main-process `electron/auth/vault.ts`, in the
renderer, on Web Crypto (`SubtleCrypto`). No hand-rolled primitives.

### Threat model

Protect participant data (case ids + full network graphs/attributes + protocol
content) **at rest on disk** against another process or user under the same OS
account, casual device access, and device theft — the guarantee SQLCipher gave
the desktop build. The unlocked DEK lives only in memory as a non-extractable
`CryptoKey` for the session and is dropped on lock/idle/blur/reload. Out of
scope: a compromised runtime with the app already unlocked (inherent to any
client app), and offline map tiles.

### Key model

- **DEK** — AES-GCM-256. Generated _extractable_ only long enough to be wrapped
  at enrollment, then its handle is dropped. At unlock it is reconstructed via
  `unwrapKey(..., extractable: false, ['encrypt','decrypt'])`, so the **session
  DEK is a non-extractable `CryptoKey`** — usable for encrypt/decrypt but never
  exportable to bytes from JS.
- **Record encryption** — AES-GCM with a fresh 96-bit random IV per record;
  **AAD = `utf8("<table>:<primaryKey>:<fieldSchemaVersion>")`** so a ciphertext
  cannot be relocated/swapped to another record or table undetected. Stored as
  `_enc = { iv, ciphertext }` alongside the plaintext index fields.
- **DEK wrapping** — AES-KW (RFC 3394 key wrap; deterministic, no IV). The DEK is
  exported `raw` and wrapped by a per-mode KEK; unwrap yields the non-extractable
  session DEK.
- **KEK derivation:**
  - **PIN / passphrase** — PBKDF2-HMAC-SHA256, 600k iterations, 32-byte random
    salt → `deriveKey` → AES-KW-256 KEK (`extractable:false`,
    `['wrapKey','unwrapKey']`). Reuses the retired Electron envelope's parameters.
  - **Biometric** — WebAuthn PRF output → HKDF-SHA256 (`info` =
    `"interviewer-v8-dek-wrap"`, per-vault random salt) → AES-KW-256 KEK.

### WebAuthn PRF flow

Enrollment (biometric):

1. Generate the DEK (extractable, AES-GCM-256).
2. `navigator.credentials.create()` a **platform** passkey — `residentKey:
'preferred'`, `userVerification: 'required'`, `authenticatorAttachment:
'platform'`, `extensions: { prf: {} }`. The single-user `user.id` is a stable
   local handle (e.g. the installation id); no user identifier is introduced.
3. `navigator.credentials.get()` with `allowCredentials: [newCredId]`,
   `extensions: { prf: { eval: { first: prfSalt } } }`, `userVerification:
'required'` → 32-byte PRF secret. (A follow-up `get()` is used because some
   platforms do not return PRF results at `create()` time.)
4. HKDF(PRF) → KEK_bio; AES-KW-wrap the DEK → `wrappedDek_bio`.
5. Capture the **recovery passphrase** → PBKDF2 → KEK_rec; wrap the DEK →
   `wrappedDek_rec`.
6. Drop the extractable DEK handle. Persist the vault record.

Unlock (biometric): `get()` with `allowCredentials:[credId]`, `prf.eval.first =
prfSalt`, `uv:'required'` → PRF → HKDF → KEK_bio → `unwrapKey(wrappedDek_bio)` →
session DEK. Recovery unlock: passphrase → PBKDF2 → KEK_rec →
`unwrapKey(wrappedDek_rec)`.

`isPrfSupported()` gates biometric enrollment; where PRF is unavailable the
wizard offers only PIN/passphrase.

### Auth modes (post-teardown set)

- `pin` — 8 digits, PBKDF2 → KEK → wraps DEK → encrypted store.
- `passphrase` — ≥12 chars / ≥3 classes, same envelope.
- `biometric` — WebAuthn PRF **dual-wrapped** with a recovery passphrase.
- `none` — no DEK; plaintext store (wrapper passthrough). Wizard copy states the
  implication.

Only one primary mode per vault, except `biometric` which always carries the
recovery passphrase. Mode switching still requires `revoke()` (wipes data +
deletes the passkey best-effort). Step-up verify (enter/exit/export gates) re-runs
the mode's unlock without toggling the global gate — a fresh biometric `get()`
re-prompts Touch ID / Windows Hello — preserving `StepUpAuthProvider` behaviour.

### Vault record & session state

- **Vault record** — a dedicated unencrypted Dexie table holding only wrapped key
  material + params: `{ version, mode, kdf: { salt, iterations }, wrappedDek,
webauthn?: { credentialId, prfSalt }, recovery?: { salt, iterations,
wrappedDek } }`. One record (single-user). Safe at rest (no plaintext key).
- **Session state** — the unlocked non-extractable DEK is held in the vault /
  `AuthContext` until lock / idle / blur. **Reload re-locks** (the DEK cannot be
  safely persisted across reload); this replaces the old
  `interviewer-v8:web-unlocked` `sessionStorage` flag and is stricter by design.

### Module layout

- `crypto.ts` — `generateDek`, `wrapDek`/`unwrapDek` (AES-KW),
  `deriveKekFromPassword` (PBKDF2), `deriveKekFromPrf` (HKDF),
  `encryptRecord`/`decryptRecord` (AES-GCM + AAD).
- `webauthn.ts` — `enrollBiometric`, `unlockBiometric`, `isPrfSupported`.
- `vaultStore.ts` — read/write the single vault record.
- `vault.ts` — orchestration: `enrol{Pin,Passphrase,Biometric,None}`,
  `unlock{...}`, `verify{...}`, `lock`, `revoke`, `reEnrol` — the surface the old
  `electron/auth/vault.ts` exposed, now driving the existing `AuthGate`. Wired in
  via `src/lib/auth/api.ts` (which loses its platform dispatch).

## Workstream B2 — Encrypted-table wrapper (`src/lib/db/encryptedTable.ts`)

Our "own middleware," Web-Crypto, async-safe by construction (crypto happens
_between_ Dexie operations, never inside a live transaction).

- `encryptedTable(table, getDek, { name, encryptedFields })` returns a typed
  facade over a Dexie `Table`.
- **Writes** (`put`/`add`/`bulkPut`) — encrypt the sensitive fields with the
  session DEK → persist `{ ...plaintextIndexFields, _enc, _v }`.
- **Reads** (`get`/`bulkGet`) — fetch → decrypt `_enc` after the transaction
  closes → merge fields back.
- **Pagination** (`queryPage`) —
  `.orderBy(index).offset().limit().primaryKeys()` reads **keys only** (cursor
  never carries ciphertext), then `bulkGet` + batch-decrypt the page. This keeps
  async crypto out of cursor traversal — the crux constraint.
- **`none` mode** (no DEK) — passthrough (plaintext, no `_enc`).
- The repos in `src/lib/db/db.ts`, `protocols.ts`, `sessions.ts` are refactored
  to construct their tables **only** through the wrapper, so an encrypted table
  cannot be written in the clear ("can't forget to encrypt").

**Plaintext index boundary** (everything else encrypted):

- **sessions** — `{ id, protocolId, status, createdAt, updatedAt }` plaintext;
  `caseId`, the network graph (nodes/edges/ego attributes), stage/step state, and
  notes encrypted.
- **protocols** — `{ id, hash }` plaintext; name, description, protocol JSON, and
  asset Blobs encrypted. (The deck/DataView render post-unlock, so encrypting
  metadata costs nothing.)
- **settings** — non-sensitive; unencrypted (mirrors the vault record table).

Rationale: metadata visible at rest is limited to _how many_ sessions exist, for
_which_ protocol, their status, and _when_ — never participant identity or
collected data. DataView's filter/sort/paginate run on the plaintext indices;
its text search decrypts the current page client-side.

## Workstream C — PWA shell + updates

Mirror `apps/architect-web`, adapted for a client interview app.

- **Plugin** — add `vite-plugin-pwa` (`generateSW`, `registerType: 'prompt'`,
  `devOptions.enabled: false`) to `vite.config.ts` (the web build; Electron is
  gone). Add `workbox-window` as an explicit dep — **without it the SW silently
  never registers** (known trap).
- **Manifest + icons** — `pwa-assets.config.ts` via `@vite-pwa/assets-generator`,
  sourced from the existing `assets/` brand icons (repurpose the deleted
  `generate-icon-assets` logic). Manifest: `name` "Network Canvas Interviewer",
  `display: standalone`, `start_url`/`scope` `/`, theme/background from the app's
  resolved tokens.
- **Registration** — mounted unconditionally (not install-gated), per the
  architect-web lesson and because offline field use is core.
- **Caching** — precache `**/*.{js,css,html}` + manifest/icons;
  `navigateFallback: index.html`; `cleanupOutdatedCaches`, `clientsClaim`.
  Runtime: images/fonts `CacheFirst`; **Mapbox tiles/search network-only** (never
  cached). **Raise `maximumFileSizeToCacheInBytes` past 4 MB and/or code-split** —
  `mapbox-gl` + the interview engine produce large chunks that would otherwise
  silently drop out of precache and break offline boot; add a build-time
  chunk-size assertion.
- **Update UX** — port `PwaUpdateBanner` (`useRegisterSW`, hourly
  `registration.update()`, silent update within a ~20s fresh-load window,
  otherwise a "new version available — your work is saved — Reload" banner),
  **plus a session-aware guard**: while an interview route is active / a session
  is in progress, suppress both the silent fresh-load update and the reload
  action, deferring until the interview finishes or the user returns Home.
- **Install nudge** — port `PwaInstallNudge` + `installPrompt.ts`
  (`beforeinstallprompt` captured pre-React); dismissal persisted to
  `localStorage`.
- **Durability** — call `requestPersistentStorage()` on startup (reuse
  `src/lib/platform/storage.ts`) and surface persisted/quota state in Settings /
  StatusRow. Critical: without it, participant data can be evicted under storage
  pressure.
- **Deployment cache headers** — the host must serve `sw.js`/`registerSW.js`/
  `index.html` with `no-cache` and content-hashed `/assets/*` as `immutable`
  (architect-web uses Netlify `_headers`). Confirm interviewer-v8's host and add
  the equivalent, or updates won't propagate.

## Workstream D — Offline UX

- **Connectivity signal** — a `useOnlineStatus` hook (`navigator.onLine` +
  `online`/`offline` events) exposed via a small provider in `AppProviders`.
- **Geospatial warning** — reuse `protocolRequiresInternet()`. Starting a session
  for an internet-requiring protocol **while offline** shows a warning that
  **allows proceeding** (per requirement). Show a persistent offline indicator
  when a Geospatial stage is reached offline, and give the Geospatial error
  boundary (`packages/interview/.../Geospatial.tsx`) an offline-aware message
  instead of a generic failure.
- Mapbox stays network-only; no tile precaching.

## Components / units

| Unit                                                | Responsibility                                       | Depends on                                      |
| --------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| Native teardown (A)                                 | Delete Electron/Capacitor, collapse platform fork    | —                                               |
| `src/lib/vault/crypto.ts`                           | Web Crypto primitives + record encrypt/decrypt (AAD) | `SubtleCrypto`                                  |
| `src/lib/vault/webauthn.ts`                         | WebAuthn PRF enroll/unlock, `isPrfSupported`         | WebAuthn API                                    |
| `src/lib/vault/vaultStore.ts`                       | Persist the single wrapped-key vault record          | Dexie                                           |
| `src/lib/vault/vault.ts`                            | Enrol/unlock/verify/lock/revoke orchestration        | crypto, webauthn, vaultStore                    |
| `src/lib/db/encryptedTable.ts`                      | Encrypted Dexie table facade (write/read/paginate)   | vault DEK, Dexie                                |
| `src/lib/db/{db,protocols,sessions}.ts`             | Route all storage through the wrapper                | encryptedTable                                  |
| `vite.config.ts` PWA block + `pwa-assets.config.ts` | SW/manifest/icons config                             | `vite-plugin-pwa`, `@vite-pwa/assets-generator` |
| `PwaUpdateBanner` (+ session-aware guard)           | Update prompt, no reload mid-interview               | `virtual:pwa-register/react`                    |
| `PwaInstallNudge` + `installPrompt.ts`              | Install offer                                        | `beforeinstallprompt`                           |
| `useOnlineStatus` + offline warning                 | Connectivity signal + Geospatial warning             | `protocolRequiresInternet`                      |

## Testing

- **Vitest units:**
  - `crypto` — wrap/unwrap round-trip; PBKDF2 and HKDF KEK derivation;
    encrypt→decrypt round-trip; **AAD-tamper and wrong-key both reject**.
  - `encryptedTable` — write→read round-trip; `queryPage` pagination ordering;
    `none`-mode passthrough; decrypt failure surfaces (no silent plaintext leak).
  - `vault` — enrol/unlock/verify/revoke per mode; biometric **dual-wrap**
    recovery unlock; step-up verify re-prompts without toggling the gate.
  - `useOnlineStatus`; the session-aware update guard (no reload while a session
    is active).
  - **File I/O (A.1)** — `download.ts` selects Web Share when `canShare({files})`
    is true and falls back to `<a download>` (mock `navigator.share`/`canShare`);
    `pickFile.ts` accepts a `.netcanvas` under the relaxed `accept`; the bundled
    sample/development protocols install through the import pipeline **with no
    network fetch**, and the removed URL-import path is gone from the dialog.
- **WebAuthn** is mocked in jsdom (PRF cannot run there); unlock forms and the
  offline warning are covered in Storybook interaction tests.
- **Build assertion** — production build emits `sw.js`, `manifest.webmanifest`,
  icons, and no precache-excluded critical chunk.
- **No local e2e/Playwright** — CI owns it (repo convention).

## Design-validation spikes (do early)

1. **WebAuthn PRF** — confirm the create()+get() PRF flow and `isPrfSupported`
   gating on Chrome/Edge and Safari 18+; confirm platform-authenticator UV
   prompts.
2. **Dexie 4 pagination pattern** — confirm `primaryKeys()` + `bulkGet` +
   batch-decrypt holds under the async-crypto constraint with no transaction
   errors.
3. **Bundle/precache** — measure `mapbox-gl` + interview-engine chunk sizes
   against the precache limit; set the limit / code-split accordingly.

## Alternatives considered (not chosen)

- **`dexie-encrypted`** — transparent and sync-crypto-clean, but uses tweetnacl
  (raw key bytes in JS, no non-extractable `CryptoKey`), classifies sensitivity
  _implicitly by index_ (a footgun), lacks AAD binding, and is a lightly
  maintained dep historically targeting Dexie 3. Rejected in favour of the small
  Web Crypto wrapper we control.
- **`DBCore` middleware with Web Crypto** — transparent, but async crypto fights
  IndexedDB transaction liveness (the reason `dexie-encrypted` uses sync crypto);
  cursor decryption is the sharp edge. Rejected — the wrapper sidesteps it.
- **OS-disk-encryption + unlock gate only** — no app-layer encryption; a
  regression from SQLCipher for the sole data home. Rejected.
- **Keep native + add PWA** — dual-stack complexity; the whole point is to remove
  native. Rejected.

## Risks / notes

- **WebAuthn PRF support is uneven** — gate biometric enrollment on
  `isPrfSupported()`; PIN/passphrase is always available. Document supported
  browsers.
- **User clears site data / storage eviction → data loss** — inherent to the web
  platform. Mitigate with `requestPersistentStorage()` and export reminders;
  cannot be fully eliminated.
- **Precache size** — large chunks silently dropping from precache would break
  offline boot; the chunk-size assertion + raised limit / code-split guard this.
- **`none` = plaintext** — surfaced explicitly in the setup wizard.
- **Reload re-locks** — stricter than today's web (which persisted an unlock flag
  across reloads); correct for an encrypted app, but a UX change to communicate.
- **Recovery passphrase in the biometric flow** — needs UI in the setup wizard
  and `ManageAuthenticator`; the vault record carries a second wrapped-DEK.
- **Analytics offline** — PostHog is off-by-default and fire-and-forget; confirm
  it degrades silently rather than erroring offline.
- **Changeset** — not required; interviewer-v8 is unreleased.
