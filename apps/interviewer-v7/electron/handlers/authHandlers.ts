import { ipcMain } from 'electron';

import * as vault from '../auth/vault';

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:status', async () => vault.status());
  ipcMain.handle(
    'auth:setup',
    async (
      _e,
      args: { credentialIdB64: string; saltB64: string; prfOutputB64: string },
    ) => vault.setup(args),
  );
  ipcMain.handle('auth:setupPin', async (_e, args: { pin: string }) =>
    vault.setupPin(args),
  );
  ipcMain.handle('auth:setupNone', async () => vault.setupNone());
  ipcMain.handle('auth:unlock', async (_e, args: { prfOutputB64: string }) =>
    vault.unlock(args),
  );
  ipcMain.handle('auth:unlockPin', async (_e, args: { pin: string }) =>
    vault.unlockPin(args),
  );
  ipcMain.handle('auth:lock', async () => vault.lock());
  ipcMain.handle(
    'auth:reEnrol',
    async (
      _e,
      args: {
        currentPrfOutputB64: string;
        nextCredentialIdB64: string;
        nextSaltB64: string;
        nextPrfOutputB64: string;
      },
    ) => vault.reEnrol(args),
  );
  ipcMain.handle(
    'auth:reEnrolPin',
    async (_e, args: { currentPin: string; nextPin: string }) =>
      vault.reEnrolPin(args),
  );
  ipcMain.handle(
    'auth:setup:passphrase',
    async (_e, args: { phrase: string }) => vault.setupPassphrase(args),
  );
  ipcMain.handle(
    'auth:unlock:passphrase',
    async (_e, args: { phrase: string }) => vault.unlockPassphrase(args),
  );
  ipcMain.handle(
    'auth:reEnrol:passphrase',
    async (_e, args: { currentPhrase: string; nextPhrase: string }) =>
      vault.reEnrolPassphrase(args),
  );
  ipcMain.handle('auth:revoke', async () => vault.revoke());
}
