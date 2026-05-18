# Network Canvas Interviewer v7 — Implementation Plan

> Companion to [`SPEC.md`](./SPEC.md). This plan turns the spec into ordered, testable milestones grounded in the existing prototype in `apps/modern-interviewer/`. It is one deliverable; the milestones exist to sequence execution, not to phase the rollout.

## Overview

Network Canvas Interviewer v7 is the next-generation Interviewer app. A working prototype already exists at `apps/modern-interviewer/` — ~4,000 LOC of TypeScript/React, with Electron (desktop) + Capacitor (tablet) + Vite (web) build chains, IPC bridges, encrypted SQLCipher storage, Dexie storage for non-Electron targets, an Effect-TS export pipeline wiring `@codaco/network-exporters`, a working WebAuthn (PRF) path, and an asset-resolver layer that feeds the `@codaco/interview` Shell.

The plan keeps that working core intact and reshapes only the four areas where the updated SPEC moved the goalposts:

1. **Brand**: rename the workspace package + folder; sweep user-visible strings to "Network Canvas Interviewer v7".
2. **Auth**: drop the passphrase code path everywhere. WebAuthn becomes the sole authentication mechanism, and on desktop it additionally releases the AES key that decrypts on-device storage via envelope encryption (PRF → KEK → wrap/unwrap a random DEK that opens SQLCipher).
3. **Settings**: remove biometric/passphrase/security-toggle rows; replace with a "Manage authenticator" sub-panel.
4. **Home screen**: rewrite to match `Variation F - Minimal Stage.html` from the Claude Design handoff bundle — dark cinematic stage, animated `@codaco/art` blobs, NC-Mark + wordmark top-left, Import/Data/Settings pills top-right, fanned protocol deck centre, conditional resume pill, single-line status row at the foot.

UI rule throughout: reuse and extend existing `@codaco/fresco-ui` components first; fall back to `@base-ui/react` + `motion` for primitives fresco-ui doesn't ship; fall back to `@codaco/art` for the blob background. Everything else in the prototype (protocol import pipeline, export pipeline, asset resolver, dual storage facade, route layout) is preserved as-is and documented in the [Invisible Knowledge](#invisible-knowledge) section so the docs catch up with the code.

## Planning Context

### Decision Log

| Decision                                                                                                                                       | Reasoning Chain                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Targeted rewrite (Home + auth + Settings only) over greenfield                                                                                 | Greenfield discards ~4000 LOC of working IPC, Dexie/SQLCipher dual-store, asset resolver, Effect export pipeline → none of which change in the spec → re-solving them would only introduce regression risk → targeted rewrite touches just the SPEC-delta areas.                                                                                                                              |
| Rename `apps/modern-interviewer` → `apps/interviewer-v7` and `@codaco/modern-interviewer` → `@codaco/interviewer-v7`                           | User-confirmed via AskUserQuestion → product name shifts to "v7" → keeping the old folder name would mean every grep/CI/docs reference drifts → one clean rename now beats long-tail churn.                                                                                                                                                                                                   |
| WebAuthn (PRF) is the sole authentication mechanism; remove all passphrase code paths                                                          | SPEC §Security: "Web Authentication API as its sole authentication mechanism" → user instruction "Remove content about biometrics, as this is a side effect of the web authentication API" → any passphrase fallback would re-introduce the surface the spec just removed → delete passphrase paths in both `electron/auth/*` and `src/lib/auth/*`.                                           |
| Keep DEK indirection on desktop (envelope encryption: PRF → KEK → wrap a random DEK; DEK opens SQLCipher) over direct-key SQLCipher with PRF   | Re-enrolment with a new authenticator must not require re-encrypting the whole database → direct-key would force a full re-encrypt on every credential rotation → envelope encryption keeps the on-disk DEK constant and just re-wraps it → standard practice for at-rest encryption with rotatable user keys.                                                                                |
| Drop the encrypted web/tablet renderer-side vault (`src/lib/auth/crypto.ts`, `src/lib/auth/vault.ts`) entirely                                 | SPEC §Storage paragraph 4: "On tablet and web, storage relies on the platform's own at-rest protections; Web Authentication is used to gate access to the running app rather than to derive a storage key." → keeping a renderer-side passphrase-derived vault would contradict the spec → simpler model: WebAuthn gates the app; Dexie data sits behind the platform's existing protections. |
| Gate the web build with WebAuthn the same as desktop/tablet (no dev-bypass env flag)                                                           | User-confirmed via AskUserQuestion → keeps the auth flows exercised across all targets → divergence between web and native auth would create separate bug surfaces.                                                                                                                                                                                                                           |
| Implement Variation F as handed off; defer the unanswered iteration ("split protocol selector and protocol meta into two side-by-side panels") | User-confirmed via AskUserQuestion → the design bundle's chat transcript ends with the user asking for the split but the design wasn't iterated yet → implementing it now would require unbacked design judgement → faithful to the bundle, flag as a follow-up.                                                                                                                              |
| Preserve `isElectron`-based platform facade in `src/lib/db/api.ts`                                                                             | Existing pattern works → SPEC §Storage explicitly requires platform-specific behaviour (encrypted desktop, platform-protected elsewhere) → the facade is the right abstraction for that split.                                                                                                                                                                                                |
| `@codaco/network-exporters` Effect pipeline used as-is via `src/lib/export/exportSessions.ts`                                                  | Working code with documented Effect 3 + Layer-based wiring → SPEC's export requirements (GraphML, CSV, screen-coords, zip) are already implemented → no reason to change.                                                                                                                                                                                                                     |
| `fresco-ui` first; `@base-ui/react` + `motion` fallback; `@codaco/art` for blobs                                                               | User instruction in the planning prompt → workspace catalog confirms all three available → prototype already uses 28 distinct fresco-ui modules → the new Home design's animated blobs and fanned deck have no fresco-ui equivalent so the fallback rule is necessary.                                                                                                                        |
| Idle timeout default 15 min; options 1/5/15/30/60                                                                                              | SPEC §Auto-lock specifies these values verbatim.                                                                                                                                                                                                                                                                                                                                              |
| `BLUR_LOCK_DELAY_MS = 30_000` preserved                                                                                                        | Existing in `src/lib/auth/AuthContext.tsx` → SPEC says "extended focus loss" → 30s matches that intent and is already proven in the prototype.                                                                                                                                                                                                                                                |
| Export sink: Electron uses `dialog:saveFile` IPC; Capacitor uses `@capacitor/filesystem`; web uses `Blob`+`saveAs`                             | SPEC §Data export + existing platform-aware helpers in `src/lib/files/download.ts` → no change needed.                                                                                                                                                                                                                                                                                        |
| Single-deliverable framing in the plan prose; milestones are an execution detail                                                               | User memory: "No phased rollouts. Present designs as a single deliverable" → milestones exist for ordered execution + per-step verification, not as a public rollout schedule.                                                                                                                                                                                                                |
| Work on a branch (no worktree)                                                                                                                 | User memory: "Work directly on branches, skip git worktrees".                                                                                                                                                                                                                                                                                                                                 |

