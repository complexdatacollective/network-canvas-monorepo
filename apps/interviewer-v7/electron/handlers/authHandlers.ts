import { ipcMain } from 'electron';

import * as vault from '../auth/vault';

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:status', async () => vault.status());
  ipcMain.handle('auth:setupPin', async (_e, args: { pin: string }) =>
    vault.setupPin(args),
  );
  ipcMain.handle('auth:setupNone', async () => vault.setupNone());
  ipcMain.handle('auth:setupBiometric', async () => vault.setupBiometric());
  ipcMain.handle('auth:unlockPin', async (_e, args: { pin: string }) =>
    vault.unlockPin(args),
  );
  ipcMain.handle('auth:unlockBiometric', async () => vault.unlockBiometric());
  ipcMain.handle('auth:verifyBiometric', async () => vault.verifyBiometric());
  ipcMain.handle('auth:biometricAvailable', async () =>
    vault.biometricAvailable(),
  );
  ipcMain.handle('auth:lock', async () => vault.lock());
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
  ipcMain.handle('auth:verify:pin', async (_event, args: { pin: string }) =>
    vault.verifyPin(args),
  );
  ipcMain.handle(
    'auth:verify:passphrase',
    async (_event, args: { phrase: string }) => vault.verifyPassphrase(args),
  );
  ipcMain.handle('auth:revoke', async () => vault.revoke());
}
