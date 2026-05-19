# Security setup wizard

## Background

`apps/interviewer-v7` currently presents first-launch auth via
`src/components/SetupScreen.tsx`, a single-screen chooser with three
hard-coded modes: WebAuthn passkey, 8-digit PIN, or no lock. The screen
takes over the whole viewport (`AuthGate` renders it when
`state.kind === 'unconfigured'`).

We're replacing this with a multi-step wizard that:

- Explains the security trade-off with platform-appropriate framing
  (warning on Electron where the database would otherwise be plaintext,
  info on iOS/Android where the OS sandbox already protects data at
  rest).
- Offers three auth methods with a unified user-facing label —
  Biometric authentication, PIN code, Passphrase — each dispatching to
  the right backend per platform.
- Adds two new step-up auth toggles (require unlock before resuming an
  interview / before exporting data).

The app is in development. No data migrations are required; schemas
change in place.

## Goals

1. Multi-step `SetupWizardDialog` hosted in a fresco-ui `Dialog`,
   dismissible. Dismiss = enrol as `mode: none`.
2. Add two new auth modes: `passphrase` (free-form, min 12 chars,
   strength meter) and `biometric-native` (Capacitor plugin wrapping
   `LAContext` / `BiometricPrompt`).
3. Add two new persisted settings: `requireUnlockOnResume` (default
   `true`), `requireUnlockOnExport` (default `false`). Both default
   surfaced in step 4 of the wizard and editable later in
   `Settings.tsx`.
4. Step-up auth runs in an embedded `StepUpAuthDialog` rather than
   bouncing the global app state through `locked`.

Non-goals:

- Re-encrypting the SQLCipher DB in place when switching auth modes.
  Mode changes still require `revoke()` (data wipe), same as today.
- Recovery codes for any auth mode.
- Migrating from `mode: none` to a secured mode without data loss.

## Design

### Component map

