# Biometric Keystore Unlock — Implementation Plan

> **STATUS (2026-05-28): Partially executed. Milestones A and B landed; C–F superseded.**
>
> Milestone A (revert WebAuthn scaffolding) and Milestone B (remove the `webauthn` vault mode) are committed on the `interviewer-v7` branch. Milestone C's decision-gate task (C1) found that no maintained npm package implements biometric-bound encrypt/decrypt for Electron; the original assumption that `antelle/node-secure-enclave` was adoptable does not hold (it hard-codes `BiometryCurrentSet`).
>
> The follow-up direction is captured in `docs/superpowers/specs/2026-05-28-biometric-keystore-package-survey.md` (Option A: Keychain ACL primitive via a thin napi-rs binding over `apple-native-keyring-store::protected`). Re-plan from that memo before resuming work.
>
> The remainder of this document is preserved for historical context.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `biometric-keystore` desktop unlock mode that wraps the SQLCipher DEK with an OS-biometric-bound key (Secure Enclave / Windows Hello), and remove the non-working `webauthn` mode and its WebAuthn scaffolding.

**Architecture:** The DEK (random SQLCipher key) is unchanged; a new vault variant wraps it with an OS key store instead of a PRF/PBKDF2 KEK — public-half encrypt at enrol (no prompt), private-half decrypt at unlock (OS forces Touch ID / Hello). Native key-store calls live in a new `electron/auth/biometricKeystore.ts` (macOS via `node-secure-enclave`, Windows via an NCrypt Passport/TPM-KSP binding), reached over `auth:*` IPC and dispatched from `src/lib/auth/api.ts` like the existing modes. The renderer keeps the `app://` secure scheme (needed only for `crypto.subtle`); all WebAuthn/`configureWebAuthn`/`http://localhost`/entitlement/provisioning-profile machinery is removed.

**Tech Stack:** Electron 42.3.0, better-sqlite3-multiple-ciphers (SQLCipher), `node-secure-enclave` (macOS), NCrypt/CNG via a native addon (Windows), Vitest, oxlint/oxfmt.

**Spec:** `docs/superpowers/specs/2026-05-28-biometric-keystore-unlock-design.md`

---

## Starting state (important)

The working tree carries a long debugging session's worth of changes. This plan **deliberately reverts** the WebAuthn-specific parts and keeps only the `app://` secure scheme + the `^42.3.0` catalog bump. Milestone A establishes a clean baseline before new work. Do A and B before C/D.

## File map

| File                                                                          | Change                                                                                                                                                                    | Milestone |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `electron/main.ts`                                                            | Revert `http://localhost` interception → `app://` secure scheme; remove `configureWebAuthn`, the `whenReady` block for it, and the temp `did-finish-load` diagnostic      | A         |
| `build-resources/entitlements.mac.plist`, `entitlements.mac.inherit.plist`    | Remove `keychain-access-groups` + `application-identifier` (restore originals)                                                                                            | A         |
| `electron-builder.config.cjs`                                                 | Remove `provisioningProfile` wiring                                                                                                                                       | A         |
| `build-resources/embedded.provisionprofile`                                   | Delete                                                                                                                                                                    | A         |
| `src/lib/auth/webauthn.ts`                                                    | Delete                                                                                                                                                                    | B         |
| `src/lib/auth/api.ts`                                                         | Remove `webauthn` branches from `enrol`/`unlock`/`reEnrol`/`verifyBiometric`; `isAuthenticatorSupported` stays for Electron biometric availability                        | B, C      |
| `electron/auth/vault.ts`                                                      | Remove `setup`/`unlock`/`reEnrol`/`verifyWebAuthn` (PRF); add `setupBiometric`/`unlockBiometric`/`verifyBiometric`/`reEnrolBiometric`                                     | B, C      |
| `electron/auth/vaultStore.ts`                                                 | Drop `webauthn` record variant; add `biometric-keystore` variant                                                                                                          | B, C      |
| `electron/auth/biometricKeystore.ts`                                          | **New** — platform-dispatched native wrap/unwrap                                                                                                                          | C, D      |
| `electron/handlers/authHandlers.ts`, `electron/preload.ts`, `src/global.d.ts` | Replace `auth:setup`/`auth:unlock`/`auth:reEnrol`/`verifyWebAuthn` IPC with `auth:setupBiometric`/`auth:unlockBiometric`/`auth:verifyBiometric`/`auth:biometricAvailable` | B, C      |
| `src/lib/auth/electron.ts`                                                    | Swap WebAuthn IPC wrappers for the biometric ones                                                                                                                         | C         |
| `src/components/SetupWizard/Step2MethodPicker.tsx`                            | Gate "Biometric" on the new availability check                                                                                                                            | C         |
| `apps/interviewer-v7/package.json`                                            | Add `node-secure-enclave` + the Windows addon                                                                                                                             | C, D      |
| `electron/main.ts` (comments), `CLAUDE.md`, `README.md`                       | Docs                                                                                                                                                                      | F         |

