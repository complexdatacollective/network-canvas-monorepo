# Biometric keystore — npm package survey + path-forward memo

**Date:** 2026-05-28
**Context:** decision-gate for `docs/superpowers/plans/2026-05-28-biometric-keystore-unlock.md` Task C1
**Status:** **Implemented 2026-05-28.** Option A is the shipped design. The DEK is stored as a generic-password keychain item with `kSecAttrAccessControl = USER_PRESENCE` via a thin napi-rs Rust crate at `apps/interviewer-v7/native/biometric-keystore/` (calls `security-framework` directly, not via `apple-native-keyring-store::protected` — chose the direct route to avoid the Data Protection Keychain entitlement and to keep the choice of ACL flag open). `USER_PRESENCE` rather than `BIOMETRY_ANY` so the user can fall back to device passcode if Touch ID fails. macOS only; Windows remains PIN/passphrase pending either a maintained NCrypt package or the [[interviewer-v7-tauri-under-consideration]] direction. The Tauri-vs-Electron investigation confirmed Tauri does not meaningfully change the biometric primitive answer.

## TL;DR

The plan's C1 task assumed `antelle/node-secure-enclave` would be adoptable. It is not — it hard-codes the wrong access-control flag (`BiometryCurrentSet` instead of the spec's required `BiometryAny`), so under "no recovery" mode it would silently destroy the DEK whenever a user adds/removes a fingerprint. C1's stated fallback was "a thin in-house `Security.framework` addon."