| File                                                           | Action | Purpose                                                                                |
| -------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| `src/components/SetupWizardDialog.tsx`                         | NEW    | Dialog host; owns wizard state via `useWizardState`.                                   |
| `src/components/SetupWizard/Step1Intro.tsx`                    | NEW    | Platform-specific alert + explanation + Next / Continue-without-security.              |
| `src/components/SetupWizard/Step2MethodPicker.tsx`             | NEW    | `RichSelectGroup` with three options, availability-aware.                              |
| `src/components/SetupWizard/Step3Configure.tsx`                | NEW    | Routes to one of three method-specific sub-views by selection.                         |
| `src/components/SetupWizard/Step4Behavior.tsx`                 | NEW    | Auto-lock timeout + two unlock-required switches.                                      |
| `src/components/SetupWizard/SkipConfirmation.tsx`              | NEW    | Sub-dialog for dismiss / "Continue without security"; platform-aware affirmation.      |
| `src/components/BrandedBackdrop.tsx`                           | NEW    | Blob art rendered behind the wizard dialog when `unconfigured`.                        |
| `src/components/UnlockForms/BiometricUnlockForm.tsx`           | NEW    | Extracted from `LockScreen`; reused by `StepUpAuthDialog`.                             |
| `src/components/UnlockForms/PinUnlockForm.tsx`                 | NEW    | Extracted from `LockScreen`; reused by `StepUpAuthDialog`.                             |
| `src/components/UnlockForms/PasswordUnlockForm.tsx`            | NEW    | New passphrase unlock form, used by `LockScreen` and `StepUpAuthDialog`.               |
| `src/components/SetupScreen.tsx`                               | DELETE | Replaced by `SetupWizardDialog`.                                                       |
| `src/components/AuthGate.tsx`                                  | UPDATE | On `unconfigured`: render `<BrandedBackdrop/>` + `<SetupWizardDialog/>` over children. |
| `src/components/LockScreen.tsx`                                | UPDATE | Use shared `UnlockForms/*`; add passphrase dispatch.                                   |
| `src/lib/auth/api.ts`                                          | UPDATE | Add passphrase + biometric-native + verify families.                                   |
| `src/lib/auth/vaultMetadata.ts`                                | UPDATE | Extend union with `passphrase` and `biometric-native`.                                 |
| `src/lib/auth/AuthContext.tsx`                                 | UPDATE | Handle new modes in `status()` reduction.                                              |
| `src/lib/auth/biometricNative.ts`                              | NEW    | Capacitor plugin wrapper.                                                              |
| `src/lib/auth/StepUpAuthProvider.tsx`                          | NEW    | Provider exposing `useStepUpAuth()`; renders embedded verify dialog.                   |
| `src/lib/auth/StepUpAuthDialog.tsx`                            | NEW    | Embedded verify dialog mounted by the provider.                                        |
| `src/lib/db/types.ts`                                          | UPDATE | Add two new `StoredSettings` fields.                                                   |
| `src/lib/db/db.ts`                                             | UPDATE | Schema in place (no version bump).                                                     |
| `src/lib/db/electron-settings.ts`                              | UPDATE | Forward new fields through IPC.                                                        |
| `src/routes/Settings.tsx`                                      | UPDATE | New "Lock behavior" section.                                                           |
| `src/routes/Interview.tsx`                                     | UPDATE | Call `requireFreshUnlock()` on resume when toggle is on.                               |
| `src/routes/Sessions.tsx` / `ExportDialog.tsx`                 | UPDATE | Call `requireFreshUnlock()` before export when toggle is on.                           |
| `src/providers/AppProviders.tsx`                               | UPDATE | Mount `StepUpAuthProvider` inside `AuthProvider`.                                      |
| `electron/auth/vault.ts`                                       | UPDATE | Add passphrase setup/unlock/verify/reEnrol; same envelope as PIN.                      |
| `electron/auth/vaultStore.ts`                                  | UPDATE | Extend `VaultRecord` union with passphrase variant (in place, no migration).           |
| `electron/db/schema.ts`                                        | UPDATE | Add two boolean columns to settings table.                                             |
| `electron/handlers/authHandlers.ts`                            | UPDATE | Register `auth:setup:passphrase` + `auth:unlock:passphrase` + `auth:verify:*`.         |
| `electron/preload.ts`                                          | UPDATE | Mirror new IPC channels.                                                               |
| `src/global.d.ts`                                              | UPDATE | Mirror new IPC channels.                                                               |
| `apps/interviewer-v7/package.json`                             | UPDATE | Add `@aparajita/capacitor-biometric-auth`.                                             |
| `apps/interviewer-v7/ios/App/App/Info.plist`                   | UPDATE | Add `NSFaceIDUsageDescription`.                                                        |
| `apps/interviewer-v7/android/app/src/main/AndroidManifest.xml` | UPDATE | Add `<uses-permission android:name="android.permission.USE_BIOMETRIC"/>`.              |
| `apps/interviewer-v7/CLAUDE.md`                                | UPDATE | Update the "Three auth modes" invariant to five.                                       |

### Auth model

`VaultMetadata` (`src/lib/auth/vaultMetadata.ts`) grows to five variants:

```ts
export type VaultMetadata =
  | {
      mode: 'webauthn';
      credentialIdB64: string;
      saltB64: string;
      enrolledAt: string;
    }
  | { mode: 'biometric-native'; enrolledAt: string }
  | {
      mode: 'pin';
      kdfSaltB64: string;
      kdfIterations: number;
      verifierB64: string;
      enrolledAt: string;
    }
  | {
      mode: 'passphrase';
      kdfSaltB64: string;
      kdfIterations: number;
      verifierB64: string;
      enrolledAt: string;
    }
  | { mode: 'none'; enrolledAt: string };
```

`pin` and `passphrase` stay distinct despite having identical KDF
shapes — switching between them is destructive (revoke + re-enrol)
and the unlock UIs differ enough that the discriminator earns its
keep. `biometric-native` carries no key material; the plugin owns its
own state and there's no DEK to wrap on Capacitor (data sandbox is the
at-rest boundary).

