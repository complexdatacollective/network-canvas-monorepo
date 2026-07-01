# Interviewer-v8 Offline-First PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is split into per-phase files (below); execute them **in order** — each phase assumes the previous phases have landed.

**Goal:** Convert `apps/interviewer-v8` from a tri-target app (Electron / Capacitor / web) into a single installable, offline-first PWA at full feature parity, retiring the native stacks entirely.

**Architecture:** Collapse to a web-only baseline first, then add a Web Crypto encrypted-at-rest vault (DEK-encrypted IndexedDB, unlocked by PIN/passphrase via PBKDF2 or biometric via WebAuthn-PRF with a recovery passphrase), then the `vite-plugin-pwa` shell + session-aware update UX, then offline awareness. Encryption is a field codec applied at the Dexie repo get/save boundaries (crypto runs outside Dexie transactions); the query/list paths stay on plaintext indexes.

**Tech Stack:** Vite + `vite-plugin-pwa` (generateSW), React, wouter, Dexie 4 / IndexedDB, Web Crypto (`crypto.subtle`), WebAuthn (PRF extension), Vitest, oxlint/oxfmt.

**Spec:** `docs/superpowers/specs/2026-07-01-interviewer-v8-pwa-design.md` (approved).

## Global Constraints

Every task's requirements implicitly include these:

- **No `any`. No `as` type assertions** to bypass checking — fix the underlying type.
- **No barrel files** (no `index.ts` re-export aggregators). Import from source.
- **No re-exports for convenience.** Import from the original module.
- **Crypto: Web Crypto (`crypto.subtle`) only.** No hand-rolled primitives, no crypto libraries.
- **Lint/format:** oxlint + oxfmt (2-space indent, single quotes); pre-commit hooks run them on staged files. Run `pnpm lint:fix` from repo root before commit.
- **Tests:** Vitest, co-located in `__tests__/`, `.test.ts`/`.test.tsx`. App unit project: `pnpm --filter @codaco/interviewer-v8 test` (= `vitest run --project=unit`). Interview package: `pnpm --filter @codaco/interview exec vitest run --project=units <path>`.
- **No changeset** — interviewer-v8 is unreleased/alpha.
- **No local e2e/Playwright** — CI owns it.
- **TDD, frequent commits.** Each task ends with a commit. Do **not** add `Co-Authored-By` to commits; use the user's git credentials.
- **Single-user invariant:** `installationId` identifies the device, not a user; no code path may introduce a user identifier (the WebAuthn `user.id` handle is the installation id — device-scoped, not a user identifier).
- **Participant/researcher tone + i18n:** new user-facing copy follows existing patterns; no hardcoded participant text where the codebase uses tokens.
- **Target browsers for WebAuthn-PRF:** Chrome/Edge 116+, Safari 18+ (platform authenticator, user-verification required); PIN/passphrase is the always-available fallback, gated by `isPrfSupported()`.
- **Reload re-locks** — the session DEK lives only in memory; a page reload requires re-unlock (intended, stricter than the old sessionStorage flag).

## Phases (execute in order)

| #   | File                                                               | Spec workstream | Deliverable (working, testable)                                                                                                  |
| --- | ------------------------------------------------------------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| A   | [01-phase-a-native-teardown.md](01-phase-a-native-teardown.md)     | A               | Web-only Vite SPA on Dexie; Electron/Capacitor/native deps gone; plaintext, PIN/passphrase verifier-only.                        |
| B   | [02-phase-b-file-io.md](02-phase-b-file-io.md)                     | A.1             | URL import removed + sample/dev protocols bundled; export via Web Share + download fallback; iOS-safe file `accept`.             |
| C   | [03-phase-c-vault-primitives.md](03-phase-c-vault-primitives.md)   | B (core)        | `src/lib/vault/` — crypto, webauthn, vaultStore, vault orchestration (unit-tested, no UI).                                       |
| D   | [04-phase-d-encrypted-storage.md](04-phase-d-encrypted-storage.md) | B2              | `sessionKey` + `recordCrypto` field codec; repos encrypt/decrypt at get/save; querySessions unchanged.                           |
| E   | [05-phase-e-auth-rebuild-ui.md](05-phase-e-auth-rebuild-ui.md)     | B (app)         | `auth/api.ts`→vault; AuthContext holds the DEK; SetupWizard/LockScreen WebAuthn + recovery passphrase; step-up.                  |
| F   | [06-phase-f-pwa-shell.md](06-phase-f-pwa-shell.md)                 | C               | `vite-plugin-pwa` + manifest/icons; `PwaUpdateBanner` (session-aware guard) + install nudge; persistent storage; deploy headers. |
| G   | [07-phase-g-offline-ux.md](07-phase-g-offline-ux.md)               | D               | `useOnlineStatus`; offline warning at Geospatial session start; offline indicator + error-boundary message.                      |

