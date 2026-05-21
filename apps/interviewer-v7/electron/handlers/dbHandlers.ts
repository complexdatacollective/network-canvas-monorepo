import { ipcMain } from 'electron';

import { protocols, sessions, settings } from '../db/service';

export function registerDbHandlers(): void {
  ipcMain.handle('db:protocols:list', async () => protocols.list());
  ipcMain.handle('db:protocols:getByHash', async (_e, hash: string) =>
    protocols.getByHash(hash),
  );
  ipcMain.handle('db:protocols:getByHashes', async (_e, hashes: string[]) =>
    protocols.getByHashes(hashes),
  );
  ipcMain.handle('db:protocols:save', async (_e, input) =>
    protocols.save(input),
  );
  ipcMain.handle('db:protocols:delete', async (_e, hash: string) =>
    protocols.delete(hash),
  );
  ipcMain.handle('db:protocols:listAssets', async (_e, hash: string) =>
    protocols.listAssets(hash),
  );
  ipcMain.handle(
    'db:protocols:getAsset',
    async (_e, args: { hash: string; assetId: string }) =>
      protocols.getAsset(args),
  );

  ipcMain.handle('db:sessions:list', async () => sessions.list());
  ipcMain.handle('db:sessions:query', async (_e, params) =>
    sessions.query(params),
  );
  ipcMain.handle('db:sessions:queryMatchingIds', async (_e, params) =>
    sessions.queryMatchingIds(params),
  );
  ipcMain.handle('db:sessions:get', async (_e, id: string) => sessions.get(id));
  ipcMain.handle('db:sessions:getByIds', async (_e, ids: string[]) =>
    sessions.getByIds(ids),
  );
  ipcMain.handle('db:sessions:create', async (_e, args) =>
    sessions.create(args),
  );
  ipcMain.handle('db:sessions:update', async (_e, args) =>
    sessions.update(args),
  );
  ipcMain.handle('db:sessions:markFinished', async (_e, id: string) =>
    sessions.markFinished(id),
  );
  ipcMain.handle('db:sessions:markExported', async (_e, ids: string[]) =>
    sessions.markExported(ids),
  );
  ipcMain.handle('db:sessions:deleteMany', async (_e, ids: string[]) =>
    sessions.deleteMany(ids),
  );
  ipcMain.handle('db:sessions:countSynthetic', async () =>
    sessions.countSynthetic(),
  );
  ipcMain.handle('db:sessions:deleteSynthetic', async () =>
    sessions.deleteSynthetic(),
  );

  ipcMain.handle('db:settings:get', async () => settings.get());
  ipcMain.handle('db:settings:update', async (_e, patch) =>
    settings.update(patch),
  );
}