The renderer's user-facing "Biometric authentication" option maps to
two backends:

- Electron / web → existing `webauthn` mode (WebAuthn + PRF unwraps
  the SQLCipher DEK on Electron, gate-only on web).
- Capacitor → `biometric-native` mode via `LAContext` /
  `BiometricPrompt`.

`auth/api.ts` adds these public functions, all platform-dispatching
just like the existing ones:

```ts
export function enrolWithBiometricNative(): Promise<AuthResult>;
export function unlockWithBiometricNative(): Promise<AuthResult>;
export function enrolWithPassphrase(phrase: string): Promise<AuthResult>;
export function unlockWithPassphrase(phrase: string): Promise<AuthResult>;
export function reEnrolWithPassphrase(args: {
  currentPhrase: string;
  nextPhrase: string;
}): Promise<AuthResult>;

export function verifyBiometric(signal?: AbortSignal): Promise<AuthResult>;
export function verifyWithPin(pin: string): Promise<AuthResult>;
export function verifyWithPassphrase(phrase: string): Promise<AuthResult>;
```

The `verify*` family is new and used only by step-up auth. On
Electron the IPC channels (`auth:verify:*`) re-derive the KEK and
compare against the wrap without releasing or re-wrapping the DEK; on
Capacitor/web they re-derive and compare against `verifierB64`.

`biometricNative.ts`:

```ts
export async function isBiometricNativeAvailable(): Promise<
  | { ok: true }
  | {
      ok: false;
      reason: 'no-hardware' | 'not-enrolled' | 'no-device-passcode' | 'unknown';
    }
>;

export async function verifyBiometric(
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; message: string }>;
```

`isBiometricNativeAvailable()` is what step 2 calls to decide whether
to disable the option and which message to show. Outside Capacitor it
returns `{ ok: false, reason: 'no-hardware' }` so the option falls
back to the `webauthn` `isAuthenticatorSupported()` check.

### Wizard flow

Hosted in a fresco-ui `Dialog`, rendered by `AuthGate` over the
`<BrandedBackdrop/>` whenever `state.kind === 'unconfigured'`. The
backdrop is the existing blob art (extracted from `StageBackground`
where it makes sense; otherwise a new minimal component using
`@codaco/art`).

**State** (managed by `useWizardState`):

```ts
type WizardState = {
  step: 1 | 2 | 3 | 4;
  selectedMethod: 'biometric' | 'pin' | 'passphrase' | null;
  enrolmentCommitted: boolean;
  recoveryAffirmed: boolean;
  behavior: {
    idleTimeoutMinutes: IdleTimeoutMinutes;
    requireUnlockOnResume: boolean;
    requireUnlockOnExport: boolean;
  };
};
```

PIN / passphrase cleartext never lives in `WizardState` — it lives
only in the step 3 form's local state and falls out of scope when
step 3 Next commits.

#### Step 1 — Intro

- Title: **Secure this device**.
- Body: short explanation paraphrasing the existing SetupScreen lead.
- Platform-specific `Alert`:
  - Electron (warning): "If you do not enable security, your data
    will be stored without encryption on this device. Anyone with
    access to this device or its files will be able to read all
    collected data."
  - iOS / Android (info): "Even without app security, your data is
    sandboxed by the operating system and is not directly accessible
    to other apps. Enabling app security adds protection if the
    device itself is unlocked and physically accessed by someone
    else."
- Footer: **Next** (primary) → step 2. **Continue without security**
  (secondary) → opens `SkipConfirmation`.
- Dismiss (X / Escape / backdrop) → opens `SkipConfirmation`.

#### Step 2 — Method picker

Single `<RichSelectGroup orientation="vertical">`:

