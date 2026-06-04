# Biometric unlock via OS key stores (Secure Enclave / Windows Hello)

**Date:** 2026-05-28
**App:** `apps/interviewer-v7` (Electron desktop)
**Status:** Decisions resolved (2026-05-28) — ready for implementation plan
**Supersedes:** `2026-05-27-macos-touch-id-design.md` (the WebAuthn/`configureWebAuthn` Touch ID approach — abandoned; see "Why not WebAuthn" below)

## Problem

On desktop we want a **biometric unlock** for the encrypted database: the SQLCipher data-encryption-key (DEK) should be released only after a successful Touch ID (macOS) / Windows Hello (Windows) check. The existing modes are PIN, passphrase, `webauthn` (PRF), and `none`.

The `webauthn` PRF path does **not** work for macOS Touch ID: Electron 42's built-in Secure Enclave authenticator creates a passkey but does **not** implement the PRF/`hmac-secret` extension, so there is no key material to derive (confirmed empirically — enrolment returns "PRF extension unsupported"). PRF-capable native addons (`vault12/electron-webauthn-mac`, `@electron-webauthn/native`) require Apple **Associated Domains** (a real verified domain + online enrolment), which is incompatible with this offline, single-device, `rpId=localhost` app.

**Key reframe:** PRF is only _one_ way to obtain a biometric-gated key. The goal — a DEK released only after biometric auth — is met more directly by the OS biometric **key stores**, which need no WebAuthn, no PRF, no domain, and (on macOS) no `keychain-access-groups` entitlement or provisioning profile.

## Goal / Scope

- **In:** a new biometric unlock mode that wraps the DEK with an **OS-biometric-bound key** — Secure Enclave on macOS, Windows Hello/TPM on Windows. Includes a recovery path so biometry loss isn't data loss.
- **Out:** Linux biometric (no unified OS key-store equivalent — falls back to PIN/passphrase); the Capacitor `biometric-native` mode (iOS/Android, unchanged); changing PIN/passphrase/`none`.
- **Retained from prior work (still valuable, independent of this):** the packaged-app **launch fixes** — serving the renderer from `http://localhost` via a `protocol.handle('http')` interception, and moving `configureWebAuthn` into `whenReady`. These fix the packaged app launching and make general WebAuthn work (see "Fate of the `webauthn` mode").

## Why not WebAuthn (recorded so we don't relitigate)

| Path                                           | Blocker on this app                                                                |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| Electron `configureWebAuthn` Touch ID          | No PRF → no derivable key (empirically confirmed)                                  |
| `vault12` / `@electron-webauthn/native` addons | Require Associated Domains + online enrolment; incompatible with offline/localhost |
| OS key stores (this design)                    | None — device-local, offline, no domain, no PRF                                    |

## Threat model (what this protects against)

Single-user, offline research-data app on the researcher's own Mac/PC.

| Threat                            | Control                                                                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lost/stolen device, powered off   | FileVault / BitLocker (full-disk) + SQLCipher — dominant control; this mode is defense-in-depth                                                                                  |
| Stolen device, logged-in/unlocked | **This mode**: the DEK won't unwrap without a fresh biometric the attacker can't satisfy                                                                                         |
| Casual / shoulder access          | Lock screen + biometric gate                                                                                                                                                     |
| Local malware (logged-in user)    | OS-key-store binding forces a biometric prompt on each unwrap → can't silently extract the DEK (residual: memory scraping after a legitimate unlock — affects all modes equally) |

**Security bar this meets:** biometric is **cryptographically bound** to the key release (≈ the PRF model we lost, and ≥ the PIN/passphrase modes it sits beside). This is the decisive reason to use the key store rather than a `promptTouchID` + `safeStorage` _gate_, which would be bypassable by local code execution and thus weaker than the PIN it would replace.

## Architecture

The DEK (random SQLCipher key) is unchanged. Only its **wrapping** changes — a new wrap alongside the existing PRF/PBKDF2 envelopes in `electron/auth/vault.ts`.

```
enrol:   DEK ──encrypt with OS biometric key's public half──▶ wrappedDek  (no biometric prompt needed to encrypt)
unlock:  wrappedDek ──decrypt with OS biometric private key──▶ DEK         (OS forces Touch ID / Hello here)
```

