import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { app } from 'electron';

const FILE_NAME = 'vault.json';
const VAULT_VERSION = 4;

export const CURRENT_VAULT_VERSION = VAULT_VERSION;

export type VaultRecord =
  | {
      version: typeof CURRENT_VAULT_VERSION;
      mode: 'none';
      wrapIvB64: string;
      wrapCiphertextB64: string;
    }
  | {
      version: typeof CURRENT_VAULT_VERSION;
      mode: 'webauthn';
      credentialIdB64: string;
      saltB64: string;
      wrapIvB64: string;
      wrapCiphertextB64: string;
    }
  | {
      version: typeof CURRENT_VAULT_VERSION;
      mode: 'pin';
      kdfSaltB64: string;
      kdfIterations: number;
      wrapIvB64: string;
      wrapCiphertextB64: string;
    }
  | {
      version: typeof CURRENT_VAULT_VERSION;
      mode: 'passphrase';
      kdfSaltB64: string;
      kdfIterations: number;
      wrapIvB64: string;
      wrapCiphertextB64: string;
    };

function vaultPath(): string {
  return join(app.getPath('userData'), FILE_NAME);
}

export function isVaultConfigured(): boolean {
  return existsSync(vaultPath());
}

export function readVault(): VaultRecord | null {
  if (!existsSync(vaultPath())) return null;
  try {
    const raw = readFileSync(vaultPath(), 'utf-8');
    const parsed = JSON.parse(raw) as VaultRecord;
    if (parsed.version !== VAULT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeVault(record: VaultRecord): void {
  writeFileSync(vaultPath(), JSON.stringify(record, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

export function deleteVault(): void {
  if (existsSync(vaultPath())) rmSync(vaultPath());
}