| Option                   | Available when                                                                    | Disabled reason text (when applicable)                                                 |
| ------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Biometric authentication | Capacitor: `isBiometricNativeAvailable().ok`. Else: `isAuthenticatorSupported()`. | One of: "No biometric sensor", "No biometric enrolled", "Set a device passcode first". |
| PIN code                 | Always.                                                                           | —                                                                                      |
| Passphrase               | Always.                                                                           | —                                                                                      |

Footer: **Back** → step 1. **Next** (disabled until selection) → step 3.

#### Step 3 — Configure

Renders one of three sub-views by `selectedMethod`.

State machine for step 3:

- **First visit (`enrolmentCommitted === false`):** show the form for
  the selected method.
- **Revisit (`enrolmentCommitted === true`):** show a read-only
  summary card ("PIN configured", etc.) with a "Change" button that
  reveals the form again. Next without changes just navigates
  forward.

**Biometric configure (form):**

- Body: "You'll be prompted to verify with your device's biometric
  sensor."
- Affirmation checkbox: "I understand there is no recovery."
- Next button → step 3 Next handler (below).

**PIN configure (form):**

- Two `InputField` (numeric, `maxLength: 8`, `inputMode: 'numeric'`):
  "Enter PIN" + "Confirm PIN".
- Validation: digits only, exactly 8, both match.
- Affirmation checkbox: "I understand there is no recovery."
- Next button (enabled when valid + affirmed) → step 3 Next handler.

**Passphrase configure (form):**

- First field: `<PasswordField showStrengthMeter>` — "Enter
  passphrase".
- Second field: `<PasswordField>` — "Confirm passphrase".
- Validation: `length >= 12`, `getPasswordStrength(value).score >= 3`,
  both fields match.
- Affirmation checkbox: "I understand there is no recovery."
- Next button (enabled when valid + affirmed) → step 3 Next handler.

**Step 3 Next handler** (single commit point for the auth side):

1. Read `authApi.status()`.
2. If `configured && mode !== 'none'`, call `authApi.revoke()` —
   handles the "user backed up and changed method" case
   idempotently.
3. Call the appropriate `enrolWith*()`:
   - Biometric: `authApi.enrol(signal)` on Electron / web,
     `authApi.enrolWithBiometricNative()` on Capacitor.
   - PIN: `authApi.enrolWithPin(pin)`.
   - Passphrase: `authApi.enrolWithPassphrase(phrase)`.
4. On failure → surface error on step 3, stay put,
   `enrolmentCommitted` stays `false`.
5. On success → set `enrolmentCommitted = true`, advance to step 4.

#### Step 4 — Behavior

- Title: **Lock behavior**.
- `<RichSelectGroup>` (single-select) for **Auto-lock after**:
  `1 / 5 / 15 / 30 / 60 minutes`. Default `15`. Keeping the existing
  five options (the value set already in `idleTimeoutMinutes`) rather
  than trimming.
- `<Switch>` — **Require unlock before resuming an interview**.
  Default `true`.
- `<Switch>` — **Require unlock before exporting data**.
  Default `false`.
- Footer: **Back** → step 3 (read-only summary). **Finish** →
  persists the three settings + closes wizard. Dismiss → opens
  `SkipConfirmation`.

#### `SkipConfirmation` sub-dialog

Triggered by:

- "Continue without security" button on step 1.
- Dismiss (X / Escape / backdrop) at any point in the wizard.

Body copy adjusts based on whether enrolment has been committed
(`authApi.status().configured && mode !== 'none'`):

- Pre-enrolment: "Continue without app security?"
- Post-enrolment: "Cancel security setup? Your selected method will
  be removed and your data will be unencrypted."

Confirmation gating:

- Electron: affirmation checkbox required — "I understand that data
  on this device will not be encrypted at the app layer." Confirm
  button disabled until checked.
- iOS / Android: single confirm CTA, no checkbox.

On Confirm:

1. If `configured && mode !== 'none'`, call `authApi.revoke()`.
2. Call `authApi.enrolWithoutLock()`.
3. Close wizard. `AuthGate` transitions to `unlocked`; Home renders
   under the now-empty backdrop.