### Rejected Alternatives

| Alternative                                                      | Why Rejected                                                                                                                                                                       |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Greenfield rewrite of `apps/modern-interviewer/src/`             | Discards 4,000 LOC of working IPC bridges, asset resolver, Effect export pipeline, dual-store facade — none of which the SPEC changes. Would be pure churn.                        |
| Keep passphrase as a fallback unlock                             | Contradicts the spec's "sole authentication mechanism" language and the user's instruction to remove biometric/passphrase surface. Reintroduces the very surface the SPEC removed. |
| Direct-key SQLCipher with the PRF output (no DEK indirection)    | Would force a full database re-encrypt on every authenticator re-enrolment. Envelope encryption with a random DEK keeps re-enrol O(1).                                             |
| `DEV_BYPASS_AUTH` env flag for web dev                           | User chose parity. Divergence between web and native auth would create separate bug surfaces.                                                                                      |
| Implement the pending design iteration (side-by-side panels) now | The design isn't in the handed-off bundle. Building from chat-transcript intent alone means unbacked judgement on panel sizes, transitions, content distribution.                  |
| Skip the WebAuthn gate on web entirely                           | User chose parity. Web build is dev-focused but still on the same auth surface.                                                                                                    |

### Constraints & Assumptions

- **Technical**: React 19; TypeScript 6 strict (no `any`, no `as` assertions to bypass type checking — per user CLAUDE.md); Tailwind 4 via `@tailwindcss/vite`; wouter routing; Effect 3 for export pipeline; jszip; Dexie 4 (renderer); `better-sqlite3-multiple-ciphers` (Electron main, requires `electron-rebuild`); WebAuthn PRF extension required on desktop (hard requirement, no fallback).
- **Tooling**: Biome formatter/linter (`pnpm lint:fix`); pre-commit hook formats staged files; `pnpm typecheck` must pass before commit (project CLAUDE.md).
- **Style**: tabs for indentation; 120-char line width; double quotes; no barrel files (project + user CLAUDE.md); no re-exports for convenience; check before exporting (user CLAUDE.md).
- **Dependencies (workspace)**: `@codaco/interview`, `@codaco/fresco-ui`, `@codaco/protocol-validation`, `@codaco/shared-consts`, `@codaco/network-exporters`, `@codaco/art`, `@codaco/tailwind-config`.
- **Dependencies (catalog)**: `@base-ui/react`, `motion`, `lucide-react`, `class-variance-authority`.
- **Capacitor**: 8.x with `@capacitor/{app, core, ios, android, filesystem, preferences}`.
- **Electron**: catalog version, `electron-vite` build, `electron-builder` packaging.
- **Defaults applied**: `default-conventions:file-creation` (extend existing files unless distinct-module trigger applies); `default-conventions:test-organization` (co-located `__tests__/` directories with `.test.ts` files, per project CLAUDE.md).

### Known Risks