**Hard dependencies:** C before D (D uses the vault DEK + `getSessionDek`). D before E (E wires the DEK holder + real unlock). A before everything (web-only baseline). B, F, G depend only on A. E depends on C+D.

## File-structure map (created / modified across the migration)

**New modules (created):**

| Path                                                                                     | Responsibility                                                                                                                           | Phase |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `src/lib/vault/crypto.ts`                                                                | Web Crypto primitives: DEK gen/wrap/unwrap (AES-KW), KEK derivation (PBKDF2 / HKDF-PRF), AES-GCM record crypto + base64 helpers          | C     |
| `src/lib/vault/webauthn.ts`                                                              | WebAuthn PRF: `isPrfSupported`, `enrollBiometric`, `readPrf`                                                                             | C     |
| `src/lib/vault/vaultStore.ts`                                                            | localStorage-backed versioned `VaultRecord` (wrapped key material)                                                                       | C     |
| `src/lib/vault/vault.ts`                                                                 | Enrol/unlock/verify/revoke orchestration per mode; biometric dual-wrap recovery                                                          | C     |
| `src/lib/db/sessionKey.ts`                                                               | In-memory session DEK holder (`set/getSessionDek`)                                                                                       | D     |
| `src/lib/db/recordCrypto.ts`                                                             | Field codec: encrypt/decrypt session `network`+`stageMetadata`, protocol `protocol`+`codebook`, asset `data`; passthrough in mode `none` | D     |
| `src/lib/net/useOnlineStatus.ts`                                                         | Connectivity signal (`navigator.onLine` + events)                                                                                        | G     |
| `pwa-assets.config.ts`, `PwaUpdateBanner.tsx`, `PwaInstallNudge.tsx`, `installPrompt.ts` | PWA shell + update/install UX (ported from architect-web)                                                                                | F     |

**Deleted:** `electron/`, `electron.vite.config.ts`, `electron-builder.config.cjs`, `capacitor.config.ts`, `android/`, `ios/`, `packages/biometric-keystore/`, `src/lib/auth/{electron,biometricNative}.ts`, `src/lib/db/electron-*.ts`, `src/lib/files/fetchFromUrl.ts`, `src/lib/update/*` (Phases A, B).

**Modified (key):** `src/lib/platform/platform.ts` (web-only), `src/lib/db/{api,protocols,sessions}.ts` (encrypt/decrypt boundary), `src/lib/auth/{api,AuthContext}.ts` (vault-backed), `src/lib/files/{pickFile,download}.ts` (Web Share + relaxed accept), `src/lib/protocol/{importProtocol,useProtocolImport,sampleProtocol}.ts` + `ImportDialog.tsx` (URL import removed, bundled protocols), `src/lib/assets/assetResolver.ts` (decrypt), `vite.config.ts` (VitePWA), `src/App.tsx` (mount banner/nudge), `SettingsDialog.tsx`/`StatusRow.tsx` (durability), `package.json`, `pnpm-workspace.yaml`, `knip.json`, `turbo.json`.

## Design-validation spikes (do before/early in the relevant phase)

1. **WebAuthn PRF** (before Phase C webauthn): confirm the `create()`+`get()` PRF flow and `isPrfSupported` gating on Chrome/Edge and Safari 18+.
2. **Dexie 4 + Web Crypto** (before Phase D): confirm encrypt-before-transaction / decrypt-after-read has no `TransactionInactiveError`.
3. **Bundle/precache** (before Phase F): measure `mapbox-gl` + interview-engine chunk sizes vs. the precache limit; set `maximumFileSizeToCacheInBytes` / code-split accordingly.

## Notes on deliberate decisions

- **AAD scheme:** record AAD is `"<table>:<primaryKey>"` (2-part; the spec's optional field-schema-version segment is dropped — record shape versioning is carried by the `_v`/row-type instead). This is intentional; do not re-add it without a decision.
- **Encrypted-field boundary:** only `session.network`+`stageMetadata`, `protocol.protocol`+`codebook`, and `asset.data` are encrypted. `caseId`, `protocolName`, timestamps, and status stay **plaintext indexes** so the query backend is unchanged (spec §B2).
- **Verification-only gate tasks** (e.g. end-of-phase typecheck/knip passes) intentionally have no red-green unit test; their "test" is the verification command. knip may transiently list not-yet-consumed exports mid-phase — those are consumed by a later task in the same phase and go green by the phase's final gate.
