import { ipcMain } from 'electron';

import {
  checkForUpdate,
  downloadUpdate,
  quitAndInstall,
} from '../update/updater';

export function registerUpdateHandlers(): void {
  ipcMain.handle('update:check', async () => checkForUpdate());
  ipcMain.handle('update:download', async () => downloadUpdate());
  ipcMain.handle('update:install', async () => quitAndInstall());
}