- **macOS:** a Secure Enclave P-256 key (`kSecAttrTokenIDSecureEnclave`) with access control `kSecAccessControlBiometryAny` (see "No recovery" for why not `…CurrentSet`), used via ECIES `SecKeyCreateEncryptedData` / `SecKeyCreateDecryptedData`. Public-key encrypt needs no biometric; private-key decrypt triggers Touch ID. The private key never leaves the Enclave.
- **Windows:** an RSA/ECDH key in the **Microsoft Passport/TPM KSP** via NCrypt (`NCRYPT_UI_POLICY` requiring Windows Hello), used for OAEP wrap/unwrap of the DEK. TPM-bound, Hello-gated. (`KeyCredentialManager` alone is sign-only with non-deterministic signatures, so it can't wrap a key — NCrypt is the correct primitive.)

All key-store calls run in the **main process** (native), exposed over IPC, dispatched from the renderer's `src/lib/auth/api.ts` — mirroring the existing `electronAuth.*` pattern. `vaultStore.ts`'s `VaultRecord` gains a biometric variant: `{ mode: 'biometric-keystore', platform, keyRef, wrappedDekB64 }`.

## No recovery (single-mode — keeps the current invariant)

Per decision, this mode follows the existing **one-mode-per-vault** model: there is **no recovery secret**, exactly like `webauthn`/`pin`/`passphrase` today (losing the credential means `revoke()` → wipe → re-enrol). Consequence: **losing biometry or the device makes the local DB unrecoverable.** This is acceptable because the app's purpose is _exporting_ sessions — an exported study is not lost with the device — and because it matches how every other mode already behaves.

To avoid turning _routine_ biometric changes into data loss, the Secure Enclave key uses **`kSecAccessControlBiometryAny`** rather than `…BiometryCurrentSet`: the key survives adding/removing a fingerprint (still requires _a_ biometric to unlock). `…CurrentSet` would invalidate the key whenever the enrolled set changes — with no recovery, that would silently wipe access on a normal Touch ID edit. The Windows NCrypt UI policy is configured for the equivalent (Hello required, not invalidated on enrolment changes). Trade-off: a fingerprint added later by someone who already holds the device passcode could unlock — acceptable since device-passcode access is already a higher-privilege position. Switchable to the stricter flag if a future requirement prefers it.

## Per-platform summary

| Platform | Mechanism                              | Off-the-shelf?                                                                   |
| -------- | -------------------------------------- | -------------------------------------------------------------------------------- |
| macOS    | Secure Enclave + Touch ID (ECIES)      | **Yes** — `node-secure-enclave` (see eval)                                       |
| Windows  | NCrypt Passport/TPM KSP + Hello (OAEP) | **No** — bespoke native binding (or the version-gated PRF-via-Hello path, below) |
| Linux    | —                                      | Falls back to PIN/passphrase                                                     |

**Windows shortcut to evaluate:** recent Windows Hello (Win11 25H2 + a Feb 2026 cumulative update) exposes the WebAuthn `hmac-secret`/PRF extension through the OS WebAuthn API. Where present, the _existing_ `webauthn` PRF mode would work on Windows via Hello with **no native module** (the `http://localhost` fix already enables it). Too version-dependent to be the foundation, but a possible "free" Windows biometric path on new builds.

## Package evaluation — `node-secure-enclave`

[antelle/node-secure-enclave](https://github.com/antelle/node-secure-enclave) (KeeWeb author). Before adopting, verify:

- **Access-control flag:** must use `biometryCurrentSet` (invalidate on fingerprint change) or at least `biometryAny`/`userPresence` — confirm which, and that it requires biometric on _decrypt_.
- **API shape:** create-key / encrypt / decrypt; how key references persist; error signalling for "user cancelled" vs "biometry changed" vs "no hardware".
- **Maintenance & audit:** last release, open issues, whether it's prebuilt or compiles (Xcode CLT), and that it's signing-compatible under hardened runtime.
- **Fallback:** if unmaintained/unsuitable, a thin in-house native module over `Security.framework` (`SecKeyCreateRandomKey` + `SecAccessControlCreateWithFlags`) — calling Apple's audited primitives, not hand-rolled crypto.

No comparable off-the-shelf Node module was found for Windows Hello encrypt/decrypt; Windows is expected to need a bespoke NCrypt binding.

## Fate of the `webauthn` mode — removed

Decision: **drop the `webauthn` mode entirely.** On Electron it's replaced by `biometric-keystore`; the hardware-security-key niche isn't wanted. Note this also removes the only biometric option on the **web** build (dev-positioned), leaving web with PIN/passphrase/`none`. Removal covers `src/lib/auth/webauthn.ts`, the `webauthn` branches in `api.ts`, the PRF envelope in `electron/auth/vault.ts`/`vaultStore.ts`, and the `auth:setup`/`auth:unlock`/`auth:reEnrol`/`verifyWebAuthn` IPC that carried `prfOutputB64`.

## Risks & unknowns

| Risk                                                | Resolution                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `node-secure-enclave` unmaintained / wrong AC flag  | Evaluate first; in-house Security.framework binding as fallback                         |
| Windows needs bespoke NCrypt work (no package)      | Scope it explicitly; or rely on PRF-via-Hello where available + recovery code elsewhere |
| Biometry-change / device-reset lockout              | Mandatory recovery PIN/passphrase (dual-wrap)                                           |
| Dual-wrap departs from one-mode-per-vault invariant | Open decision — see below                                                               |
| Linux has no equivalent                             | Out of scope; PIN/passphrase                                                            |

## Resolved decisions (2026-05-28)

1. **No recovery** — keep the one-mode-per-vault model (biometry/device loss = local data loss, mitigated by the export workflow). Use `biometryAny`-class access control to avoid lockout on routine fingerprint edits.
2. **Scope: macOS + Windows**, both fully specified (Windows' bespoke NCrypt Passport/TPM-KSP work sized in the plan).
3. **Drop the `webauthn` mode** entirely (web loses biometric; it's dev-positioned).
4. **Naming:** internal mode id `biometric-keystore`; user-facing label "Biometric authentication" (unchanged).

## Success criteria

- On macOS and Windows, a user enrols biometric unlock, and later unlocking the encrypted DB triggers Touch ID / Hello and releases the DEK; the key is cryptographically bound to the OS key store (not a bypassable gate).
- Adding/removing a fingerprint does **not** lock the user out (`biometryAny`); losing the device is unrecoverable by design (consistent with other modes; mitigated by export).
- The `webauthn` mode is fully removed with no dangling references; PIN, passphrase, `none`, and the Capacitor `biometric-native` mode are unaffected.
- No `keychain-access-groups` entitlement or provisioning profile required (dropped — they were only for `configureWebAuthn`); the `http://localhost`/`whenReady` launch fixes remain.
