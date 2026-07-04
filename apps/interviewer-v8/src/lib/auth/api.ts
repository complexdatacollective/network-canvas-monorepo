import { db } from '../db/db';
import { getSessionDek, setSessionDek } from '../db/sessionKey';
import * as vault from '../vault/vault';
import { isPrfSupported } from '../vault/webauthn';

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
  return applyUnlock(await vault.unlockPin(pin));
}

export async function enrolWithPassphrase(phrase: string): Promise<AuthResult> {
  const enrolled = await vault.enrolPassphrase(phrase);
  if (!enrolled.ok) return toAuthResult(enrolled);
  return applyUnlock(await vault.unlockPassphrase(phrase));
}

export async function enrolWithBiometric(
  recoveryPhrase: string,
): Promise<AuthResult> {
  // enrolBiometric already holds the freshly-unwrapped DEK, so route it straight
  // through applyUnlock rather than calling unlockBiometric (which would prompt
  // for biometrics a third time). applyUnlock stays the single DEK choke point.
  return applyUnlock(await vault.enrolBiometric(recoveryPhrase));
}

export async function unlockWithPin(pin: string): Promise<AuthResult> {
  return applyUnlock(await vault.unlockPin(pin));
}

export async function unlockWithPassphrase(
  phrase: string,
): Promise<AuthResult> {
  return applyUnlock(await vault.unlockPassphrase(phrase));
}

export async function unlockWithBiometric(): Promise<AuthResult> {
  return applyUnlock(await vault.unlockBiometric());
}

export async function unlockWithRecovery(phrase: string): Promise<AuthResult> {
  return applyUnlock(await vault.unlockRecovery(phrase));
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
