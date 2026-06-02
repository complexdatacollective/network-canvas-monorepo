# macOS Touch ID for the `webauthn` unlock mode

**Date:** 2026-05-27
**App:** `apps/interviewer-v7` (Electron desktop)
**Status:** Design approved, pending spec review

## Problem

Interviewer v7's `webauthn` auth mode unlocks the SQLCipher database by deriving a
key-encryption-key (KEK) from a WebAuthn **PRF** output, then unwrapping a stored
data-encryption-key (DEK). On macOS this never reaches the Secure Enclave / Touch ID:
`app.configureWebAuthn({})` is called with no `touchID` config (`electron/main.ts`), so
`PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` is `false` and only
cross-platform authenticators (security keys) or the dev virtual authenticator work.

The code comment at `electron/main.ts` already names the fix ("macOS Touch ID needs a
signed binary + `keychainAccessGroup`"). This spec turns that note into a plan.

This builds **on top of** the just-landed secure-context fix (the packaged renderer is now
served from `app://localhost` instead of `file://`). WebAuthn — including Touch ID — needs
that trustworthy origin to exist; without it `navigator.credentials` throws `SecurityError`.

## Scope

- **In:** macOS Touch ID (Secure Enclave platform authenticator) for the existing
  `webauthn` mode, in **packaged, signed** builds.
- **Out:** Windows Hello and security keys (already work via the default WebAuthn stack);
  the Capacitor `biometric-native` mode (iOS/Android, unchanged); any change to the PIN /
  passphrase / `none` modes; introducing a new auth mode unless the spike forces it.

## Key facts established during design

- Electron 42.1.0 (the repo's version) ships `app.configureWebAuthn({ touchID: {
keychainAccessGroup, promptReason } })` — backported to the 42-x-y line
  ([electron #51411](https://github.com/electron/electron/pull/51411)). No native module is
  required for the Touch ID prompt itself.
- Apple's platform authenticator supports the **PRF** extension on **macOS 15 / Safari 18+**,
  so PRF works at the OS level on current macOS. The open question is whether Electron 42's
  bridge plumbs the PRF extension through to the Secure Enclave authenticator — the Touch ID
  PR does not mention PRF. This is the one make-or-break unknown.
- `keychainAccessGroup` requires a `keychain-access-groups` entitlement and a binary signed
  with the app's Apple Team ID. **Signing identity + Team ID are available now.** Notarization
  is already conditional on `APPLE_API_KEY`; hardened runtime + entitlements are configured.
- Pre-agreed fallback if Electron's built-in authenticator does **not** expose PRF: integrate
  the native addon [`vault12/electron-webauthn-mac`](https://github.com/vault12/electron-webauthn-mac),
  which advertises PRF on macOS.

## Approach

Spike-first on the built-in API; native addon as the pre-agreed fallback.

Rejected alternatives:

- **Go straight to the native addon** — pays the native-dependency / ABI-rebuild / signing
  cost even when the built-in API would suffice.
- **Keychain-backed DEK mode** (store the DEK in the Secure Enclave keychain, gate retrieval
  with Touch ID via `LAContext`, no PRF) — a whole new envelope diverging from the unified
  PRF model; more code and test surface.

The built-in path adds **zero dependencies** and leaves the entire `electron/auth/vault.ts`
envelope (PRF → KEK → unwrap DEK) and `vaultStore.ts` record shape **untouched** — only the
authenticator _source_ changes. The native-addon path produces the same PRF output, so it
also feeds the unchanged envelope; it only differs in how create/get is invoked.

## Work breakdown

### 1. PRF spike (decision gate)

- Add a TeamID-prefixed `keychain-access-groups` entitlement to `build-resources/entitlements.mac.plist`
  (and the inherit plist).
- Pass `touchID: { keychainAccessGroup, promptReason }` to `configureWebAuthn`, gated to
  `process.platform === 'darwin'` **and** packaged/signed builds (`app.isPackaged`).
- Produce a signed local build (`pnpm electron:dist:mac`), run `createPasskey` with the PRF
  eval, and inspect `getClientExtensionResults().prf?.results?.first`.

**Outcome A — PRF present:** proceed with the built-in path (step 2). `vault.ts` unchanged.
**Outcome B — PRF absent:** proceed with the native-addon path (step 2′).

### 2. Built-in path (Outcome A)

- Keep Touch ID enablement gated to darwin + `app.isPackaged`; dev keeps the Chromium virtual
  authenticator (an unsigned binary cannot claim the keychain group, so enabling `touchID` in
  dev would break enrolment).
- Renderer: gate the "Biometric authentication" offer on
  `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` so macOS machines
  without Touch ID fall through to PIN / passphrase. Confirm `isWebAuthnAvailable()` /
  setup-wizard method-picker logic.
- `electron/auth/vault.ts` and `vaultStore.ts` unchanged.

### 2′. Native-addon fallback (Outcome B only)

- Add `vault12/electron-webauthn-mac`; rebuild it for the Electron ABI via the existing
  `electron:rebuild` mechanism (`electron-rebuild`, as with `better-sqlite3-multiple-ciphers`).
  Library validation is already disabled in the entitlements, so the unsigned-by-Apple native
  binary loads under hardened runtime.
- Route the macOS create/get through the addon (main-process native call exposed over IPC),
  mapping its PRF output into the existing `vault.ts` envelope. The renderer's auth `api.ts`
  dispatch gains a macOS-Electron branch; the envelope and stored record shape are unchanged.

### 3. Entitlements / signing / CI

- Pin down the exact `keychain-access-groups` value. The runtime `keychainAccessGroup` passed
  to `configureWebAuthn` must match the signed entitlement **exactly**. Verify whether `codesign`
  (as invoked by electron-builder) resolves `$(AppIdentifierPrefix)` / `$(TeamIdentifierPrefix)`
  or whether a literal `TEAMID.group` string is required — common footgun; the spike build
  settles it empirically.
- Confirm CI provides the signing identity (`CSC_LINK` / `CSC_KEY_PASSWORD` or equivalent) in
  addition to `APPLE_API_KEY`, and that a notarized artifact prompts Touch ID on launch.

### 4. Hardware testing

- On a Touch ID Mac: enrol → lock → unlock → re-enrol → revoke. Re-enrol must stay atomic
  (the new wrapped record replaces the old only after the new wrap succeeds — existing invariant).
- On a non-Touch-ID Mac: confirm graceful fallback to the PIN / passphrase offer.
- Exercise idle-timeout relock (`useIdleTimer`) and the step-up path (`StepUpAuthDialog`
  `requireFreshUnlock()`) with Touch ID.

### 5. Documentation

- Update the `electron/main.ts` comment, the interviewer-v7 `CLAUDE.md` auth-modes note, and
  `README` to reflect Touch ID being live (and, if Outcome B, the native addon).

## Risks & unknowns

| Risk                                                                    | Resolution                                            |
| ----------------------------------------------------------------------- | ----------------------------------------------------- |
| Electron 42 may not expose PRF for the Secure Enclave authenticator     | Step 1 spike; native addon fallback already approved  |
| `keychain-access-groups` string format / `codesign` variable resolution | Step 3, settled empirically by the signed spike build |
| Dev vs packaged divergence (Touch ID only in signed builds)             | Intentional; dev keeps the virtual authenticator      |

## Success criteria

- On a signed, notarized macOS build, a user can enrol and later unlock the encrypted database
  with Touch ID, with the SQLCipher DEK derived through the existing PRF → KEK envelope.
- macOS machines without Touch ID still see PIN / passphrase options and are not blocked.
- No regression to Windows Hello, security keys, the dev virtual authenticator, or the
  Capacitor `biometric-native` mode.