A broader npm survey (below) found **no maintained npm package that implements biometric-bound encrypt/decrypt for Electron**. Every modern alternative targets one of two adjacent primitives — signing (which is non-deterministic and can't wrap a DEK) or plain keychain storage (no biometric gate on read).

This means the plan as written cannot be executed using off-the-shelf parts. The remaining choices are all design-level rather than packaging-level, and they need a human call.

## What the plan/spec require

For an unlock to release the DEK, the OS must enforce a biometric check on the unwrap. Concretely:

- **macOS:** Secure Enclave P-256 key with `kSecAccessControl = (PrivateKeyUsage | BiometryAny)`, used via ECIES `SecKeyCreateEncryptedData` / `SecKeyCreateDecryptedData`. Public-key encrypt at enrol (no prompt); private-key decrypt at unlock (Touch ID).
- **Windows:** RSA/ECDH key in the Microsoft Passport/TPM KSP with `NCRYPT_UI_POLICY` forcing Windows Hello, RSA-OAEP unwrap.
- **Linux:** out of scope; falls back to PIN/passphrase.

`BiometryAny` (not `…CurrentSet`) is load-bearing because the spec also commits to **no recovery**. With `…CurrentSet`, adding a fingerprint in System Settings invalidates the key — and with no recovery, that means data loss on a routine change.

## Package landscape (surveyed 2026-05-28)

| Package                                                                                                                                 | Last pub              | Primitive                                                                                          | Verdict                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `secure-enclave` (antelle/node-secure-enclave)                                                                                          | 2024 (code from 2021) | ECIES wrap/unwrap on SE                                                                            | **Right primitive**. Hard-codes `BiometryCurrentSet` ([`addon.cpp:83`](https://github.com/antelle/node-secure-enclave/blob/master/src/addon.cpp#L83)). 1-line C++ patch fixes it. Fork needed.                                                                                                |
| `hardware-keys` (nodelibdev)                                                                                                            | 2026-05-26            | ECDSA sign (ES256) on SE + Windows TPM, napi-rs                                                    | Modern, dual-platform, `BiometryAny` ✅ — but **sign-only**. Signatures are non-deterministic; cannot derive a KEK or wrap.                                                                                                                                                                   |
| `@authmesh/keystore`                                                                                                                    | 2026-04-12            | ECDSA sign for device-bound auth                                                                   | Same shape as `hardware-keys`. Sign-only.                                                                                                                                                                                                                                                     |
| `@aauth/hardware-keys`, `@introspectivelabs/electron-secure-enclave-darwin`                                                             | 2025–2026             | Sign-only / experimental                                                                           | Same.                                                                                                                                                                                                                                                                                         |
| `cross-keychain`                                                                                                                        | 2024                  | Plain keychain storage via `@napi-rs/keyring`                                                      | Stores secrets at default ACL — no biometric prompt on read. Wrong primitive. (README claims "Touch ID/Face ID integration"; verified the chain `cross-keychain → @napi-rs/keyring → apple-native-keyring-store::keychain` uses no `kSecAttrAccessControl`. Login-keychain inheritance only.) |
| `apple-native-keyring-store::protected` (Rust crate, dep of @napi-rs/keyring)                                                           | 2026                  | iOS Protected Data / macOS Apple-Silicon secure storage with `AccessControlOptions::USER_PRESENCE` | **Right primitive** — supports per-item biometric ACL natively in mature Rust. Not exposed by `@napi-rs/keyring`; needs a thin napi-rs binding (or a fork) to surface. macOS-only; no Windows equivalent.                                                                                     |
| `@perfood/capacitor-crypto-api`, `tauri-plugin-secure-element-api`, `react-native-device-crypto`, `@aparajita/capacitor-biometric-auth` | various               | Mobile-only (iOS/Android)                                                                          | Not applicable to Electron.                                                                                                                                                                                                                                                                   |
| `keytar`                                                                                                                                | 2022 (archived)       | Plain keychain storage                                                                             | Same as cross-keychain.                                                                                                                                                                                                                                                                       |
| `electron.safeStorage`                                                                                                                  | built-in              | OS-encrypted blob storage                                                                          | Encrypts but doesn't biometric-gate; the key is bound to the app, not a biometric. Same threat profile as PIN-at-rest.                                                                                                                                                                        |

**Windows:** no maintained npm package exposes NCrypt encrypt/decrypt with `NCRYPT_UI_POLICY`. The plan already anticipated bespoke binding work here (D1).

## Why "sign-only" doesn't help

A biometric-gated _signing_ key cannot substitute for a wrapping key because ECDSA signatures over the same input produce different outputs each time (the `k` nonce is random). You can't use a non-deterministic output as a KEK to wrap a DEK — you'd never recover the same wrap.

The only standard SE operation that supports deterministic wrap/unwrap is **ECIES** (`SecKeyCreateEncryptedData`/`SecKeyCreateDecryptedData`), which is exactly what `secure-enclave` implements and exactly what no other Node package does.

## Path-forward options

### Option A — Switch primitive: macOS Keychain ACL (not SE wrap)

**Shape:** store the random DEK directly as a `SecGenericPassword` item with `kSecAttrAccessControl = SecAccessControlCreateWithFlags(…, kSecAccessibleWhenUnlocked, kSecAccessControlBiometryAny)`. On unlock: `SecItemCopyMatching` → macOS prompts Touch ID → returns the DEK bytes. No ECIES, no key pair, no Secure Enclave (the DEK itself is the secret; the SE-backed wrap is replaced by the keychain ACL).

**Pros:** simplest macOS path; cleanly meets the "no read without biometric" bar; same UX as 1Password / Bitwarden's biometric unlock.

**Cons:** loses the Secure Enclave hardware binding. The DEK is in keychain (encrypted at rest by the OS), gated by biometric on read, but **not** hardware-bound to the SE chip — a privileged attacker who can read the keychain database while the biometric prompt is satisfied gets the DEK. For this app's threat model (single-user research data; full-disk encryption + SQLCipher as the dominant control; biometric is defense-in-depth) this is plausibly fine, but it is a strictly weaker primitive than the spec's "DEK never leaves SE wrap."

**How to ship it:** `apple-native-keyring-store::protected` (already a transitive dep via `@napi-rs/keyring`) implements exactly this with `AccessControlOptions::USER_PRESENCE`. It is mature Rust calling `security-framework`'s `SecAccessControl` primitives. `@napi-rs/keyring` consumes it but only wires up the `keychain` (non-ACL) module — switching to (or adding a sibling for) the `protected` module gives us per-item biometric ACL with zero hand-rolled crypto. Two viable paths:

1. **Thin napi-rs binding to `apple-native-keyring-store::protected`** — a new crate of ~50 lines of Rust exposing `store(plaintext) → keyTag` / `load(keyTag) → plaintext` / `delete(keyTag)`. Prebuilt binaries via napi-rs's existing tooling. No C++, no Obj-C, no `node-gyp`.
2. **Fork `@napi-rs/keyring`** — add an opt-in "protected" Entry variant alongside the existing one. Slightly more upstream-aligned; potentially upstreamable.

Both are dramatically lighter than the original Option A framing (which assumed writing C against Security.framework directly).

**Windows equivalent:** Credential Manager has no per-item biometric ACL. Windows would still need the bespoke NCrypt binding, OR ship PIN/passphrase only on Windows.

### Option B — Fork `antelle/secure-enclave`; patch `BiometryCurrentSet` → `BiometryAny`

**Shape:** literal 1-line diff in `src/addon.cpp:83`. Publish as a private GitHub-installed dep; rebuild against Electron's ABI; ship prebuilds in our own release pipeline.

**Pros:** keeps the original spec's architecture (SE-backed wrap, hardware binding, never leaves the chip); minimal cryptographic surface area.

**Cons:** maintenance burden of a fork (upstream is essentially abandoned — last meaningful push 2021); we own its build/signing/prebuild story; one of our deps is now a one-line patch that has to track Electron ABI bumps forever; bus factor is us.

**Windows:** still bespoke NCrypt per the plan.

### Option C — Defer biometric; ship A+B as the baseline

**Shape:** A and B (this session) have already landed: the renderer is back on `app://`, all WebAuthn scaffolding is gone, vault modes are pin/passphrase/none/biometric-native (Capacitor). Stop here. Add a note in `SPEC.md` that desktop biometric unlock is deferred pending a maintained npm package OR an internal investment in the bespoke binding.

**Pros:** clean baseline; zero new native code; PIN and passphrase are well-tested and meet the security bar for the single-user threat model; ships now.

**Cons:** the macOS user gets PIN/passphrase, not Touch ID. The spec promised Touch ID as a Variation-F feature; not having it weakens the product story.

### Option D — Hybrid: ship A+B now, implement Option A behind a flag later

**Shape:** treat this session's A+B work as a separate, immediately-mergeable change. File a follow-up issue with the Option-A design captured in this memo. Revisit when staffing is available.

**Pros:** unblocks the codebase from carrying broken WebAuthn scaffolding; pushes the biometric decision out of the critical path without losing the design work.

**Cons:** none beyond Option C's "no biometric yet."

## What I'd pick (if asked)

Option D — merge A+B now (it's strictly an improvement, removes broken code, doesn't commit to anything new) and turn this memo into a follow-up spec for Option A. Option A's keychain-ACL primitive is the right pragmatic trade for this app's threat model: full-disk encryption + SQLCipher do the heavy security lifting; the biometric gate is UX-grade defense-in-depth, and the simpler primitive avoids both the fork burden of Option B and the missing Windows package gap (which we can scope separately when a Windows machine is in front of us).

The Option-A path also got materially easier once I traced the `cross-keychain` claim: the underlying `apple-native-keyring-store::protected` module already implements per-item biometric ACL in audited Rust, so "the native module" is a ~50-line napi-rs binding rather than fresh C against Security.framework.

## What changes if you pick Option A

The plan would be rewritten as:

- Drop `kSecAttrTokenIDSecureEnclave` from the design; spec language about "DEK never leaves the chip" becomes "DEK release gated on biometric prompt, encrypted at rest by macOS keychain."
- `BiometricKeystore` interface narrows to `store(plaintext) → keyTag` / `load(keyTag) → plaintext`. No public/private key pair.
- Native module is a small napi-rs binding over `apple-native-keyring-store::protected` (already in the dep tree). No hand-rolled crypto; no C/Obj-C.
- Windows: either bespoke NCrypt binding (per D1) or PIN/passphrase only on Windows (faster ship).

## What changes if you pick Option B

The plan executes as written, with one extra prerequisite: stand up a fork repo, set up its release pipeline, document the patch, get it building against Electron 42's ABI.
