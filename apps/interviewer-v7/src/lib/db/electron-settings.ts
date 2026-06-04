import type { StoredSettings } from './types';

function ipc() {
  const api = window.electronAPI;
  if (!api?.db) {
    throw new Error('Electron DB IPC bridge not available');
  }
  return api.db;
}

export async function getSettings(): Promise<StoredSettings> {
  return ipc().settings.get();
}

export async function updateSettings(
  patch: Partial<Omit<StoredSettings, 'id'>>,
): Promise<StoredSettings> {
  return ipc().settings.update(patch);
}