### Step-up auth

Two new persisted settings drive step-up:

- `requireUnlockOnResume: boolean` — default `true`.
- `requireUnlockOnExport: boolean` — default `false`.

When ON, opening a session (resume) or starting an export forces a
fresh authentication even if the app is currently unlocked. The
global `AuthGate` state stays `unlocked` throughout — step-up runs in
an embedded dialog.

**`StepUpAuthProvider`** (`src/lib/auth/StepUpAuthProvider.tsx`),
mounted inside `AuthProvider` in `AppProviders`:

```ts
type StepUpResult = { ok: true } | { ok: false; reason: 'cancelled' };

export function useStepUpAuth(): {
  requireFreshUnlock: () => Promise<StepUpResult>;
};
```

The provider holds a pending-resolve ref and renders
`<StepUpAuthDialog/>` when a request is pending.

`requireFreshUnlock()` semantics:

1. If `state.mode === 'none'` → resolve `{ ok: true }` immediately.
2. Otherwise → open `<StepUpAuthDialog/>`, return a promise that
   resolves on dialog completion.

`<StepUpAuthDialog/>` renders the same per-mode form components as
`LockScreen` (extracted into `src/components/UnlockForms/*`), but its
submit handler calls `authApi.verify*()` instead of
`authApi.unlock*()`. Success resolves `{ ok: true }`; cancel resolves
`{ ok: false, reason: 'cancelled' }`.

**Why `verify*` and not `lock + wait-for-unlock`:** the latter has
two visible side-effects (LockScreen flashes, the user's protocol
view tears down), and a failed step-up would leave the user on the
global LockScreen — surprising. The verify path stays inside a
dialog. If `unlock` cannot be cleanly split into a verify-only
operation in `electron/auth/vault.ts`, fall back to `lock + wait`
during implementation and revise.

**Callsites:**

- `src/routes/Interview.tsx` — at session resume, if
  `settings.requireUnlockOnResume === true`, call
  `requireFreshUnlock()`; on `{ ok: false }`, navigate back to Home.
- `src/components/ExportDialog.tsx` — at the confirm-export click
  handler, before invoking the export pipeline: if
  `settings.requireUnlockOnExport === true`, call
  `requireFreshUnlock()`; on `{ ok: false }`, close the dialog
  without exporting.

`lib/export/exportSessions.ts` itself is not changed — the gate
belongs at the component layer.

### Settings persistence

`StoredSettings` (`src/lib/db/types.ts`):

```ts
export type StoredSettings = {
  // ...existing fields
  idleTimeoutMinutes: IdleTimeoutMinutes;
  requireUnlockOnResume: boolean; // NEW, default true
  requireUnlockOnExport: boolean; // NEW, default false
};
```

In `src/lib/db/db.ts` and `electron/db/schema.ts`, add the two new
fields to the schema in place. No migrations — app is in development.
Existing dev DBs without the columns are wiped on next launch (web /
Capacitor) or fail open with defaults (Electron, depending on the
existing settings-read path; the simpler implementation is to drop
the existing DB file in dev).

The `electron-settings.ts` IPC wrapper carries the new fields.

`VaultRecord` in `electron/auth/vaultStore.ts` gets the passphrase
variant added in place. A stale v3-shaped file on disk is treated as
a fatal startup error, consistent with the existing "both legacy +
new DB existing is a fatal startup state" pattern — the developer
deletes the file.

### Settings.tsx surface

New "Lock behavior" section, placed adjacent to the existing
`Manage authenticator` block:

```
Lock behavior
─────────────
  Auto-lock after:                                  [RichSelectGroup]
  Require unlock before resuming an interview:      [Switch]
  Require unlock before exporting data:             [Switch]
```

When `state.mode === 'none'`:

- All three controls render but are disabled.
- Inline note: "Enable app security to use these options." with a
  "Set up security" link that calls `authApi.revoke()`. On
  `mode: none`, `revoke()` clears the metadata; the resulting
  `unconfigured` state re-mounts the wizard. Note that revoke
  retains today's destructive semantics — data is wiped on the
  Electron side. Surfacing this caveat to the user before the click
  is part of the implementation work but lives in `Settings.tsx`,
  not the wizard. Out of scope: making `mode: none` → secured
  conversion non-destructive.

The existing `Manage authenticator` block is unchanged in scope —
re-enrolment within the current mode (e.g. change PIN) routes
through it.

### Platform plugin config

`@aparajita/capacitor-biometric-auth` requires:

- `apps/interviewer-v7/ios/App/App/Info.plist` — add
  `NSFaceIDUsageDescription` ("Used to unlock the app on this
  device.").
- `apps/interviewer-v7/android/app/src/main/AndroidManifest.xml` —
  add `<uses-permission android:name="android.permission.USE_BIOMETRIC"/>`.
- `capacitor.config.ts` — no plugin config needed by default; verify
  during implementation.

## Testing

### Unit tests (Vitest, co-located)

- `src/lib/auth/__tests__/passphrase.test.ts` — KDF derivation,
  verifier match, `reEnrolWithPassphrase` atomicity. Mirrors the
  existing PIN tests.
- `src/lib/auth/__tests__/biometricNative.test.ts` — mock the
  Capacitor plugin's `isAvailable()` and `verify()` returns; assert
  each reason-code path surfaces correctly.
- `src/lib/auth/__tests__/stepUp.test.ts` — `StepUpAuthProvider`
  with React Testing Library: assert the promise resolves on form
  success, rejects on cancel, short-circuits on `mode: none`.
- `electron/auth/__tests__/vault.passphrase.test.ts` — setup /
  unlock / verify / reEnrol round-trips, wrong passphrase rejected,
  atomic reEnrol.

### Component tests

`src/components/__tests__/SetupWizardDialog.test.tsx` covers:

- Step 1 → dismiss on Electron opens `SkipConfirmation` with
  affirmation; on iOS / Android, one-click confirm.
- Step 1 → "Continue without security" routes through
  `SkipConfirmation` (same component as dismiss).
- Step 2 → each method's availability respects the mocked
  `isAvailable` return; disabled methods show the right reason text.
- Step 3 fresh enrol — biometric, PIN, passphrase happy paths.
- Step 3 validation rejects: short PIN, mismatched confirm, weak
  passphrase, missing affirmation.
- Step 3 revisit shows read-only summary; "Change" reveals form;
  Next without changes navigates forward without re-enrolling.
- Step 3 → going back to step 2 + changing method + re-Next on
  step 3 → `revoke()` is called before the new `enrolWith*()`.
- Step 4 Finish persists settings + closes; dismiss after step 3
  triggers `revoke()` + `enrolWithoutLock()`.

`src/components/__tests__/StepUpAuthDialog.test.tsx` covers each
mode's verify happy path and cancel path.

### Manual smoke tests (not automated)

- Run wizard on each platform target; verify biometric option
  availability matches device state (with / without enrolled
  biometric / with / without device passcode on iOS and Android).
- Trigger step-up on Interview resume + Export, verify dialog
  appears and unlock proceeds. Verify the global `AuthGate` stays
  `unlocked` throughout.
- Cancel wizard mid-step-3 (after enrol) and confirm vault is
  revoked and `mode: none` is committed.
- Switch between modes via the Settings → Manage authenticator +
  "Set up security" flow; verify destructive switch warnings still
  fire.

## Known limitations

- Orphan WebAuthn credential on enrol failure: if the OS prompt
  succeeds but persisting vault metadata fails, an unused credential
  remains in the platform authenticator. No security impact, just an
  unused entry.
- `mode: none` toggles render but cannot fire at runtime — the
  Settings disabled state communicates this.
- Switching between modes still wipes data (per existing `revoke()`
  semantics). Out of scope to fix here.