| Risk                                                                                                                                                                                                                                                                                      | Mitigation                                                                                                                                                                                                                                                                                                                                                                          | Anchor                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Renaming `apps/modern-interviewer` → `apps/interviewer-v7` breaks Capacitor native projects (`ios/`, `android/`) that may hold absolute paths embedded by `cap add`                                                                                                                       | Test `capacitor:sync` + `capacitor:run` on both platforms after rename. If either breaks, regenerate native projects: `pnpm exec cap add ios && pnpm exec cap add android` under the new directory and commit the rebuild. The capacitor config itself is path-relative.                                                                                                            | `apps/modern-interviewer/capacitor.config.ts:7` — `webDir: "dist"` is relative                                                      |
| Renaming the package breaks downstream workspace imports                                                                                                                                                                                                                                  | Cross-grep showed zero imports of `@codaco/modern-interviewer` from outside the app folder. `pnpm-workspace.yaml` uses the `apps/*` glob — no edit required.                                                                                                                                                                                                                        | `grep -r @codaco/modern --include="*.json" --include="*.ts"` returned only `apps/modern-interviewer/*` files                        |
| WebAuthn PRF extension unsupported on a user's OS/browser, blocking setup with no recovery path                                                                                                                                                                                           | Probe PRF support up-front: after `navigator.credentials.create`, if `getClientExtensionResults().prf?.results?.first` is undefined, fall back to a second `authenticatePasskey` call to elicit PRF; if that also returns nothing, fail setup with an explicit error message in `SetupScreen.tsx`.                                                                                  | `src/lib/auth/webauthn.ts:91-101` — `if (prfOnCreate) return ok; const result = await authenticatePasskey(...)`                     |
| Interview-mode design tokens (`--iv-bg`, `--iv-edge`, `--paradise-pink`, `--sea-green`, `--font-display`, etc.) may not be exposed by `@codaco/tailwind-config/fresco.css`; design bundle's own `fresco-interview.css` notes that the shipped Architect tokens omit the Interview palette | M8 starts with a 30-min spike: open `tooling/tailwind/fresco/` and ripgrep for `--iv-bg`, `--paradise-pink`, `--font-display`. If absent, copy the relevant `:root` token block from `/tmp/design-fetch/.../lib/fresco-interview.css` into `apps/interviewer-v7/src/styles/globals.css` under a labelled "Interview-mode tokens (TODO: move into @codaco/tailwind-config)" comment. | `/tmp/design-fetch/interviewer-7-start-screen-2/project/lib/fresco-interview.css:1-3` — explicit warning comment                    |
| `@codaco/art` `BackgroundBlobs` uses RGB gradient pairs, not the design's named oklch palette — naive use won't match Variation F                                                                                                                                                         | M10 — pass a custom palette of resolved RGB pairs derived from the oklch tokens. Extend `BackgroundBlobs` with an opt-in `palette?: Array<[string, string]>` prop; default behaviour unchanged.                                                                                                                                                                                     | `packages/art/src/BackgroundBlobs/BackgroundBlobs.tsx:23-34` — `gradients` is a hardcoded array of RGB pairs                        |
| Motion + canvas blobs may stutter on lower-end tablets (iPad 6th gen, mid-tier Android)                                                                                                                                                                                                   | `StageBackground` honours `prefers-reduced-motion` and falls back to a static SVG/CSS radial gradient. Add a one-time perf check during M10 — first paint TTI + frame rate at 60fps target on iPad sim/Android emulator.                                                                                                                                                            | hypothetical risk, no code claim                                                                                                    |
| `better-sqlite3-multiple-ciphers` is a native module; rename may not auto-rebuild for the new path                                                                                                                                                                                        | Run `pnpm --filter @codaco/interviewer-v7 electron:rebuild` at end of M1. The script is already wired.                                                                                                                                                                                                                                                                              | `apps/modern-interviewer/package.json:28` — `"electron:rebuild": "electron-rebuild -f -w better-sqlite3-multiple-ciphers"`          |
| Renderer-side web vault (`src/lib/auth/crypto.ts`, `src/lib/auth/vault.ts`) currently uses a passphrase-derived KEK; removing passphrase means deciding whether to keep an encrypted blob or drop the renderer vault entirely                                                             | Decision: drop entirely. SPEC says tablet/web don't derive a storage key. `vaultMetadata.ts` stores `credentialId`+`salt` only — via `@capacitor/preferences` on Capacitor, `localStorage` on web.                                                                                                                                                                                  | `src/lib/auth/crypto.ts:5,36,94` + SPEC §Storage paragraph 4                                                                        |
| Electron `dialog:saveFile` IPC payload is `Uint8Array`; large zip exports (sessions with many image assets) could exceed structured-clone size limits                                                                                                                                     | Acceptable for now since exports are O(MB) not O(GB). Add a TODO to switch to `ReadableStream` if a session approaches IPC limits.                                                                                                                                                                                                                                                  | `electron/main.ts:80-92` — handler receives `payload: Uint8Array` and writes via `writeFile(result.filePath, Buffer.from(payload))` |

## Invisible Knowledge

### Architecture — process boundaries

```
+-----------------------------------------------+
|                  Renderer                     |
|  React 19 + wouter + fresco-ui + base-ui +    |
|  motion + @codaco/art                         |
|                                               |
|  AppProviders > AuthGate > AppShell           |
|    > Routes (Home / Protocols / Sessions /    |
|       Settings / Interview)                   |
|                                               |
|  src/lib/db/api.ts      (platform facade)     |
|  src/lib/auth/*         (WebAuthn client)     |
|  src/lib/protocol/      (import pipeline)     |
|  src/lib/export/        (Effect export)       |
+-------------|------------------|--------------+
              | isElectron?      | navigator.credentials
              v                  v               (browser/Capacitor)
+-------------v-----------+   +--v--------------------------+
| Electron preload        |   | Capacitor / Web             |
| contextBridge           |   | - Dexie 4 (IndexedDB)       |
| window.api.{db, auth,   |   | - @capacitor/filesystem     |
|   dialog, system}       |   |   for export save           |
+-------------|-----------+   | - @capacitor/preferences    |
              |               |   for auth metadata         |
              v               | - WebAuthn for app gate     |
+-------------v-----------+   |   (no storage key)          |
| Electron main           |   +-----------------------------+
| - IPC handlers          |
| - auth/vault.ts         |
|   (PRF → KEK → DEK)     |
| - db/service.ts         |
|   (SQLCipher)           |
| - dialog.openProtocol   |
| - dialog.saveFile       |
+-------------------------+
```

### Architecture — auth flow

```
Setup (first launch)
--------------------
SetupScreen.enrol()
  -> navigator.credentials.create(prf eval first = random salt)
  -> credentialId, prfOutput
  desktop:  ipc auth:setup(credentialIdB64, saltB64, prfOutputB64)
            main.vault.setup():
              DEK = randomBytes(32)
              KEK = importKey(prfOutput, AES-GCM)
              wrappedDEK = AES-GCM(KEK, DEK)
              write VaultRecord{ credentialIdB64, saltB64, wrapIv, wrapCt }
              openDatabase(DEK hex)
  tablet/web: vaultMetadata.write({ credentialIdB64, saltB64 })
              renderer holds an in-memory unlock flag

Unlock (subsequent launches)
----------------------------
LockScreen.unlock()
  -> read vaultMetadata -> credentialId + salt
  -> navigator.credentials.get(allowCredentials, prf eval first = salt)
  -> prfOutput
  desktop:  ipc auth:unlock(prfOutputB64)
            main.vault.unlock():
              KEK = importKey(prfOutput, AES-GCM)
              DEK = AES-GCM-decrypt(KEK, wrappedDEK)
              openDatabase(DEK hex)
  tablet/web: renderer sets the in-memory unlock flag

Lock
----
desktop:    ipc auth:lock -> closeDatabase + zero in-memory key
tablet/web: drop in-memory flag
```

### Data flow — protocol import

```
pickProtocolFile()  (Electron: dialog:openProtocol; web/Capacitor: <input type=file>)
       |
       v
File / { name, data: Uint8Array }
       |
       +--- importProtocolFromFile(file)           importProtocolFromUrl(url)
       |          |                                       |
       |          v                                       v
       |    Uint8Array(buffer)                       fetch(url) -> Uint8Array
       |
       v
extractZip(JSZip)  ->  { protocol json, ExtractedAsset[] }
       |
       v
detectSchemaVersion(json)
       |
       (!= APP_SCHEMA_VERSION) ? getMigrationInfo + migrateProtocol : passthrough
       |
       v
validateProtocol(json)  ->  CurrentProtocol | issues[]
       |
       v
hashProtocol(validated)
       |
       v
saveProtocol(validated, hash, assets)
       |
       +--- isElectron ? ipc db:saveProtocol (SQLCipher transaction)
                       : dexie put (protocol + assets table)
```

