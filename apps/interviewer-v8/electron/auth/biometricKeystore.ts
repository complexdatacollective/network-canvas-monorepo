import * as keystore from '@codaco/biometric-keystore';

// Service+account form the keychain primary key. Service identifies the app;
// account identifies the secret within the app. Single user, single secret →
// fixed strings.
const SERVICE = 'Network-Canvas-Interviewer-8';
const ACCOUNT = 'sqlcipher-dek';

export async function isAvailable(): Promise<boolean> {
  return keystore.isAvailable();
}

export async function storeDek(dek: Buffer): Promise<void> {
  await keystore.store(SERVICE, ACCOUNT, dek);
}

export async function loadDek(): Promise<Buffer> {
  return keystore.load(SERVICE, ACCOUNT);
}

export async function deleteDek(): Promise<void> {
  await keystore.delete(SERVICE, ACCOUNT);
}
