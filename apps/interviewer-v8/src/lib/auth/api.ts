import { reencryptAllRecords } from '../db/api';
import { db } from '../db/db';
import { getSessionDek, setSessionDek } from '../db/sessionKey';
import { requestPersistentStorage } from '../storage';
import * as vault from '../vault/vault';
import { isPrfSupported } from '../vault/webauthn';
import {
  isReencryptionPending,
  setReencryptionPending,
} from './reencryptionPending';

export type AuthMode = 'pin' | 'passphrase' | 'biometric' | 'none';
export type AuthResult = { ok: boolean; message?: string };

function toAuthResult(result: vault.EnrolResult): AuthResult {
  return result.message === undefined
    ? { ok: result.ok }
    : { ok: result.ok, message: result.message };
}

// Unlock/enrol take custody of the freshly derived session DEK. A reload drops
// this module + the holder, which re-locks the app (spec: reload re-locks).
async function applyUnlock(result: vault.UnlockResult): Promise<AuthResult> {
  if (!result.ok) return { ok: false, message: result.message };
  setSessionDek(result.dek);
  return { ok: true };
}

// Run the re-encryption sweep and persist whether it finished. Never throws: the
// vault + DEK are already valid, so a sweep problem must not break enrol/unlock —
// un-swept rows remain readable (decrypt is per-row self-describing). Failures
// set the `reencryptionPending` flag so `resumePendingReencryption` retries on a
// later unlock; the sweep is idempotent, so retrying is safe. The flag lives in
// localStorage, NOT in the Dexie settings row the sweep writes to: were it there,
// the very IndexedDB failure that aborts the sweep could also swallow the flag
// write, silently and permanently defeating the retry. The security invariant
// ("secured ⇒ existing data encrypted") is only met once the flag is cleared (a
// run with zero failed rows).
async function runReencryptionSweep(): Promise<void> {
  try {
    const { failed } = await reencryptAllRecords();
    setReencryptionPending(failed > 0);
  } catch (error) {
    console.error(
      'Re-encryption sweep failed; existing data may remain plaintext until a later unlock retries it',
      error,
    );
    setReencryptionPending(true);
  }
}

// Initial enrolment mints a brand-new DEK. Any data collected before the device
// was secured was written as plaintext (unconfigured / mode `none`), so unless we
// sweep it now it stays unencrypted at rest — a researcher who just "secured" the
// device would wrongly believe all data is encrypted. Run the sweep after the DEK
// is set and BEFORE reporting success, so "enrolment complete" means "existing
// data is now encrypted" (or, if the sweep couldn't finish, flagged for retry on
// the next unlock).
async function applyInitialEnrol(
  result: vault.UnlockResult,
): Promise<AuthResult> {
  const unlocked = await applyUnlock(result);
  if (!unlocked.ok) return unlocked;
  // Enabling encryption commits sensitive data to this device, so ask the
  // browser to make storage non-evictable now (an installed PWA is granted this
  // without a prompt). Persistence is otherwise only requested at startup
  // (main.tsx); without this a user who installs and then secures the device
  // stays on evictable storage until the next reload re-runs that request.
  // Fire-and-forget: the grant resolves during the awaited sweep below, and a
  // failure must not fail enrolment (the durability label just stays a reload
  // behind). StatusRow re-reads the result on mode change / next mount.
  void requestPersistentStorage();
  await runReencryptionSweep();
  return { ok: true };
}

// After a normal unlock, finish an initial-enrol sweep that a prior attempt left
// incomplete (e.g. a mid-sweep quota error), so rows left plaintext eventually
// get encrypted. Gated on the persisted flag so a device that was never in that
// state does no work beyond one localStorage read. runReencryptionSweep never
// throws, so this never breaks the unlock it follows.
async function resumePendingReencryption(): Promise<void> {
  if (!isReencryptionPending()) return;
  await runReencryptionSweep();
}

async function applyUnlockAndResume(
  result: vault.UnlockResult,
): Promise<AuthResult> {
  const unlocked = await applyUnlock(result);
  if (!unlocked.ok) return unlocked;
  await resumePendingReencryption();
  return unlocked;
}

// PRF availability gates biometric enrolment in the setup wizard.
export function isBiometricSupported(): Promise<boolean> {
  return isPrfSupported();
}