### Data flow — bulk export

```
ExportDialog selects sessionIds + options
       |
       v
runExport({ options, sessionIds, onEvent })  [src/lib/export/exportSessions.ts]
       |
       v
Effect program:
  Queue<ExportEvent> + Stream.runForEach(onEvent)
  exportPipeline(sessionIds, options, queue) [from @codaco/network-exporters]
    InterviewRepository.getForExport(ids)  --> getSessionsByIds (db/api)
    ProtocolRepository.getProtocols(hashes) --> getProtocolsByHashes (db/api)
    ZipOutput sink                          --> Blob in renderer
       |
       v
{ blob, url, fileName }
       |
       +--- isElectron ? ipc dialog:saveFile (writes via fs/promises)
                       : download via Blob + saveAs (browser) or @capacitor/filesystem
       |
       v
markSessionsExported(ids) -> updates exportedAt timestamp
```

### Why this structure

- **`src/lib/db/api.ts` facade**: SPEC §Storage requires different storage at-rest behaviour per platform (encrypted SQLCipher on desktop, platform-protected Dexie elsewhere). The facade isolates that split so routes/components don't branch on `isElectron`.
- **Renderer-side WebAuthn, main-process key custody**: WebAuthn lives in the browser/renderer (no Node WebAuthn surface). The PRF output is transported to the Electron main process via a one-shot IPC and never persisted there; the wrapped DEK is the only durable artefact. This keeps the key-handling minimal-surface.
- **Effect-TS pipeline for export**: the export pipeline composes multiple repositories, an event stream, and a sink Layer; Effect's `Layer.mergeAll` cleanly assembles the renderer-specific Layers (in-renderer repositories + Blob sink) without leaking implementation details into the shared `@codaco/network-exporters` package.
- **fresco-ui first**: every component in this repo that needs a Button, Surface, Form, Dialog, Toast, or typography token should reach for fresco-ui first. Falling back to `@base-ui/react` + `motion` is reserved for visual primitives fresco-ui doesn't ship (the fanned protocol deck animation, the translucent-blur pill treatment, the animated blob background).

### Invariants

- **Single-user**: there is no concept of users in the schema. `installationId` identifies the device, not a user. No code path may introduce a user identifier.
- **Auth gate is unconditional**: after M6, every platform shows the AuthGate before any data view renders. The renderer has no "security disabled" branch.
- **Desktop database is never opened without a successful unlock**: `electron/db/service.ts:openDatabase` is only called from `vault.setup()` or `vault.unlock()`, both of which require a PRF output. There is no fallback open path.
- **Re-enrolment is atomic**: `vault.reEnrol()` writes the new `VaultRecord` only after the new wrap succeeds. The old record is preserved until then so a failed re-enrol leaves the previous credential usable.
- **Protocol hash identifies a protocol uniquely**: `hashProtocol(validated)` produces a stable hash; sessions reference protocols by hash, not by id. Cascade-delete is keyed on hash.

### Tradeoffs

| Decision                                                        | Cost                                                                            | Benefit                                                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Envelope encryption (PRF → KEK → DEK) over direct-key SQLCipher | Slightly more code in `vault.ts`; one extra in-memory transformation per unlock | Re-enrolment is O(1); no full DB re-encrypt; the on-disk key remains constant across credential rotation          |
| WebAuthn-only (no passphrase fallback)                          | Users without PRF support cannot use the app; no account recovery path          | Strong, modern auth; smallest possible auth surface; spec-aligned                                                 |
| Drop encrypted renderer vault on tablet/web                     | Tablet/web data is platform-protected, not app-encrypted                        | Massive simplification of the renderer auth code; matches what the spec actually says about non-desktop platforms |
| Variation F as handed off                                       | The pending "split selector + meta" iteration is deferred                       | Faithful to the design that exists; no unbacked design judgement                                                  |

## Milestones

### Milestone 1: Workspace rename

**Files**:

- Rename directory: `apps/modern-interviewer` → `apps/interviewer-v7`
- `apps/interviewer-v7/package.json` (edit `name` + `description`)

**Flags**: needs conformance check (first folder rename in this monorepo).

**Requirements**:

- Set `"name": "@codaco/interviewer-v7"`.
- Set `"description": "Network Canvas Interviewer v7 — Vite + React 19 dashboard hosting the @codaco/interview engine, with desktop (Electron) and tablet (Capacitor) targets."`.
- No other workspace edits required (`pnpm-workspace.yaml` uses the `apps/*` glob — auto-picks up the new path).

**Acceptance Criteria**:

- `pnpm install` exits 0.
- `pnpm --filter @codaco/interviewer-v7 typecheck` exits 0.
- `pnpm --filter @codaco/interviewer-v7 electron:rebuild` exits 0 (native module rebinds to new path).
- `pnpm --filter @codaco/interviewer-v7 capacitor:sync` exits 0; `ios/` and `android/` subprojects still resolve.

### Milestone 2: Brand sweep (user-visible strings)

**Files**:

- `apps/interviewer-v7/electron/main.ts`
- `apps/interviewer-v7/capacitor.config.ts`
- `apps/interviewer-v7/electron-builder.config.cjs`

**Requirements**:

- `electron/main.ts:18` — `title: "Network Canvas Interviewer v7"`.
- `capacitor.config.ts:5` — `appName: "Network Canvas Interviewer v7"`.
- `electron-builder.config.cjs` — update comment + `productName: "Network Canvas Interviewer v7"`.

**Acceptance Criteria**:

- `pnpm --filter @codaco/interviewer-v7 electron:dev` shows the new title.
- `rg -i "Modern Network Canvas Interviewer" apps/interviewer-v7/` returns nothing.

### Milestone 3: Backend vault rewrite (WebAuthn-only desktop)

**Files**:

- `apps/interviewer-v7/electron/auth/vault.ts` (rewrite)
- `apps/interviewer-v7/electron/auth/vaultStore.ts` (rewrite `VaultRecord` shape)
- `apps/interviewer-v7/electron/handlers/authHandlers.ts` (drop passphrase IPC; expose enrol / unlock / lock / reEnrol / revoke)
- `apps/interviewer-v7/electron/preload.ts` (mirror handler surface)

**Flags**: needs TW rationale (envelope-encryption choice over direct-key — must be a code comment); needs error review (WebAuthn external dependency: PRF unsupported, credential cancelled, user verification declined).

**Requirements — `vault.ts`** (rewrite around the existing `aesEncrypt`/`aesDecrypt`/`importKekFromBytes` helpers; drop `pbkdf2Sync`, `deriveKekFromPassphrase`, `VERIFIER_PLAINTEXT`, `setup(passphrase)`, `unlock(passphrase)`, `changePassphrase`):

```diff
--- a/electron/auth/vault.ts
+++ b/electron/auth/vault.ts
@@
-import { pbkdf2Sync, randomBytes, webcrypto } from "node:crypto";
+import { randomBytes, webcrypto } from "node:crypto";
 import { closeDatabase, openDatabase } from "../db/service";
 import {
   CURRENT_VAULT_VERSION,
   deleteVault,
   isVaultConfigured,
   readVault,
   writeVault,
   type VaultRecord,
 } from "./vaultStore";

-const PBKDF2_ITERATIONS = 600_000;
-const PBKDF2_HASH = "sha256";
 const KEY_LEN_BYTES = 32;
-const SALT_BYTES = 16;
 const IV_BYTES = 12;
-const VERIFIER_PLAINTEXT = new TextEncoder().encode("modern-interviewer:vault:v2");

 let unlockedKeyHex: string | null = null;
```

New exported surface:

```ts
export async function status(): Promise<{
  configured: boolean;
  locked: boolean;
  credentialIdB64?: string;
  saltB64?: string;
}>;

// WebAuthn PRF derives a KEK that unwraps a random DEK; envelope encryption
// keeps re-enrolment cheap (no full DB re-encrypt).
export async function setup(args: {
  credentialIdB64: string;
  saltB64: string;
  prfOutputB64: string;
}): Promise<{ ok: true } | { ok: false; message: string }>;

export async function unlock(args: {
  prfOutputB64: string;
}): Promise<{ ok: true } | { ok: false; message: string }>;

export async function lock(): Promise<void>;

// Unwraps the DEK with the current PRF, re-wraps with the new PRF, then writes
// the new VaultRecord. The old record persists until the new wrap succeeds.
export async function reEnrol(args: {
  currentPrfOutputB64: string;
  nextCredentialIdB64: string;
  nextSaltB64: string;
  nextPrfOutputB64: string;
}): Promise<{ ok: true } | { ok: false; message: string }>;

export async function revoke(): Promise<void>;
```

**Requirements — `vaultStore.ts`** new shape:

```ts
export type VaultRecord = {
  version: number; // CURRENT_VAULT_VERSION = 3
  credentialIdB64: string;
  saltB64: string;
  wrapIvB64: string;
  wrapCiphertextB64: string; // AES-GCM(KEK, DEK)
};
```

**Requirements — `authHandlers.ts`** — IPC channels: `auth:status`, `auth:setup`, `auth:unlock`, `auth:lock`, `auth:reEnrol`, `auth:revoke`. Remove passphrase channels.

**Acceptance Criteria**:

- Clean profile + Electron boot: setup IPC succeeds; SQLCipher db file created at `userData/`; round-trips data.
- Restart Electron with same authenticator → unlock IPC succeeds; sessions list returns prior rows.
- `pnpm typecheck` green.
- `rg -i "passphrase|pbkdf2" apps/interviewer-v7/electron/` returns no matches.
- `rg -i "passphrase|pbkdf2" apps/interviewer-v7/src/lib/auth/` returns no matches in any file that survives M3 (M4 will finish the renderer side; flagging here catches leaks early).

### Milestone 4: Renderer auth client (passphrase-free)

**Files**:

- `apps/interviewer-v7/src/lib/auth/api.ts` (rewrite)
- `apps/interviewer-v7/src/lib/auth/AuthContext.tsx` (rewrite)
- `apps/interviewer-v7/src/lib/auth/electron.ts` (drop passphrase IPC wrappers)
- `apps/interviewer-v7/src/lib/auth/vaultMetadata.ts` (rewrite as platform metadata store)
- **DELETE** `apps/interviewer-v7/src/lib/auth/vault.ts`
- **DELETE** `apps/interviewer-v7/src/lib/auth/crypto.ts`
- `apps/interviewer-v7/src/global.d.ts` (window.api typings reduced)

**Flags**: needs error review (WebAuthn surface); needs conformance check (first reduction of the auth abstraction to single-mode).

**Requirements — `api.ts`** new surface:

```ts
export function isAuthenticatorSupported(): boolean;
export async function status(): Promise<{
  configured: boolean;
  locked: boolean;
  credentialIdB64?: string;
  saltB64?: string;
}>;
export async function enrol(
  signal?: AbortSignal,
): Promise<{ ok: boolean; message?: string }>;
export async function unlock(
  signal?: AbortSignal,
): Promise<{ ok: boolean; message?: string }>;
export async function lock(): Promise<void>;
export async function reEnrol(
  signal?: AbortSignal,
): Promise<{ ok: boolean; message?: string }>;
export async function revoke(): Promise<void>;
```

`enrol()` calls `webauthn.createPasskey` → on success, `isElectron` ? `ipc auth:setup` : `vaultMetadata.write` + sets in-memory unlock flag.

`unlock()` reads `vaultMetadata` → `webauthn.authenticatePasskey(credentialId, salt)` → `isElectron` ? `ipc auth:unlock` : sets in-memory unlock flag.

**Requirements — `AuthContext.tsx`** target surface:

```ts
export type AuthStateKind = 'loading' | 'unconfigured' | 'locked' | 'unlocked';

export type AuthState = {
  kind: AuthStateKind;
  authenticatorSupported: boolean;
  credentialMetadata?: { credentialIdB64: string; enrolledAt: string };
  idleTimeoutMinutes: 1 | 5 | 15 | 30 | 60;
};

type AuthActions = {
  refresh: () => Promise<void>;
  enrolAuthenticator: (
    signal?: AbortSignal,
  ) => Promise<{ ok: boolean; message?: string }>;
  unlockWithAuthenticator: (
    signal?: AbortSignal,
  ) => Promise<{ ok: boolean; message?: string }>;
  lock: () => Promise<void>;
  reEnrol: (signal?: AbortSignal) => Promise<{ ok: boolean; message?: string }>;
  revoke: () => Promise<void>;
  setIdleTimeoutMinutes: (minutes: 1 | 5 | 15 | 30 | 60) => Promise<void>;
};
```

The `"disabled"` state kind and `securityEnabled` state field are removed entirely.

**Acceptance Criteria**:

- `pnpm typecheck` green.
- `rg -i passphrase apps/interviewer-v7/src/lib/auth/` returns no matches.
- `AuthContext` exposes only the 7 actions above.

### Milestone 5: Setup + Lock screens

**Files**:

- `apps/interviewer-v7/src/components/SetupScreen.tsx` (rewrite)
- `apps/interviewer-v7/src/components/LockScreen.tsx` (rewrite)
- `apps/interviewer-v7/src/components/AuthGate.tsx` (simplify state machine)
- **DELETE** `apps/interviewer-v7/src/components/PasskeyEnrolDialog.tsx`

**Flags**: needs TW rationale (single-CTA vs progressive disclosure of the no-recovery warning).

**Requirements — `SetupScreen.tsx`**:

- Centred card on dark stage; explains: "This device will be secured with your platform authenticator. There is no recovery — losing the authenticator means losing the data on this device."
- Acknowledgement checkbox: "I understand there is no recovery".
- Primary button: "Enrol authenticator" (disabled until checkbox).
- On success → `AuthGate` transitions to unlocked.
- On WebAuthn `NotAllowedError` (user cancelled): toast "Setup cancelled"; stay on SetupScreen.
- On PRF-unsupported (desktop only): error block "Your platform authenticator does not support the PRF extension. Use a different authenticator or device."

**Requirements — `LockScreen.tsx`**:

- Single primary button: "Unlock with authenticator".
- On WebAuthn cancel: stay on LockScreen, button reactivates.
- 30-second `BLUR_LOCK_DELAY_MS` honoured via the existing `useIdleTimer` hook.

**Requirements — `AuthGate.tsx`**:

- Render: `loading` → spinner; `unconfigured` → `<SetupScreen/>`; `locked` → `<LockScreen/>`; `unlocked` → children.

**Acceptance Criteria**:

- Manual flow on Electron clean profile: SetupScreen → enrol → AppShell with Home → quit → relaunch → LockScreen → unlock → Home.
- `pnpm typecheck` green.

### Milestone 6: Tablet/web auth parity

**Files**:

- `apps/interviewer-v7/src/lib/auth/AuthContext.tsx` (drop the `securityEnabled` fallback branch)
- `apps/interviewer-v7/src/lib/auth/vaultMetadata.ts` (already rewritten in M4; verify storage adapter dispatches `@capacitor/preferences` on Capacitor, `localStorage` on web)
- `apps/interviewer-v7/electron/db/service.ts` (drop `securityEnabled` from `DEFAULT_SETTINGS`)
- `apps/interviewer-v7/src/lib/db/db.ts` (drop `securityEnabled` from Dexie default settings)
- `apps/interviewer-v7/src/lib/db/types.ts` (drop `securityEnabled` from `StoredSettings`)

**Flags**: needs error review (Capacitor `@capacitor/preferences` errors on iOS Keychain-locked devices).

**Requirements**:

- `AuthGate` runs unconditionally on every platform.
- Capacitor metadata keys: `auth.credentialId`, `auth.salt` (via `@capacitor/preferences`).
- Web metadata keys: same names via `localStorage`.

**Acceptance Criteria**:

- Capacitor iOS sim cold-launches into SetupScreen; enrolment via Face ID/Touch ID succeeds.
- Capacitor Android cold-launches into SetupScreen; enrolment via fingerprint/PIN succeeds.
- Web (vite dev on https) presents SetupScreen.
- Cold-boot with iOS Keychain locked (device just rebooted, awaiting passcode): `vaultMetadata.read()` either resolves with the empty/unconfigured state or rejects with a recoverable error; the app does **not** crash on the loading screen. If `@capacitor/preferences` rejects, the renderer retries once after the next `@capacitor/app` `resume` event before deciding state.

### Milestone 7: Settings restructure

**Files**:

- `apps/interviewer-v7/src/routes/Settings.tsx` (rewrite)
- `apps/interviewer-v7/src/components/ManageAuthenticator.tsx` (new — Settings sub-panel)

**Flags**: needs TW rationale (Manage authenticator sub-panel vs inline rows).

**Requirements — `Settings.tsx`** sections in order:

1. **Data export** — fresco-ui form fields: `ToggleField` GraphML, `ToggleField` CSV, `ToggleField` "Export node positions as screen-coordinate pixels", `InputField` width (px), `InputField` height (px). Persists via `updateSettings`.
2. **Idle timeout** — fresco-ui `Select/Native` with options 1 / 5 / 15 / 30 / 60 minutes. Persists.
3. **Manage authenticator** — sub-panel summarising credential metadata (truncated `credentialIdB64`, `enrolledAt`) + "Re-enrol authenticator" button + "Revoke" button (red, base-ui Dialog with "This will destroy all data on this device" warning).
   - **Re-enrol flow runs two WebAuthn ceremonies before a single IPC**, to preserve the atomic re-wrap guarantee in `vault.reEnrol`:
     1. `authenticatePasskey(currentCredentialId, currentSalt)` → `currentPrfOutputB64`.
     2. `createPasskey(newSalt)` → `nextCredentialIdB64`, `nextPrfOutputB64`.
     3. Single IPC `auth:reEnrol({ currentPrfOutputB64, nextCredentialIdB64, nextSaltB64, nextPrfOutputB64 })`.
   - If either ceremony fails or is cancelled, abort before the IPC; the previous credential remains usable.
