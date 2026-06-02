# macOS Touch ID for the `webauthn` Unlock Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make macOS Touch ID (Secure Enclave platform authenticator) work as the `webauthn` unlock mode in packaged, signed Interviewer v7 desktop builds.

**Architecture:** Enable Electron's built-in Touch ID authenticator via `app.configureWebAuthn({ touchID: { keychainAccessGroup } })` plus a `keychain-access-groups` entitlement, gated to signed macOS builds. The existing PRF → KEK → unwrap-DEK envelope in `electron/auth/vault.ts` is untouched — only the authenticator _source_ changes. A short signed-build spike (Task 3) confirms Electron exposes the WebAuthn PRF extension; if it does not, a pre-agreed native-addon contingency (Tasks C1–C3) supplies PRF instead. The renderer gains a platform-authenticator availability check so Macs without Touch ID fall back to PIN/passphrase rather than hanging.

**Tech Stack:** Electron 42, `app.configureWebAuthn` (Touch ID API, electron #51411), electron-builder + codesign/notarization, WebAuthn (`navigator.credentials` + PRF extension), React renderer, Vitest, Biome/oxlint, oxfmt.

**Spec:** `docs/superpowers/specs/2026-05-27-macos-touch-id-design.md`

---

## Prerequisite (already landed, no work)

The packaged renderer is served from `app://localhost` (secure context) rather than `file://`. Touch ID — like all WebAuthn — requires that trustworthy origin. If `electron/main.ts` ever reverts to `loadFile(...)`, every task below regresses. No action; noted so the dependency is explicit.

## Configuration values used throughout

- **appId / bundle id:** `Network-Canvas-Interviewer-7` (from `electron-builder.config.cjs`).
- **Apple Team ID:** the signing team's 10-character identifier (e.g. `ABCDE12345`). Provided by the maintainer; it is not secret (it ships in every signed app). Referred to below as `<TEAM_ID>`.
- **Keychain access group:** `<TEAM_ID>.Network-Canvas-Interviewer-7`. This exact string must appear **both** in the entitlement (Task 1) and in the runtime `configureWebAuthn` call (Task 2) — a mismatch makes the Secure Enclave authenticator silently unavailable.
- **Touch ID prompt reason:** `Unlock Network Canvas Interviewer`.

## File structure

| File                                                                     | Responsibility                                                                                 | Task |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---- |
| `apps/interviewer-v7/build-resources/entitlements.mac.plist`             | Declare `keychain-access-groups` so the signed app can claim the Secure Enclave keychain group | 1    |
| `apps/interviewer-v7/build-resources/entitlements.mac.inherit.plist`     | Same group for inherited (helper) processes                                                    | 1    |
| `apps/interviewer-v7/electron/main.ts`                                   | Enable `touchID` in `configureWebAuthn` on signed macOS builds only                            | 2    |
| `apps/interviewer-v7/src/lib/auth/webauthn.ts`                           | New `isPlatformAuthenticatorAvailable()` helper                                                | 4    |
| `apps/interviewer-v7/src/lib/auth/__tests__/webauthn.test.ts`            | Unit tests for the helper (new file)                                                           | 4    |
| `apps/interviewer-v7/src/components/SetupWizard/Step2MethodPicker.tsx`   | Gate the "Biometric" offer on a platform authenticator in Electron                             | 5    |
| `apps/interviewer-v7/CLAUDE.md`, `README.md`, `electron/main.ts` comment | Docs reflecting Touch ID is live                                                               | 7    |

Contingency (only if Task 3 shows PRF is absent):

| File                                                                                              | Responsibility                                                       | Task |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---- |
| `apps/interviewer-v7/package.json`                                                                | Add the native WebAuthn addon dependency                             | C1   |
| `apps/interviewer-v7/electron/auth/webauthnNative.ts`                                             | Main-process wrapper around the native addon's create/get (new file) | C2   |
| `apps/interviewer-v7/electron/handlers/authHandlers.ts`, `electron/preload.ts`, `src/global.d.ts` | IPC surface for native create/get                                    | C2   |
| `apps/interviewer-v7/src/lib/auth/api.ts`, `src/lib/auth/electron.ts`                             | Route darwin-Electron create/get through the addon                   | C3   |

---

## Task 1: Add the `keychain-access-groups` entitlement

**Files:**

- Modify: `apps/interviewer-v7/build-resources/entitlements.mac.plist`
- Modify: `apps/interviewer-v7/build-resources/entitlements.mac.inherit.plist`

- [ ] **Step 1: Add the group to the main entitlements plist**

In `entitlements.mac.plist`, add the following key/array inside the top-level `<dict>` (after the existing `com.apple.security.cs.*` keys). Replace `<TEAM_ID>` with the real Team ID:

```xml
	<key>keychain-access-groups</key>
	<array>
		<string><TEAM_ID>.Network-Canvas-Interviewer-7</string>
	</array>
```

- [ ] **Step 2: Add the same group to the inherit plist**

In `entitlements.mac.inherit.plist`, add the identical key/array inside the top-level `<dict>`:

```xml
	<key>keychain-access-groups</key>
	<array>
		<string><TEAM_ID>.Network-Canvas-Interviewer-7</string>
	</array>
```

- [ ] **Step 3: Verify both plists are well-formed XML**

Run: `plutil -lint apps/interviewer-v7/build-resources/entitlements.mac.plist apps/interviewer-v7/build-resources/entitlements.mac.inherit.plist`
Expected: both report `OK`.

- [ ] **Step 4: Commit**

```bash
git add apps/interviewer-v7/build-resources/entitlements.mac.plist apps/interviewer-v7/build-resources/entitlements.mac.inherit.plist
git commit -m "feat(interviewer-v7): declare keychain-access-groups for Touch ID"
```

---

## Task 2: Enable Touch ID in the main process (signed macOS only)

**Files:**

- Modify: `apps/interviewer-v7/electron/main.ts` (the `app.configureWebAuthn({})` call)

- [ ] **Step 1: Add the Team ID / keychain-group constants**

In `electron/main.ts`, near the existing `RENDERER_SCHEME`/`RENDERER_ORIGIN` constants, add (replace `<TEAM_ID>` with the real value — it must match the entitlement from Task 1 exactly):

```ts
// Touch ID stores its Secure Enclave credential under this keychain group. The
// string MUST match `keychain-access-groups` in build-resources/entitlements.mac.plist
// and the binary must be signed with this team, or the platform authenticator is
// silently unavailable. The Team ID is not secret (it ships in every signed app).
const APPLE_TEAM_ID = '<TEAM_ID>';
const KEYCHAIN_ACCESS_GROUP = `${APPLE_TEAM_ID}.Network-Canvas-Interviewer-7`;
```

- [ ] **Step 2: Replace the `configureWebAuthn` call with the gated form**

Replace:

```ts
app.configureWebAuthn({});
```

with:

```ts
// Touch ID needs a signed binary that can claim KEYCHAIN_ACCESS_GROUP. In
// unsigned dev the group can't be claimed and navigator.credentials.create()
// would hang, so we enable the Secure Enclave authenticator only for packaged
// macOS builds; everywhere else the default WebAuthn stack (security keys,
// Windows Hello, Chromium virtual authenticator in dev) is used unchanged.
if (process.platform === 'darwin' && app.isPackaged) {
  app.configureWebAuthn({
    touchID: {
      keychainAccessGroup: KEYCHAIN_ACCESS_GROUP,
      promptReason: 'Unlock Network Canvas Interviewer',
    },
  });
} else {
  app.configureWebAuthn({});
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/interviewer-v7 && pnpm typecheck`
Expected: passes (no errors). If `touchID` is reported as an unknown property, the installed Electron typings predate #51411 — confirm `node -p "require('electron/package.json').version"` is ≥ 42.1.0; do not add an `as` cast.

- [ ] **Step 4: Lint + format the changed file**

Run: `cd /Users/jmh629/Projects/network-canvas && pnpm exec oxlint --fix apps/interviewer-v7/electron/main.ts && pnpm exec oxfmt apps/interviewer-v7/electron/main.ts`
Expected: 0 errors (pre-existing `app.whenReady().then()` floating-promise warnings are unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v7/electron/main.ts
git commit -m "feat(interviewer-v7): enable Touch ID authenticator on signed macOS builds"
```

---

## Task 3: PRF spike — signed build (DECISION GATE)

This task is verification, not code. It decides whether the built-in path (Tasks 4–7) is sufficient or the native-addon contingency (C1–C3) is required. There is no automated test — Touch ID needs Secure Enclave hardware and a signed binary.

**Pre-req:** Tasks 1 & 2 committed; running on a Mac with Touch ID; signing identity + `<TEAM_ID>` in the login keychain (and `APPLE_API_KEY`/`APPLE_API_KEY_ID`/`APPLE_API_ISSUER` exported if notarizing).

- [ ] **Step 1: Produce a signed local build**

Run: `cd apps/interviewer-v7 && pnpm electron:dist:mac`
Expected: `release-builds/` contains a `.app`/`.dmg`. Build succeeds and signing completes (no `code object is not signed at all`).

- [ ] **Step 2: Confirm the entitlement was applied to the signed app**

Run: `codesign -d --entitlements - --xml "release-builds/mac-arm64/Network Canvas Interviewer.app" 2>/dev/null | plutil -p -`
Expected: output includes `"keychain-access-groups" => [ "<TEAM_ID>.Network-Canvas-Interviewer-7" ]`. (Adjust the `mac-arm64` path for your arch.)

- [ ] **Step 3: Launch the built app and attempt biometric enrolment**

Open the built `.app`. In the first-launch setup wizard, choose **Biometric authentication** and complete enrolment.

- [ ] **Step 4: Record the outcome**

- **PRF present (Outcome A):** the Touch ID sheet appears, enrolment succeeds, and the app unlocks to the home screen. The built-in path works. → Skip Tasks C1–C3; continue at Task 4.
- **PRF absent (Outcome B):** the Touch ID sheet appears but enrolment fails with `Created passkey but could not derive an encryption key from it (PRF extension unsupported)` (surfaced from `webauthn.ts:createPasskey`). → Do Tasks C1–C3 before Task 6.
- **No Touch ID sheet at all:** keychain-group mismatch or signing problem. Re-check Step 2; if the entitlement is missing the group, fix Task 1's string. If present but Touch ID still doesn't appear, the keychain group may need to be expressed as `$(AppIdentifierPrefix)Network-Canvas-Interviewer-7` in the entitlement and as the resolved `<TEAM_ID>.Network-Canvas-Interviewer-7` at runtime — try that variant and rebuild.

- [ ] **Step 5: No commit** (verification only). Note the outcome (A or B) in the PR description.

---

## Task 4: Add `isPlatformAuthenticatorAvailable()` helper (TDD)

Path-independent — needed for graceful fallback regardless of the spike outcome.

**Files:**

- Modify: `apps/interviewer-v7/src/lib/auth/webauthn.ts`
- Create: `apps/interviewer-v7/src/lib/auth/__tests__/webauthn.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/__tests__/webauthn.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isPlatformAuthenticatorAvailable } from '../webauthn';

describe('isPlatformAuthenticatorAvailable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false when PublicKeyCredential is undefined', async () => {
    vi.stubGlobal('PublicKeyCredential', undefined);
    expect(await isPlatformAuthenticatorAvailable()).toBe(false);
  });

  it('returns true when a user-verifying platform authenticator is available', async () => {
    vi.stubGlobal('PublicKeyCredential', {
      isUserVerifyingPlatformAuthenticatorAvailable: () =>
        Promise.resolve(true),
    });
    expect(await isPlatformAuthenticatorAvailable()).toBe(true);
  });

  it('returns false when no platform authenticator is available', async () => {
    vi.stubGlobal('PublicKeyCredential', {
      isUserVerifyingPlatformAuthenticatorAvailable: () =>
        Promise.resolve(false),
    });
    expect(await isPlatformAuthenticatorAvailable()).toBe(false);
  });

  it('returns false when the availability check throws', async () => {
    vi.stubGlobal('PublicKeyCredential', {
      isUserVerifyingPlatformAuthenticatorAvailable: () =>
        Promise.reject(new Error('boom')),
    });
    expect(await isPlatformAuthenticatorAvailable()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/interviewer-v7 && pnpm exec vitest run src/lib/auth/__tests__/webauthn.test.ts`
Expected: FAIL — `isPlatformAuthenticatorAvailable` is not exported from `../webauthn`.

- [ ] **Step 3: Implement the helper**

In `src/lib/auth/webauthn.ts`, add directly below the existing `isWebAuthnAvailable` function:

```ts
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (
    typeof PublicKeyCredential === 'undefined' ||
    typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !==
      'function'
  ) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/interviewer-v7 && pnpm exec vitest run src/lib/auth/__tests__/webauthn.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint + format**

Run: `cd /Users/jmh629/Projects/network-canvas && pnpm exec oxlint --fix apps/interviewer-v7/src/lib/auth/webauthn.ts apps/interviewer-v7/src/lib/auth/__tests__/webauthn.test.ts && pnpm exec oxfmt apps/interviewer-v7/src/lib/auth/webauthn.ts apps/interviewer-v7/src/lib/auth/__tests__/webauthn.test.ts`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/interviewer-v7/src/lib/auth/webauthn.ts apps/interviewer-v7/src/lib/auth/__tests__/webauthn.test.ts
git commit -m "feat(interviewer-v7): add platform authenticator availability check"
```

---

## Task 5: Gate the wizard's "Biometric" offer on a platform authenticator

So a packaged macOS (or Windows) machine with no Touch ID / Windows Hello shows "Biometric" as unavailable and the user picks PIN/passphrase, instead of the enrolment attempt hanging. Web behaviour is intentionally left unchanged (it may legitimately use a security key or DevTools virtual authenticator).

**Files:**

- Modify: `apps/interviewer-v7/src/components/SetupWizard/Step2MethodPicker.tsx`

- [ ] **Step 1: Add imports**

At the top of `Step2MethodPicker.tsx`, add to the existing import block:

```ts
import { isPlatformAuthenticatorAvailable } from '~/lib/auth/webauthn';
import { isCapacitor, isElectron } from '~/lib/platform/platform';
```

(Replace the existing `import { isCapacitor } from '~/lib/platform/platform';` line — do not duplicate the import.)

- [ ] **Step 2: Replace the non-Capacitor branch of `checkBiometric`**

Replace:

```ts
      } else {
        const supported = isAuthenticatorSupported();
        if (supported) {
          setBiometric({ status: 'available' });
        } else {
          setBiometric({
            status: 'unavailable',
            reason: UNAVAILABLE_REASON_TEXT['no-hardware'],
          });
        }
      }
```

with:

```ts
      } else if (!isAuthenticatorSupported()) {
        setBiometric({
          status: 'unavailable',
          reason: UNAVAILABLE_REASON_TEXT['no-hardware'],
        });
      } else if (isElectron && !(await isPlatformAuthenticatorAvailable())) {
        // Packaged Electron with no Touch ID / Windows Hello: offering biometric
        // would hang on navigator.credentials.create(). Route to PIN/passphrase.
        setBiometric({
          status: 'unavailable',
          reason: UNAVAILABLE_REASON_TEXT['no-hardware'],
        });
      } else {
        setBiometric({ status: 'available' });
      }
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/interviewer-v7 && pnpm typecheck`
Expected: passes.

- [ ] **Step 4: Lint + format**

Run: `cd /Users/jmh629/Projects/network-canvas && pnpm exec oxlint --fix apps/interviewer-v7/src/components/SetupWizard/Step2MethodPicker.tsx && pnpm exec oxfmt apps/interviewer-v7/src/components/SetupWizard/Step2MethodPicker.tsx`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v7/src/components/SetupWizard/Step2MethodPicker.tsx
git commit -m "feat(interviewer-v7): only offer biometric when a platform authenticator exists"
```

---

## Tasks C1–C3: Native-addon contingency (ONLY if Task 3 = Outcome B)

Skip entirely if the spike showed PRF present. These supply PRF on macOS via the maintainer-approved native addon. The addon's exact create/get signatures are external and version-dependent — confirm them from its README at execution time; the integration points below are fixed.

### Task C1: Add and rebuild the native addon

**Files:**

- Modify: `apps/interviewer-v7/package.json`

- [ ] **Step 1: Read the addon docs to confirm the package name and API**

Open <https://github.com/vault12/electron-webauthn-mac> (and the npm package it publishes). Confirm: the npm package name, whether it runs in the main process, and the exact create/get function names and their PRF input/output shape. Record these in the PR description.

- [ ] **Step 2: Install the addon**

Run: `cd apps/interviewer-v7 && pnpm add <addon-package-name>`
Expected: it appears under `dependencies` in `package.json`.

- [ ] **Step 3: Rebuild native modules for the Electron ABI**

Add the addon to the `electron:rebuild` script in `package.json` if it ships a prebuilt that must match the ABI, then run: `cd apps/interviewer-v7 && pnpm electron:rebuild`
Expected: completes without ABI errors. (Library validation is already disabled in `entitlements.mac.inherit.plist`, so the addon's `.node` loads under hardened runtime.)

- [ ] **Step 4: Commit**

```bash
git add apps/interviewer-v7/package.json ../../pnpm-lock.yaml
git commit -m "build(interviewer-v7): add native macOS WebAuthn addon for PRF"
```

### Task C2: Expose native create/get over IPC

**Files:**

- Create: `apps/interviewer-v7/electron/auth/webauthnNative.ts`
- Modify: `apps/interviewer-v7/electron/handlers/authHandlers.ts`
- Modify: `apps/interviewer-v7/electron/preload.ts`
- Modify: `apps/interviewer-v7/src/global.d.ts`

- [ ] **Step 1: Wrap the addon in `webauthnNative.ts`**

Create `electron/auth/webauthnNative.ts` exposing two functions that take a base64 salt and return `{ ok: true; credentialIdB64: string; prfOutputB64: string } | { ok: false; error: string }`, mapping the addon's create/get (from Task C1 Step 1) to that shape. Match the `RP_NAME`/user identifiers already in `src/lib/auth/api.ts` (`'Network Canvas Interviewer'`, `'interviewer-v7:device'`) and rpId `localhost`.

- [ ] **Step 2: Register IPC handlers**

In `electron/handlers/authHandlers.ts` `registerAuthHandlers()`, add `ipcMain.handle('auth:webauthnNative:create', …)` and `ipcMain.handle('auth:webauthnNative:get', …)` delegating to the `webauthnNative.ts` functions. Each takes `{ saltB64, credentialIdB64? }`.

- [ ] **Step 3: Bridge the channels in preload + types**

In `electron/preload.ts`, add `webauthnNativeCreate`/`webauthnNativeGet` to the exposed `auth` object. In `src/global.d.ts`, add the matching methods to `AuthBridge` (signatures returning `Promise<{ ok: boolean; credentialIdB64?: string; prfOutputB64?: string; message?: string }>`). Keep all three in lockstep — the channel string is the contract.

- [ ] **Step 4: Typecheck + lint + format**

Run: `cd apps/interviewer-v7 && pnpm typecheck` then oxlint `--fix` + oxfmt on the four files. Expected: passes, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v7/electron/auth/webauthnNative.ts apps/interviewer-v7/electron/handlers/authHandlers.ts apps/interviewer-v7/electron/preload.ts apps/interviewer-v7/src/global.d.ts
git commit -m "feat(interviewer-v7): IPC surface for native macOS WebAuthn"
```

### Task C3: Route darwin-Electron create/get through the addon

**Files:**

- Modify: `apps/interviewer-v7/src/lib/auth/electron.ts` (add `webauthnNativeCreate`/`webauthnNativeGet` wrappers calling `window.electronAPI.auth.*`)
- Modify: `apps/interviewer-v7/src/lib/auth/api.ts` (`enrol`, `unlock`, `reEnrol`, `verifyBiometric`)

- [ ] **Step 1: Add a darwin-Electron branch to the four flows**

In `api.ts`, where each flow currently calls `createPasskey(...)` / `authenticatePasskey(...)`, branch when `isElectron && window.electronAPI?.platform === 'darwin'` to the native wrappers, producing the same `{ credentialId, prfOutput }` the rest of each function already consumes. The downstream `electronAuth.setup/unlock/reEnrol/verifyWebAuthn` calls and the `vault.ts` envelope are unchanged — only the credential source differs.

- [ ] **Step 2: Typecheck + lint + format**

Run: `cd apps/interviewer-v7 && pnpm typecheck` then oxlint `--fix` + oxfmt on the two files. Expected: passes, 0 errors.

- [ ] **Step 3: Rebuild signed app and re-run Task 3 Step 3**

Run: `cd apps/interviewer-v7 && pnpm electron:dist:mac`, launch, enrol with biometric. Expected: Touch ID enrolment now succeeds (PRF supplied by the addon).

- [ ] **Step 4: Commit**

```bash
git add apps/interviewer-v7/src/lib/auth/api.ts apps/interviewer-v7/src/lib/auth/electron.ts
git commit -m "feat(interviewer-v7): route macOS WebAuthn through native addon"
```

---

## Task 6: Hardware test matrix (manual)

No automated coverage is possible for Secure Enclave + signed builds. Run against the build from Task 3 (Outcome A) or Task C3 (Outcome B).

- [ ] **Step 1: Touch ID Mac — full lifecycle**

On a Mac with Touch ID, using the built/signed app: enrol with biometric → quit & relaunch → unlock with Touch ID → Settings → re-enrol (Manage authenticator) → unlock with the new credential → revoke (data wipe) → confirm setup wizard reappears. Expected: every step prompts Touch ID and succeeds; re-enrol stays atomic (a cancelled re-enrol leaves the old credential working).

- [ ] **Step 2: Idle relock + step-up**

With Touch ID enrolled: let the idle timer (`useIdleTimer`) elapse → confirm the LockScreen requires Touch ID. Trigger a step-up action (the `StepUpAuthDialog` `requireFreshUnlock()` path, e.g. an export when `requireUnlockOnExport` is set) → confirm Touch ID re-verifies without toggling the global lock.

- [ ] **Step 3: Non-Touch-ID Mac — graceful fallback**

On a Mac without Touch ID (or via a build run on such hardware): open the setup wizard → confirm "Biometric authentication" is shown **disabled** with "No biometric sensor available on this device", and PIN/passphrase enrol and unlock normally.

- [ ] **Step 4: No regressions elsewhere**

Smoke-test a Windows build (Windows Hello still enrols/unlocks) and confirm `pnpm dev` web build still offers biometric with a DevTools virtual authenticator. Capacitor `biometric-native` is untouched — no retest needed.

- [ ] **Step 5: No commit** (verification). Record results in the PR description.

---

## Task 7: Documentation

**Files:**

- Modify: `apps/interviewer-v7/electron/main.ts` (the comment above `configureWebAuthn`)
- Modify: `apps/interviewer-v7/CLAUDE.md` (auth-modes note)
- Modify: `apps/interviewer-v7/README.md`

- [ ] **Step 1: Update the main.ts comment**

Replace the now-stale "for now we enable the default WebAuthn stack only … Touch ID needs a signed binary + `keychainAccessGroup`" comment with a description of the implemented behaviour (Touch ID enabled on signed macOS builds via `KEYCHAIN_ACCESS_GROUP`; dev/unsigned uses the default stack). If Outcome B, note the native addon supplies PRF.

- [ ] **Step 2: Update CLAUDE.md and README**

In the `apps/interviewer-v7/CLAUDE.md` "Five auth modes" section, update the `webauthn` bullet to state Touch ID works on signed macOS builds (and the native-addon detail if Outcome B). Mirror any architecture note in `README.md`.

- [ ] **Step 3: Commit**

```bash
git add apps/interviewer-v7/electron/main.ts apps/interviewer-v7/CLAUDE.md apps/interviewer-v7/README.md
git commit -m "docs(interviewer-v7): document macOS Touch ID support"
```

---

## Self-review

**Spec coverage:**

- Spike (spec §Work breakdown 1) → Task 3. Built-in path (2) → Tasks 2, 4, 5. Native fallback (2′) → Tasks C1–C3. Entitlements/signing/CI (3) → Tasks 1, 3 (Steps 1–2). Hardware testing (4) → Task 6. Docs (5) → Task 7. Secure-context prerequisite → Prerequisite section. Success criteria (enrol/unlock via PRF; non-Touch-ID fallback; no regressions) → Tasks 3, 5, 6. All covered.
- CI signing secrets (spec §3): assumed present per the maintainer's "identity + Team ID ready now" answer; Task 3 exercises the signed/notarized path and would surface a gap. No standalone task — flagged here so it isn't mistaken for an omission.

**Placeholder scan:** `<TEAM_ID>` is required external config (the maintainer's Apple Team ID), explained in "Configuration values", not a logic placeholder. Addon API specifics in C1–C3 are external/version-dependent with an explicit "confirm from README" step — legitimately not knowable at plan time. No vague "add error handling"-style steps.

**Type consistency:** `isPlatformAuthenticatorAvailable(): Promise<boolean>` defined in Task 4 and consumed (awaited) in Task 5. `KEYCHAIN_ACCESS_GROUP` defined in Task 2 Step 1, matches the entitlement string in Task 1. Contingency wrappers return the `{ ok, credentialIdB64?, prfOutputB64?, message? }` shape consistently across C2/C3 and the existing `{ credentialId, prfOutput }` envelope inputs in `api.ts`.