---

## Milestone A — Revert WebAuthn/launch scaffolding to a clean baseline

### Task A1: Revert renderer serving from `http://localhost` back to the `app://` secure scheme

The renderer needs a secure context only for `crypto.subtle` (PIN/passphrase PBKDF2); `app://` (secure scheme) provides it without intercepting `http`.

**Files:** Modify `electron/main.ts`

- [ ] **Step 1: Restore the scheme constants**

Replace the `RENDERER_HOST`/`RENDERER_ORIGIN` block with:

```ts
const RENDERER_SCHEME = 'app';
const RENDERER_HOST = 'localhost';
const RENDERER_ORIGIN = `${RENDERER_SCHEME}://${RENDERER_HOST}`;
```

- [ ] **Step 2: Re-add `registerSchemesAsPrivileged` (before `ready`)**

Add at module top level (it was removed when switching to http):

```ts
protocol.registerSchemesAsPrivileged([
  {
    scheme: RENDERER_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
```

- [ ] **Step 3: Restore the protocol handler to the custom scheme**

In `registerRendererProtocol()`, change `protocol.handle('http', …)` back to `protocol.handle(RENDERER_SCHEME, …)` and drop the `url.host !== RENDERER_HOST` proxy branch (custom scheme only ever serves our files):

```ts
function registerRendererProtocol() {
  const rendererDir = join(__dirname, '../renderer');
  protocol.handle(RENDERER_SCHEME, (request) => {
    const { pathname } = new URL(request.url);
    const requested = decodeURIComponent(pathname).replace(/^\/+/, '');
    const candidate =
      requested === '' || extname(requested) === '' ? 'index.html' : requested;
    const resolved = join(rendererDir, candidate);
    const within = relative(rendererDir, resolved);
    if (within.startsWith('..') || isAbsolute(within)) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(resolved).toString());
  });
}
```

`loadURL(`${RENDERER_ORIGIN}/index.html`)` and the `will-navigate` origin guard (`new URL(url).origin === RENDERER_ORIGIN`) already work unchanged with `RENDERER_ORIGIN = app://localhost`.

- [ ] **Step 4: Typecheck** — `cd apps/interviewer-v7 && pnpm typecheck` → passes.

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v7/electron/main.ts
git commit -m "revert(interviewer-v7): serve renderer from app:// secure scheme (WebAuthn http://localhost no longer needed)"
```

### Task A2: Remove `configureWebAuthn`, its `whenReady` block, the keychain constants, and the temp diagnostic

**Files:** Modify `electron/main.ts`

- [ ] **Step 1: Delete the `configureWebAuthn` call** in `app.whenReady()` (the `if (process.platform === 'darwin' && app.isPackaged) { app.configureWebAuthn({ touchID: … }) } else { app.configureWebAuthn({}) }` block) and the `APPLE_TEAM_ID` / `KEYCHAIN_ACCESS_GROUP` constants.

- [ ] **Step 2: Delete the temporary diagnostic** — the `mainWindow.webContents.on('did-finish-load', …)` block that writes `/tmp/nci-webauthn-diag.json`, and remove `writeFileSync` from the `node:fs` import if now unused.

- [ ] **Step 3: Typecheck + lint/format** — `pnpm typecheck`; then `pnpm exec oxlint --fix … && pnpm exec oxfmt …` on `electron/main.ts`. Expected: pass, no new warnings beyond the pre-existing floating-promise ones.

- [ ] **Step 4: Commit**

```bash
git add apps/interviewer-v7/electron/main.ts
git commit -m "revert(interviewer-v7): drop configureWebAuthn + startup diagnostic"
```

### Task A3: Restore entitlements, remove provisioning-profile wiring + file

**Files:** Modify `build-resources/entitlements.mac.plist`, `entitlements.mac.inherit.plist`, `electron-builder.config.cjs`; Delete `build-resources/embedded.provisionprofile`

- [ ] **Step 1: Remove `keychain-access-groups` and `com.apple.application-identifier`** keys from both plists, leaving only the original `com.apple.security.cs.*` (+ `app-sandbox`/`inherit` in the inherit plist) keys. Verify: `plutil -lint` on both → `OK`.

- [ ] **Step 2: Remove the provisioning-profile wiring** from `electron-builder.config.cjs` — the `fs`/`path` requires, the `MAC_PROVISIONING_PROFILE` const, and the `...(fs.existsSync(…) ? { provisioningProfile } : {})` spread in `mac`.

- [ ] **Step 3: Delete the profile file** — `git rm --cached apps/interviewer-v7/build-resources/embedded.provisionprofile 2>/dev/null; rm -f apps/interviewer-v7/build-resources/embedded.provisionprofile` (it was never committed; just remove from disk).

- [ ] **Step 4: Confirm config parses** — `node -e "require('./apps/interviewer-v7/electron-builder.config.cjs')"` → no error; `mac.provisioningProfile` absent.

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v7/build-resources/entitlements.mac.plist apps/interviewer-v7/build-resources/entitlements.mac.inherit.plist apps/interviewer-v7/electron-builder.config.cjs
git commit -m "revert(interviewer-v7): drop Touch ID keychain entitlement + provisioning profile"
```

### Task A4: Verify the baseline launches and PIN/passphrase work

- [ ] **Step 1: Build + launch** — `cd apps/interviewer-v7 && pnpm electron:build && pnpm exec electron-builder --mac dir --arm64 --config electron-builder.config.cjs`, then `open "release-builds/mac-arm64/Network Canvas Interviewer.app"`.
- [ ] **Step 2: Manual check** — app launches and stays alive; setup wizard offers PIN + Passphrase; enrol a PIN, relaunch, unlock. Expected: works (this confirms `app://` gives `crypto.subtle` a secure context). No commit.

---

## Milestone B — Remove the `webauthn` mode

### Task B1: Drop the `webauthn` vault variant + PRF functions (main process)

**Files:** Modify `electron/auth/vaultStore.ts`, `electron/auth/vault.ts`

- [ ] **Step 1: Remove the `webauthn` variant** from the `VaultRecord` union in `vaultStore.ts` (the `{ mode: 'webauthn'; credentialIdB64; saltB64; … }` member). Leave `pin`, `passphrase`, `none`.

- [ ] **Step 2: Delete the PRF functions** in `vault.ts`: `setup`, `unlock`, `reEnrol`, `verifyWebAuthn`, the `importKekFromBytes` helper (used only by PRF), and the `mode: 'webauthn'` branches in `status()` (drop `credentialIdB64`/`saltB64` from the return and the `'webauthn'` from its `mode` union).

- [ ] **Step 3: Typecheck** — `pnpm typecheck`. Expected: errors in `authHandlers.ts`/`api.ts` referencing the removed functions — fixed in B2/B3.

- [ ] **Step 4: (defer commit to end of B once it compiles)**

### Task B2: Remove the WebAuthn IPC surface

**Files:** Modify `electron/handlers/authHandlers.ts`, `electron/preload.ts`, `src/global.d.ts`, `src/lib/auth/electron.ts`

- [ ] **Step 1:** In `authHandlers.ts`, delete the `ipcMain.handle` registrations for `auth:setup`, `auth:unlock`, `auth:reEnrol`, `auth:verifyWebAuthn`.
- [ ] **Step 2:** In `preload.ts`, remove `setup`, `unlock`, `reEnrol`, `verifyWebAuthn` from the exposed `auth` object.
- [ ] **Step 3:** In `src/global.d.ts`, remove those methods from `AuthBridge`, and drop `credentialIdB64`/`saltB64` and `'webauthn'` from `AuthStatus`.
- [ ] **Step 4:** In `src/lib/auth/electron.ts`, remove the `setup`/`unlock`/`reEnrol`/`verifyWebAuthn` wrappers.

### Task B3: Remove `webauthn` from the renderer auth API and delete `webauthn.ts`

**Files:** Modify `src/lib/auth/api.ts`; Delete `src/lib/auth/webauthn.ts`; Modify `src/lib/auth/vaultMetadata.ts`

- [ ] **Step 1:** In `api.ts`, remove the `webauthn` paths: the `createPasskey`/`authenticatePasskey` imports and their use in `enrol`, `unlock`, `reEnrol`, and `verifyBiometric`; remove `enrol`/`unlock`/`reEnrol`'s now-unused WebAuthn branches. Keep `isAuthenticatorSupported` (reused for biometric availability in Milestone C) but drop its dependence on `isWebAuthnAvailable` (replace with the platform check from C3). Remove the `webauthn` case from `status()` and `vaultMetadata` reads.
- [ ] **Step 2:** Delete `src/lib/auth/webauthn.ts` and its test `src/lib/auth/__tests__/webauthn.test.ts`.
- [ ] **Step 3:** In `vaultMetadata.ts`, remove the `writeWebAuthn` writer and the `webauthn` metadata variant (web no longer offers biometric).
- [ ] **Step 4: Typecheck + knip** — `pnpm typecheck` (passes) and from repo root `pnpm knip --filter @codaco/interviewer-v7` to catch now-dead exports. Fix any dangling references.
- [ ] **Step 5: Lint/format + commit**

```bash
cd /Users/jmh629/Projects/network-canvas && pnpm exec oxlint --fix apps/interviewer-v7/{electron,src} && pnpm exec oxfmt apps/interviewer-v7/{electron,src}
git add -A apps/interviewer-v7/electron apps/interviewer-v7/src
git commit -m "refactor(interviewer-v7): remove the webauthn auth mode (no PRF on built-in Touch ID)"
```

---

## Milestone C — `biometric-keystore` mode, macOS

### Task C1: Evaluate `node-secure-enclave` (decision gate)

No code; resolves the native API the rest of C/D code against.

- [ ] **Step 1: Install + inspect** — `cd apps/interviewer-v7 && pnpm add node-secure-enclave`, then read its README/source. Record: exact function names + signatures for create-key / encrypt / decrypt; how the key is referenced/persisted (a tag string?); which access-control flag it uses and whether it's configurable to `biometryAny`; error shapes for user-cancel vs no-hardware vs key-invalidated; prebuilt vs compiled; macOS version floor.
- [ ] **Step 2: Smoke test** — minimal main-process script: create a key, `encrypt(Buffer.from('hi'))` → ciphertext (expect no prompt), `decrypt(ciphertext)` → Touch ID prompt → `'hi'`. Run in the signed dir build (Touch ID needs signing). Confirm round-trip + that decrypt prompts.
- [ ] **Step 3: Decide** — if it works and uses/permits `biometryAny`: adopt it (C2 wraps it). If it forces `biometryCurrentSet` or is unusable: fall back to a thin in-house `Security.framework` addon (note the deviation; same `BiometricKeystore` interface below). Record the chosen `BiometricKeystore` function names for C2. No commit.

### Task C2: Main-process `biometricKeystore` service + vault integration

**Files:** Create `electron/auth/biometricKeystore.ts`; Modify `electron/auth/vaultStore.ts`, `electron/auth/vault.ts`

- [ ] **Step 1: Define the platform-agnostic interface** in `biometricKeystore.ts` (macOS impl now; Windows added in D). Contract the rest of the plan targets:

```ts
export type BiometricKeystore = {
  isAvailable(): Promise<boolean>;
  // create key + encrypt — no biometric prompt
  wrap(plaintext: Buffer): Promise<{ keyTag: string; ciphertext: Buffer }>;
  // decrypt — triggers Touch ID / Hello
  unwrap(keyTag: string, ciphertext: Buffer): Promise<Buffer>;
  deleteKey(keyTag: string): Promise<void>;
};
```

Implement `macKeystore` against the `node-secure-enclave` API recorded in C1 (key tag e.g. `"network-canvas-interviewer.dek"`, ECIES encrypt/decrypt, `biometryAny`). Export `const keystore: BiometricKeystore = process.platform === 'darwin' ? macKeystore : … /* win in D */`.

- [ ] **Step 2: Add the vault variant** in `vaultStore.ts`:

```ts
| {
    version: number;
    mode: 'biometric-keystore';
    keyTag: string;
    wrapCiphertextB64: string; // DEK encrypted by the OS biometric key
  }
```

- [ ] **Step 3: Add vault functions** in `vault.ts` (mirror `setupPin`/`unlockPin` structure):

```ts
export async function setupBiometric(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  if (isVaultConfigured())
    return { ok: false, message: 'Vault already configured' };
  try {
    const dek = randomBytes(KEY_LEN_BYTES);
    const { keyTag, ciphertext } = await keystore.wrap(dek);
    const hex = bytesToHex(dek);
    openDatabase(hex);
    writeVault({
      version: CURRENT_VAULT_VERSION,
      mode: 'biometric-keystore',
      keyTag,
      wrapCiphertextB64: bufToB64(ciphertext),
    });
    unlockedKeyHex = hex;
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function unlockBiometric(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const record = readVault();
  if (!record) return { ok: false, message: 'Vault not configured' };
  if (record.mode !== 'biometric-keystore') {
    return { ok: false, message: 'Vault is not configured for biometrics' };
  }
  try {
    const dek = await keystore.unwrap(
      record.keyTag,
      b64ToBuf(record.wrapCiphertextB64),
    );
    const hex = bytesToHex(dek);
    openDatabase(hex);
    unlockedKeyHex = hex;
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function verifyBiometric(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const record = readVault();
  if (record?.mode !== 'biometric-keystore') {
    return { ok: false, message: 'Vault is not configured for biometrics' };
  }
  try {
    await keystore.unwrap(record.keyTag, b64ToBuf(record.wrapCiphertextB64));
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
```

Add `'biometric-keystore'` to `status()`'s `mode` union and the `locked` computation (treat like other secured modes: `locked: unlockedKeyHex === null`). In `revoke()`, also `await keystore.deleteKey(record.keyTag)` when the record is biometric (best-effort; ignore errors). Re-enrol is out of scope (no current-credential proof needed — Settings "switch mode" already goes through `revoke()`).

- [ ] **Step 4: Typecheck** — `pnpm typecheck` (errors remain in handlers/renderer until C3/C4).

### Task C3: IPC for the biometric mode

**Files:** Modify `electron/handlers/authHandlers.ts`, `electron/preload.ts`, `src/global.d.ts`

- [ ] **Step 1:** Register `auth:setupBiometric` → `vault.setupBiometric()`, `auth:unlockBiometric` → `vault.unlockBiometric()`, `auth:verifyBiometric` → `vault.verifyBiometric()`, `auth:biometricAvailable` → `keystore.isAvailable()`.
- [ ] **Step 2:** Expose `setupBiometric`/`unlockBiometric`/`verifyBiometric`/`biometricAvailable` on the preload `auth` object.
- [ ] **Step 3:** Add them to `AuthBridge` in `global.d.ts` (`setupBiometric: () => Promise<{ ok: boolean; message?: string }>`; `biometricAvailable: () => Promise<boolean>`; etc.) and add `'biometric-keystore'` to `AuthStatus.mode`.
- [ ] **Step 4: Typecheck** — `pnpm typecheck`.

### Task C4: Renderer dispatch + availability

**Files:** Modify `src/lib/auth/electron.ts`, `src/lib/auth/api.ts`, `src/components/SetupWizard/Step2MethodPicker.tsx`

- [ ] **Step 1:** In `electron.ts`, add wrappers: `setupBiometric`, `unlockBiometric`, `verifyBiometric`, `biometricAvailable` calling `window.electronAPI.auth.*`.
- [ ] **Step 2:** In `api.ts`, route the biometric flows: `enrol()` → `electronAuth.setupBiometric()`; `unlock()` → `electronAuth.unlockBiometric()`; `verifyBiometric()` → `electronAuth.verifyBiometric()` on Electron (Capacitor path unchanged; web path removed). Replace `isAuthenticatorSupported()`'s body with: `isElectron ? false-until-async` — instead expose `async function isBiometricSupported(): Promise<boolean>` returning `isElectron ? await electronAuth.biometricAvailable() : false`.
- [ ] **Step 3:** In `Step2MethodPicker.tsx`, in the non-Capacitor branch replace the `isAuthenticatorSupported()` + `isPlatformAuthenticatorAvailable()` checks with `await isBiometricSupported()`; available → enabled, else show `UNAVAILABLE_REASON_TEXT['no-hardware']`.
- [ ] **Step 4: Typecheck + lint/format + commit**

```bash
cd /Users/jmh629/Projects/network-canvas && pnpm exec oxlint --fix apps/interviewer-v7/{electron,src} && pnpm exec oxfmt apps/interviewer-v7/{electron,src}
git add -A apps/interviewer-v7
git commit -m "feat(interviewer-v7): biometric-keystore unlock via Secure Enclave (macOS)"
```

### Task C5: Verify macOS biometric end-to-end (manual, signed build)

- [ ] **Step 1:** Signed build — `pnpm electron:dist:mac` (or `electron-builder --mac dir --arm64` with a signing identity). Launch.
- [ ] **Step 2:** Wizard → **Biometric authentication** → enrol → expect **one** Touch ID prompt, success, home screen.
- [ ] **Step 3:** Quit, relaunch → unlock → Touch ID → DB opens.
- [ ] **Step 4:** Add a fingerprint in System Settings, relaunch, unlock → still works (confirms `biometryAny`). Settings → revoke (wipe) → wizard reappears; confirm the keychain key is gone (`security find-generic-password` for the tag returns nothing). No commit.

---

## Milestone D — `biometric-keystore` mode, Windows

### Task D1: Windows NCrypt key store (decision gate + binding)

**Files:** Modify `apps/interviewer-v7/package.json`; Create the Windows impl in `electron/auth/biometricKeystore.ts`

- [ ] **Step 1: Pick the binding.** Evaluate, in order: (a) an existing maintained Node module exposing NCrypt + the Microsoft Passport/TPM KSP with a Windows Hello `NCRYPT_UI_POLICY` and RSA-OAEP unwrap; (b) if none is suitable, a thin in-house N-API addon over `NCryptCreatePersistedKey`/`NCryptEncrypt`/`NCryptDecrypt` with `MS_KEY_STORAGE_PROVIDER`/`MS_PLATFORM_KEY_STORAGE_PROVIDER`, `NCRYPT_UI_POLICY` requiring Hello. Record the chosen module + API. (Note: `KeyCredentialManager` is sign-only / non-deterministic → not usable for key-wrap.)
- [ ] **Step 2: Smoke test** on a TPM + Hello-enrolled Windows machine: create key → encrypt a buffer (no prompt) → decrypt (Hello prompt) → round-trip.
- [ ] **Step 3: Implement `winKeystore`** in `biometricKeystore.ts` satisfying the same `BiometricKeystore` interface from C2, and set the platform dispatch: `process.platform === 'win32' ? winKeystore : process.platform === 'darwin' ? macKeystore : unavailableKeystore` (the `unavailableKeystore.isAvailable()` resolves `false`, so Linux shows biometric as unavailable → PIN/passphrase).
- [ ] **Step 4: Typecheck** — `pnpm typecheck`.

- [ ] **Step 5: Commit**

```bash
git add -A apps/interviewer-v7
git commit -m "feat(interviewer-v7): biometric-keystore unlock via Windows Hello/TPM (NCrypt)"
```

### Task D2: Verify Windows biometric end-to-end (manual, signed build)

- [ ] **Step 1:** Signed Windows build — `pnpm electron:dist:win` on a Hello-capable PC. Install + launch.
- [ ] **Step 2:** Enrol biometric → Hello prompt → success; relaunch → unlock via Hello; revoke → wizard reappears. No commit (record results in PR).

---

## Milestone E — Automated tests

### Task E1: Vault biometric round-trip test with a fake keystore

**Files:** Create `electron/auth/__tests__/vault-biometric.test.ts`

- [ ] **Step 1: Write the failing test** — inject a fake `BiometricKeystore` (in-memory map: `wrap` stores plaintext under a generated tag and returns it as ciphertext; `unwrap` returns it) via a module mock, then assert `setupBiometric()` → vault record has `mode: 'biometric-keystore'` + a `keyTag`, and a fresh `unlockBiometric()` opens the DB with the same DEK.

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
// vi.mock('../biometricKeystore', () => ({ keystore: makeFakeKeystore() }))
// then import { setupBiometric, unlockBiometric, lock, status } from '../vault'
it('wraps and unwraps the DEK via the keystore', async () => {
  expect((await setupBiometric()).ok).toBe(true);
  expect((await status()).mode).toBe('biometric-keystore');
  await lock();
  expect((await status()).locked).toBe(true);
  expect((await unlockBiometric()).ok).toBe(true);
  expect((await status()).locked).toBe(false);
});
```

- [ ] **Step 2: Run → fail** (`pnpm exec vitest run electron/auth/__tests__/vault-biometric.test.ts`) before C2 lands; **pass** after. Cover the `unwrap`-throws path → `unlockBiometric()` returns `{ ok: false }`.
- [ ] **Step 3: Commit**

```bash
git add apps/interviewer-v7/electron/auth/__tests__/vault-biometric.test.ts
git commit -m "test(interviewer-v7): vault biometric-keystore round-trip"
```

---

## Milestone F — Documentation

**Files:** Modify `electron/main.ts` comments, `apps/interviewer-v7/CLAUDE.md`, `README.md`

- [ ] **Step 1:** Update the `electron/main.ts` scheme comment to state the `app://` secure scheme exists for `crypto.subtle` (not WebAuthn).
- [ ] **Step 2:** In `CLAUDE.md`, rewrite the auth-modes section: remove `webauthn`; add `biometric-keystore` (Electron macOS Secure Enclave / Windows Hello-TPM, wraps the DEK, no PRF, no recovery). Update the `src/lib/auth/` and `electron/auth/` Source Surface rows.
- [ ] **Step 3:** Mirror in `README.md`. Commit.

```bash
git add apps/interviewer-v7/electron/main.ts apps/interviewer-v7/CLAUDE.md apps/interviewer-v7/README.md
git commit -m "docs(interviewer-v7): document biometric-keystore mode; drop webauthn"
```

---

## Self-review

**Spec coverage:** OS-biometric DEK wrap → C2; macOS Secure Enclave (`node-secure-enclave`) → C1/C2; Windows Hello/NCrypt → D1; no-recovery + `biometryAny` → C1 Step 3 + C2; drop `webauthn` (incl. web) → B; keep `app://` secure context, drop `http://localhost`/`configureWebAuthn`/entitlement/profile → A; naming `biometric-keystore` + "Biometric authentication" label → C2/C4; Linux → PIN/passphrase via `unavailableKeystore` → D1 Step 3; tests → E; docs → F. All covered.

**Placeholder scan:** The two "decision gate" tasks (C1, D1) resolve external/native APIs by evaluation rather than guessed code — deliberate, since `node-secure-enclave`'s exact API and the Windows binding aren't knowable without inspection/hardware; the `BiometricKeystore` interface they implement is fixed in C2 so downstream code is concrete. No vague "add error handling" steps.

**Type consistency:** `BiometricKeystore` (`isAvailable`/`wrap`/`unwrap`/`deleteKey`) is used identically in C2 (mac), D1 (win), and E1 (fake). Vault variant `{ mode: 'biometric-keystore'; keyTag; wrapCiphertextB64 }` matches across `vaultStore.ts`, `vault.ts`, and the test. IPC names (`auth:setupBiometric`/`auth:unlockBiometric`/`auth:verifyBiometric`/`auth:biometricAvailable`) match across handlers, preload, `global.d.ts`, and `electron.ts`.
