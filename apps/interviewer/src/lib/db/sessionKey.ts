// The unlocked data-encryption key for the current app session. Held only in
// memory: cleared on lock/idle/blur/revoke so it never outlives an unlock.
let sessionDek: CryptoKey | null = null;

export function setSessionDek(dek: CryptoKey | null): void {
  sessionDek = dek;
}

export function getSessionDek(): CryptoKey | null {
  return sessionDek;
}
