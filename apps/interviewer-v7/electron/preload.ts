import { contextBridge, ipcRenderer } from 'electron';

const dbBridge = {
  protocols: {
    list: () => ipcRenderer.invoke('db:protocols:list'),
    getByHash: (hash: string) =>
      ipcRenderer.invoke('db:protocols:getByHash', hash),
    getByHashes: (hashes: string[]) =>
      ipcRenderer.invoke('db:protocols:getByHashes', hashes),
    save: (input: unknown) => ipcRenderer.invoke('db:protocols:save', input),
    delete: (hash: string) => ipcRenderer.invoke('db:protocols:delete', hash),
    listAssets: (hash: string) =>
      ipcRenderer.invoke('db:protocols:listAssets', hash),
    getAsset: (args: { hash: string; assetId: string }) =>
      ipcRenderer.invoke('db:protocols:getAsset', args),
  },
  sessions: {
    list: () => ipcRenderer.invoke('db:sessions:list'),
    get: (id: string) => ipcRenderer.invoke('db:sessions:get', id),
    getByIds: (ids: string[]) =>
      ipcRenderer.invoke('db:sessions:getByIds', ids),
    create: (args: unknown) => ipcRenderer.invoke('db:sessions:create', args),
    update: (args: unknown) => ipcRenderer.invoke('db:sessions:update', args),
    markFinished: (id: string) =>
      ipcRenderer.invoke('db:sessions:markFinished', id),
    markExported: (ids: string[]) =>
      ipcRenderer.invoke('db:sessions:markExported', ids),
    deleteMany: (ids: string[]) =>
      ipcRenderer.invoke('db:sessions:deleteMany', ids),
  },
  settings: {
    get: () => ipcRenderer.invoke('db:settings:get'),
    update: (patch: unknown) => ipcRenderer.invoke('db:settings:update', patch),
  },
};

const authBridge = {
  status: () => ipcRenderer.invoke('auth:status'),
  setup: (args: {
    credentialIdB64: string;
    saltB64: string;
    prfOutputB64: string;
  }) => ipcRenderer.invoke('auth:setup', args),
  unlock: (args: { prfOutputB64: string }) =>
    ipcRenderer.invoke('auth:unlock', args),
  lock: () => ipcRenderer.invoke('auth:lock'),
  reEnrol: (args: {
    currentPrfOutputB64: string;
    nextCredentialIdB64: string;
    nextSaltB64: string;
    nextPrfOutputB64: string;
  }) => ipcRenderer.invoke('auth:reEnrol', args),
  revoke: () => ipcRenderer.invoke('auth:revoke'),
};

const electronAPI = {
  openFile: () => ipcRenderer.invoke('dialog:openProtocol'),
  saveFile: (suggestedName: string, data: Uint8Array) =>
    ipcRenderer.invoke('dialog:saveFile', suggestedName, data),
  platform: process.platform as 'darwin' | 'win32' | 'linux',
  isPackaged: process.argv.includes('--isPackaged'),
  db: dbBridge,
  auth: authBridge,
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
