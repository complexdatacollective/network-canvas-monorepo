# Network Canvas Interviewer v7

Network Canvas Interviewer v7 is a single-user, offline-first research-data-collection app. It hosts the `@codaco/interview` engine and pairs it with a dashboard for managing protocols, managing collected sessions, and exporting data for analysis. One codebase ships to desktop (Electron), tablet (Capacitor 8), and web (Vite). See [`SPEC.md`](./SPEC.md) for the full product specification and [`CLAUDE.md`](./CLAUDE.md) for the source-surface index.

## Stack

- **Desktop**: Electron (electron-vite build, electron-builder packaging)
- **Tablet**: Capacitor 8 with `@capacitor/{app, core, ios, android, filesystem, preferences}`
- **Web**: Vite 8
- **UI runtime**: React 19, wouter routing, `@codaco/fresco-ui`, `@base-ui/react`, `motion`, `@codaco/art` (animated blob background)
- **Data**: Dexie 4 (renderer / IndexedDB), `better-sqlite3-multiple-ciphers` SQLCipher (Electron main)
- **Auth**: per-platform — `biometric-keystore` on Electron macOS (Touch ID via a Rust napi-rs binding over `security-framework`), `biometric-native` on Capacitor (iOS/Android), PIN or passphrase elsewhere, or `none`. See [CLAUDE.md](./CLAUDE.md#conventions) for the full mode list.
- **Export pipeline**: Effect 3 + `@codaco/network-exporters`, JSZip
- **Validation/migration**: `@codaco/protocol-validation`

## Architecture — process boundaries

```text
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
|  src/lib/auth/*         (auth client)         |
|  src/lib/protocol/      (import pipeline)     |
|  src/lib/export/        (Effect export)       |
+-------------|------------------|--------------+
              | isElectron?      | Capacitor plugin / PIN / passphrase
              v                  v
+-------------v-----------+   +--v--------------------------+
| Electron preload        |   | Capacitor / Web             |
| contextBridge           |   | - Dexie 4 (IndexedDB)       |
| window.electronAPI.     |   | - @capacitor/filesystem     |
|   {db, auth,            |   |   for export save           |
|    openFile, saveFile}  |   | - @capacitor/preferences    |
+-------------|-----------+   |   for auth metadata         |
              |               | - biometric-native / PIN /  |
              v               |   passphrase for app gate   |
+-------------v-----------+   +-----------------------------+
| Electron main           |
| - IPC handlers          |
| - auth/vault.ts         |
|   (PIN/passphrase wrap, |
|    biometric-keystore   |
|    via @codaco/         |
|    biometric-keystore)  |
| - db/service.ts         |
|   (SQLCipher)           |
| - dialog.openProtocol   |
| - dialog.saveFile       |
+-------------------------+
```

## Architecture — auth flow

```text
Setup (first launch) — Electron biometric-keystore (macOS Touch ID)
-------------------------------------------------------------------
SetupWizard -> Biometric authentication -> authApi.enrol()
  ipc auth:setupBiometric
    main.vault.setupBiometric():
      DEK = randomBytes(32)
      biometricKeystore.storeDek(DEK)
        -> @codaco/biometric-keystore (Rust napi-rs)
        -> SecItemAdd { service, account, secret,
                        accessControl: USER_PRESENCE }   (no prompt)
      openDatabase(DEK hex)
      write VaultRecord { mode: 'biometric-keystore' }

Setup — PIN / passphrase (Electron + web + Capacitor)
-----------------------------------------------------
SetupWizard -> PIN | Passphrase -> authApi.enrolWith{Pin,Passphrase}()
  desktop: ipc auth:setupPin / auth:setup:passphrase
           main.vault wraps DEK with PBKDF2-derived KEK
  web/cap: localStorage / Capacitor Preferences holds a verifier

Unlock — biometric-keystore
---------------------------
LockScreen -> unlockWithAuthenticator() -> ipc auth:unlockBiometric
  main.vault.unlockBiometric():
    DEK = biometricKeystore.loadDek()
      -> SecItemCopyMatching       (macOS prompts Touch ID / passcode)
    openDatabase(DEK hex)

Unlock — PIN / passphrase
-------------------------
LockScreen -> unlockWith{Pin,Passphrase}(secret)
  desktop: ipc auth:unlockPin / auth:unlock:passphrase
           PBKDF2 -> KEK -> AES-GCM-decrypt(wrappedDEK)
  web/cap: re-derive verifier, compare

Lock / revoke
-------------
desktop:    ipc auth:lock -> closeDatabase + zero in-memory key
            ipc auth:revoke -> wipe DB + delete vault record;
                               for biometric-keystore also
                               biometricKeystore.deleteDek()
web/cap:    drop in-memory unlock flag (lock); clear Dexie + metadata (revoke)
```

## Data flow — protocol import

```text
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
       +--- isElectron ? ipc db:protocols:save (SQLCipher transaction)
                       : dexie put (protocol + assets table)
```

## Data flow — bulk export

```text
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

## Why this structure

- **`src/lib/db/api.ts` facade**: SPEC §Storage requires different storage at-rest behaviour per platform (encrypted SQLCipher on desktop, platform-protected Dexie elsewhere). The facade isolates that split so routes/components don't branch on `isElectron`.
- **Main-process key custody**: the DEK never crosses IPC. PIN and passphrase send the user's secret to main, which derives the KEK and unwraps locally. `biometric-keystore` invokes the OS keychain from main and never exposes the DEK to the renderer. The renderer's only view of authentication state is `{ configured, locked, mode }`.
- **Effect-TS pipeline for export**: the export pipeline composes multiple repositories, an event stream, and a sink Layer; Effect's `Layer.mergeAll` cleanly assembles the renderer-specific Layers (in-renderer repositories + Blob sink) without leaking implementation details into the shared `@codaco/network-exporters` package.
- **fresco-ui first**: every component in this repo that needs a Button, Surface, Form, Dialog, Toast, or typography token should reach for fresco-ui first. Falling back to `@base-ui/react` + `motion` is reserved for visual primitives fresco-ui doesn't ship (the fanned protocol deck animation, the translucent-blur pill treatment, the animated blob background).

## Invariants

- **Single-user**: there is no concept of users in the schema. `installationId` identifies the device, not a user. No code path may introduce a user identifier.
- **Auth gate is unconditional**: every platform shows the AuthGate before any data view renders. The renderer has no "security disabled" branch.
- **Desktop database is never opened without a successful unlock**: `electron/db/service.ts:openDatabase` is only called from `vault.setup{Pin,Passphrase,Biometric}()` or `vault.unlock{Pin,Passphrase,Biometric}()`, all of which require a fresh credential proof. The `none` mode uses `openDatabasePlain()` instead and the renderer treats it as `locked: false` permanently.
- **PIN / passphrase re-enrolment is atomic**: `vault.reEnrolPin()` / `vault.reEnrolPassphrase()` write the new `VaultRecord` only after the new wrap succeeds. The old record is preserved until then so a failed re-enrol leaves the previous credential usable. `biometric-keystore` has no re-enrol — switching mode requires `revoke()` first.
- **Protocol hash identifies a protocol uniquely**: `hashProtocol(validated)` produces a stable hash; sessions reference protocols by hash, not by id. Cascade-delete is keyed on hash.

## Tradeoffs

| Decision                                                 | Cost                                                                                                                       | Benefit                                                                                                                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PIN / passphrase use PBKDF2 envelope (KEK wraps DEK)     | Slightly more code in `vault.ts`; one extra in-memory transformation per unlock                                            | Re-enrol is O(1); no full DB re-encrypt; the on-disk key remains constant across PIN/passphrase changes                                                                   |
| `biometric-keystore` stores DEK directly in keychain ACL | No Secure Enclave hardware binding; the DEK lives in the OS keychain (still gated by Touch ID via `kSecAttrAccessControl`) | No hand-rolled crypto, no ECIES wrap layer, no provisioning profile required. Decision write-up: `docs/superpowers/specs/2026-05-28-biometric-keystore-package-survey.md` |
| `biometric-keystore` is macOS only                       | Windows / Linux Electron users get PIN or passphrase, not biometric                                                        | No off-the-shelf NCrypt + Hello encrypt/decrypt npm package exists; bespoke binding deferred. Capacitor handles iOS / Android biometric via `biometric-native`            |
| Drop encrypted renderer vault on tablet/web              | Tablet/web data is platform-protected, not app-encrypted                                                                   | Massive simplification of the renderer auth code; matches what the spec actually says about non-desktop platforms                                                         |
| Variation F as handed off                                | The pending "split selector + meta" iteration is deferred                                                                  | Faithful to the design that exists; no unbacked design judgement                                                                                                          |

## Known one-time data losses for prototype users

The Dexie database store name changed from `"modern-interviewer"` to `"interviewer-v7"` during the v7 brand sweep. Tablet and web users on the old prototype build will see a fresh empty Dexie database on first launch of v7 — their previous IndexedDB store still sits in the browser/WebView but is no longer opened. This is a one-time, non-recoverable event for prototype users on Capacitor and web.

The Electron desktop database is preserved by a one-shot rename in `electron/db/service.ts:migrateLegacyDbFilename`, which moves `modern-interviewer.encrypted.db` to `interviewer-v7.encrypted.db` if only the legacy file exists in `userData/`.

## DB filename migration — fatal states

`electron/db/service.ts` refuses to start when **both** `modern-interviewer.encrypted.db` and `interviewer-v7.encrypted.db` exist in `userData/`. The user must back up and remove one of the two files before launching. This is deliberate — silently picking one would risk masking data loss.

If the rename operation itself fails (filesystem error, permissions, partial write), the app treats it as a fatal startup error and surfaces the error to the user. It never silently creates a fresh empty `interviewer-v7.encrypted.db`, which would look indistinguishable from total data loss.

## Commands

All commands run from this directory unless noted. The monorepo root `pnpm typecheck` and `pnpm lint` from the workspace root cover this app.

```bash
# Web (Vite dev server)
pnpm dev

# Electron desktop
pnpm electron:dev
pnpm electron:dist            # packaged build (platform-detected)
pnpm electron:rebuild         # rebind better-sqlite3-multiple-ciphers to Electron ABI

# Capacitor tablet
pnpm capacitor:run:ios
pnpm capacitor:run:android
pnpm capacitor:sync

# Verification
pnpm build
pnpm typecheck
```

Lint and format with the monorepo root `pnpm lint` / `pnpm lint:fix` (oxlint + oxfmt — 2-space indentation, single quotes).