4. **Lock now** — single button calling `lock()`.
5. **Reset to defaults** for export prefs.
6. **Diagnostics** — read-only: platform name (`hostAppName`), storage usage, storage persistence state.

**Acceptance Criteria**:

- Each control persists across page reload.
- Revoke triggers: vault destroyed → AuthGate transitions to `unconfigured` → SetupScreen rendered.
- `pnpm typecheck` green.

### Milestone 8: Variation F Home — brand + top action bar + page shell

**Files**:

- `apps/interviewer-v7/src/routes/Home.tsx` (full rewrite)
- `apps/interviewer-v7/src/components/BrandHeader.tsx` (new)
- `apps/interviewer-v7/src/components/TopActionBar.tsx` (new)
- `apps/interviewer-v7/src/styles/globals.css` (add interview-mode tokens **if** the spike below confirms they're missing)

**Flags**: needs conformance check (interview-mode tokens — see risks); needs TW rationale (translucent-blur visual treatment via cva wrapper around fresco-ui Button is the first use of that pattern in this app).

**Spike at the start of M8**: open `tooling/tailwind/fresco/fresco.css` (and any sibling token files), ripgrep for `--iv-bg`, `--paradise-pink`, `--font-display`. If absent, copy the `:root` block from `/tmp/design-fetch/interviewer-7-start-screen-2/project/lib/fresco-interview.css` into `apps/interviewer-v7/src/styles/globals.css` under a labelled "Interview-mode tokens (TODO: move into @codaco/tailwind-config)" comment block.

**Requirements — `Home.tsx`**:

- Layout: relative full-viewport container; brand top-left absolute, top-action-bar top-right absolute, content area centred, status row bottom. No 1280×900 letterbox — responsive.
- Loads protocols + sessions + settings via existing `db/api` helpers.

**Requirements — `BrandHeader.tsx`**:

- NC-Mark 56×56 (use a `@codaco/fresco-ui` asset if present, else copy `/tmp/design-fetch/.../assets/NC-Mark.svg` into `apps/interviewer-v7/src/assets/`).
- Wordmark "Interviewer" — display font, weight 900, 28px, letter-spacing -0.015em, line-height 1.
- Mono device-id line 12px, `var(--iv-fg-subtle)`; first 6 chars of `installationId`.

**Requirements — `TopActionBar.tsx`**:

- Three buttons: **Import** (calls existing `pickProtocolFile` → `importProtocolFromFile`), **Data** (navigates `/sessions`), **Settings** (navigates `/settings`).
- Visual per design: each 56px-tall pill (Settings 56×56 square) with `backdrop-filter: blur(10px)`, background `oklch(0.34 0.10 281 / 0.85)`, 1px `var(--iv-edge)` border, `var(--shadow-md)`, font-weight 800, font-size 15px.
- Implement by wrapping fresco-ui Button with a `cva`-derived class set (`@codaco/fresco-ui/utils/cva`); if fresco-ui Button class-merging doesn't accept the style cleanly, fall back to a raw `<button>` styled via the same cva utility.

**Acceptance Criteria**:

- At 1440×900 viewport: BrandHeader visible top-left; all three TopActionBar buttons visible top-right; computed background colour matches `var(--iv-bg)` or the radial-gradient over it (verifiable via DOM inspection).
- At 768×1024 (tablet portrait): no element's bounding rect overflows its parent (`getBoundingClientRect()` check on Brand, TopActionBar, content slot, status slot).
- Import button opens the native/browser file picker → completes the existing `importProtocolFromFile` flow → toast appears via fresco-ui `Toast`.
- Data button changes `location.pathname` to `/sessions`; Settings button changes it to `/settings`.

### Milestone 9: Variation F Home — protocol deck + resume pill + status row

**Files**:

- `apps/interviewer-v7/src/components/ProtocolDeck.tsx` (new)
- `apps/interviewer-v7/src/components/ResumePill.tsx` (new)
- `apps/interviewer-v7/src/components/StatusRow.tsx` (new)
- `apps/interviewer-v7/src/routes/Home.tsx` (compose new components)

**Flags**: needs TW rationale (fanned deck animation pattern is new); needs conformance check (motion variants — follow `packages/interview` for existing patterns).

**Requirements — `ProtocolDeck.tsx`**:

- Renders array of stored protocols (max 5 visible at once — beyond 5 the fanned stack stops adding visible cards and the count is reflected in the status row; visual density is the limit, not data). Trailing "Import a protocol" card always present.
- Cards fanned via `motion` variants: initial stacked behind active; hover/focus peek; active card front-and-centre.
- Active card shows protocol name, description, `importedAt`, `sessionCount`.
- "Start new interview" CTA opens the existing `NewSessionDialog`.
- Keyboard: ←/→ cycles cards, Enter starts an interview.

**Requirements — `ResumePill.tsx`**:

- Renders only when `listSessions()` returns at least one session with `finishedAt === null`.
- Shows protocol name + `caseId` of most-recent-updated unfinished session.
- Click navigates to `/interview/:sessionId`; updates `lastActiveSessionId`.

**Requirements — `StatusRow.tsx`**:

- Single bottom-of-stage mono row: `"{N protocols} · {M interviews} · {used}/{quota} used"`.
- Storage info from `src/lib/platform/storage.ts`.

**Acceptance Criteria**:

- No-protocols state: deck shows only the import card.
- With protocols: deck fans; arrow keys cycle; start-interview flow works.
- With an in-progress session: ResumePill visible; click resumes.
- StatusRow shows live counts.

### Milestone 10: Stage background (animated blobs + radial gradient)

**Files**:

- `apps/interviewer-v7/src/components/StageBackground.tsx` (new)
- `apps/interviewer-v7/src/routes/Home.tsx` (wrap shell with `<StageBackground/>`)
- `packages/art/src/BackgroundBlobs/BackgroundBlobs.tsx` (extend with `palette?: Array<[string, string]>` prop)
- `apps/interviewer-v7/package.json` (add `"@codaco/art": "workspace:*"` to `dependencies` — it is not currently declared)

**Flags**: needs conformance check (first use of `@codaco/art` in this app — verify import path + prop surface).

**Requirements — `StageBackground.tsx`**:

- Outer div: `radial-gradient(ellipse at 50% 110%, oklch(0.36 0.10 281) 0%, var(--iv-bg) 60%)` over `var(--iv-bg)` fallback.
- `<BackgroundBlobs palette={[<RGB pair derived from sea-green>, <RGB pair derived from paradise-pink>]} opacity={0.18} />` rendered behind content with `pointer-events: none`.
- **Reduced-motion gating happens in `StageBackground`, not in `BackgroundBlobs`.** When `window.matchMedia("(prefers-reduced-motion: reduce)").matches` is true at mount, `StageBackground` does not render `<BackgroundBlobs/>` at all — the canvas element is not mounted. The radial gradient remains. (Don't rely on `BackgroundBlobs` to self-opt-out; the import is conditional at the caller.)

**Requirements — `BackgroundBlobs.tsx` extension**:

- Add optional `palette?: Array<[string, string]>` prop; when provided, replaces the hardcoded `gradients[]` array. Default behaviour unchanged.
- Update exported types. Backwards compatible.

**Acceptance Criteria**:

- Chrome DevTools Performance recording of a 5-second Home idle on an M1 MacBook: average frame duration ≤ 16.7 ms (60 fps target); no frame ≥ 50 ms (no jank stutter).
- With System Preferences "Reduce motion" enabled, `<canvas>` element from `BackgroundBlobs` does not mount (verifiable via `document.querySelector("canvas")` returning null inside `StageBackground`).
- `pnpm --filter @codaco/art test` exits 0 — no regressions in existing `packages/art` tests.

### Milestone 11: Sweep + verification

**Files**: every remaining file under `apps/interviewer-v7` that the ripgrep below flags.

**Flags**: needs error review (cross-platform smoke).

**Requirements**:

- `rg -i "passphrase|biometric|modern.interviewer|@codaco/modern" apps/interviewer-v7` returns zero hits.
- Rename db filename constant in `electron/db/service.ts:60`: `DB_FILENAME` from `"modern-interviewer.encrypted.db"` → `"interviewer-v7.encrypted.db"` **with a one-shot migration**: on first boot of the new build, rename the old filename to the new one if only the old exists. WHY: a bare rename would strand existing prototype users' encrypted databases under the old filename; the migration preserves their data through the brand transition.
- **Migration failure modes** must be handled explicitly, not silently swallowed:
  - If **both** the old (`modern-interviewer.encrypted.db`) and the new (`interviewer-v7.encrypted.db`) files exist in `userData`, the app refuses to start and surfaces a recoverable error to the user instructing them to back up + remove one of the two before relaunching (avoids ambiguous which-DB-is-canonical).
  - If the rename operation itself fails (filesystem error, permissions, partial write), the app treats it as a **fatal startup error** and surfaces the error — never silently creates a fresh empty `interviewer-v7.encrypted.db`, which would look to the user like data loss.
- Purge stale string constants: `VERIFIER_PLAINTEXT`, `PASSKEY_USER_ID` (they referenced `modern-interviewer`).
- `electron-builder.config.cjs` comment `"Modern Interviewer"` → `"Network Canvas Interviewer v7"`.
- Run: `pnpm --filter @codaco/interviewer-v7 lint:fix`; `typecheck`; `electron:dev` smoke boot; `capacitor:run:ios` + `:android` smoke; `dev` web smoke.

**Acceptance Criteria**:

- `rg -i "passphrase|biometric|modern.interviewer|@codaco/modern" apps/interviewer-v7` exits with no matches (rg returns 1 / non-zero on no-match).
- All five smoke launches reach the post-AuthGate dashboard (visually confirm `<AppShell>` mounts).
- On a clean profile (delete `userData/interviewer-v7.encrypted.db` + clear localStorage + clear `@capacitor/preferences`), each platform shows the SetupScreen as the first non-loading view.
- On an upgrade profile (rename a fresh `modern-interviewer.encrypted.db` into the userData folder before launch), the one-shot migration renames it to `interviewer-v7.encrypted.db` and the existing authenticator unlocks the DB.
- Variation F Home at 1280×900 viewport: BrandHeader + TopActionBar + ProtocolDeck + StatusRow all mounted and visible (DOM check); at 768×1024 viewport none of those overflows the viewport bounding rect.

### Milestone 12: Documentation

**Files**:

- `apps/interviewer-v7/CLAUDE.md` (new — tabular index of the app's source surface)
- `apps/interviewer-v7/README.md` (new — captures the Invisible Knowledge above)

**Requirements**:

- `CLAUDE.md` enables an LLM to locate relevant code for debugging/modification tasks. Tabular format: file path / what it does / when to touch it. Covers `src/routes/*`, `src/components/*`, `src/lib/{auth,db,export,protocol,assets,files,platform}`, `electron/*`.
- `README.md` includes: the process-boundary diagram, the auth flow diagram, the protocol-import data flow, the export data flow, "Why this structure", invariants, tradeoffs — all from this plan's Invisible Knowledge section.
- Cross-reference SPEC.md from both.

**Acceptance Criteria**:

- CLAUDE.md index covers `src/routes/`, `src/components/`, `src/lib/{auth,db,export,protocol,assets,files,platform}`, and `electron/` — one entry per directory describing what lives there and when to touch it (durable against file-level churn).
- Every file path mentioned in README.md exists in the repo at the time M12 ships.
- Every IPC channel string mentioned in README.md (e.g. `auth:setup`, `db:saveProtocol`, `dialog:openProtocol`) appears in a handler registration under `apps/interviewer-v7/electron/handlers/` or `apps/interviewer-v7/electron/main.ts`.

## Milestone Dependencies

```
M1 (rename)
  ├─→ M2 (brand sweep)
  └─→ M3 (backend vault)
        └─→ M4 (renderer auth client)
              ├─→ M5 (Setup + Lock screens)
              │     └─→ M6 (tablet/web auth parity)
              └─→ M7 (Settings restructure)

M2 + M6 ─→ M8 (Home: brand + top bar)
            ├─→ M9 (deck + resume + status)
            └─→ M10 (stage background)

M7 + M9 + M10 ─→ M11 (sweep + verification)
                  └─→ M12 (documentation)
```

Independent forks can run in parallel during execution: M5+M6 are independent of M7; M9 and M10 are independent of each other.