export async function status(): Promise<AuthStatus> {
  const s = vault.vaultStatus();
  if (s.corrupt) {
    return { configured: false, locked: false, corrupt: true };
  }
  if (!s.configured || !s.mode) {
    return { configured: false, locked: false };
  }
  if (s.mode === 'none') {
    return { configured: true, locked: false, mode: 'none' };
  }
  // Secured modes are locked whenever no session DEK is held (fresh load,
  // after lock/idle/blur). No persisted unlock flag exists any more.
  return { configured: true, locked: getSessionDek() === null, mode: s.mode };
}

export async function enrolWithoutLock(): Promise<AuthResult> {
  const result = await vault.enrolNone();
  if (result.ok) setSessionDek(null);
  return toAuthResult(result);
}

export async function enrolWithPin(pin: string): Promise<AuthResult> {
  const enrolled = await vault.enrolPin(pin);
  if (!enrolled.ok) return toAuthResult(enrolled);
  return applyInitialEnrol(await vault.unlockPin(pin));
}

export async function enrolWithPassphrase(phrase: string): Promise<AuthResult> {
  const enrolled = await vault.enrolPassphrase(phrase);
  if (!enrolled.ok) return toAuthResult(enrolled);
  return applyInitialEnrol(await vault.unlockPassphrase(phrase));
}

export async function enrolWithBiometric(
  recoveryPhrase: string,
): Promise<AuthResult> {
  // enrolBiometric already holds the freshly-unwrapped DEK, so route it straight
  // through applyInitialEnrol rather than calling unlockBiometric (which would
  // prompt for biometrics a third time). applyUnlock stays the single DEK choke
  // point; applyInitialEnrol then sweeps any pre-secured plaintext rows.
  return applyInitialEnrol(await vault.enrolBiometric(recoveryPhrase));
}

export async function unlockWithPin(pin: string): Promise<AuthResult> {
  return applyUnlockAndResume(await vault.unlockPin(pin));
}

export async function unlockWithPassphrase(
  phrase: string,
): Promise<AuthResult> {
  return applyUnlockAndResume(await vault.unlockPassphrase(phrase));
}

export async function unlockWithBiometric(): Promise<AuthResult> {
  return applyUnlockAndResume(await vault.unlockBiometric());
}

export async function unlockWithRecovery(phrase: string): Promise<AuthResult> {
  return applyUnlockAndResume(await vault.unlockRecovery(phrase));
}

// Non-destructive PIN/passphrase change. The vault rewraps the SAME DEK under a
// KEK derived from the new secret, so the held session DEK is untouched — this
// never calls setSessionDek. status() still reports the same (unchanged) mode.
export async function reEnrolWithPin(
  currentPin: string,
  nextPin: string,
): Promise<AuthResult> {
  return toAuthResult(await vault.reEnrolPin(currentPin, nextPin));
}

export async function reEnrolWithPassphrase(
  currentPhrase: string,
  nextPhrase: string,
): Promise<AuthResult> {
  return toAuthResult(await vault.reEnrolPassphrase(currentPhrase, nextPhrase));
}

// Step-up verification: re-checks the secret / re-prompts biometrics WITHOUT
// changing the gate. Never calls setSessionDek — the session stays as it was.
export async function verifyWithPin(pin: string): Promise<AuthResult> {
  return toAuthResult(await vault.verifyPin(pin));
}

export async function verifyWithPassphrase(
  phrase: string,
): Promise<AuthResult> {
  return toAuthResult(await vault.verifyPassphrase(phrase));
}

export async function verifyBiometric(): Promise<AuthResult> {
  return toAuthResult(await vault.verifyBiometric());
}

export async function verifyWithRecovery(phrase: string): Promise<AuthResult> {
  return toAuthResult(await vault.verifyRecovery(phrase));
}

export async function lock(): Promise<void> {
  setSessionDek(null);
}

export async function revoke(): Promise<void> {
  // Drop the encrypted data DB first, then clear the vault record. If we fail
  // mid-revoke, leaving the vault record keeps a recoverable "configured but
  // locked" state instead of an orphaned DB without a vault.
  await db.delete({ disableAutoOpen: false });
  await vault.revoke(); // clears the localStorage vault record + best-effort passkey delete
  setSessionDek(null);
}
