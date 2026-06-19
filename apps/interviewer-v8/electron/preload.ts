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
    query: (params: unknown) => ipcRenderer.invoke('db:sessions:query', params),
    queryMatchingIds: (params: unknown) =>
      ipcRenderer.invoke('db:sessions:queryMatchingIds', params),
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
    countSynthetic: () => ipcRenderer.invoke('db:sessions:countSynthetic'),
    deleteSynthetic: () => ipcRenderer.invoke('db:sessions:deleteSynthetic'),
  },
  settings: {
    get: () => ipcRenderer.invoke('db:settings:get'),
    update: (patch: unknown) => ipcRenderer.invoke('db:settings:update', patch),
  },
};

const authBridge = {
  status: () => ipcRenderer.invoke('auth:status'),
  setupPin: (args: { pin: string }) =>
    ipcRenderer.invoke('auth:setupPin', args),
  setupNone: () => ipcRenderer.invoke('auth:setupNone'),
  setupBiometric: () => ipcRenderer.invoke('auth:setupBiometric'),
  unlockPin: (args: { pin: string }) =>
    ipcRenderer.invoke('auth:unlockPin', args),
  unlockBiometric: () => ipcRenderer.invoke('auth:unlockBiometric'),
  verifyBiometric: () => ipcRenderer.invoke('auth:verifyBiometric'),
  biometricAvailable: () => ipcRenderer.invoke('auth:biometricAvailable'),
  lock: () => ipcRenderer.invoke('auth:lock'),
  reEnrolPin: (args: { currentPin: string; nextPin: string }) =>
    ipcRenderer.invoke('auth:reEnrolPin', args),
  setupPassphrase: (args: { phrase: string }) =>
    ipcRenderer.invoke('auth:setup:passphrase', args),
  unlockPassphrase: (args: { phrase: string }) =>
    ipcRenderer.invoke('auth:unlock:passphrase', args),
  reEnrolPassphrase: (args: { currentPhrase: string; nextPhrase: string }) =>
    ipcRenderer.invoke('auth:reEnrol:passphrase', args),
  verifyPin: (args: { pin: string }) =>
    ipcRenderer.invoke('auth:verify:pin', args),
  verifyPassphrase: (args: { phrase: string }) =>
    ipcRenderer.invoke('auth:verify:passphrase', args),
  revoke: () => ipcRenderer.invoke('auth:revoke'),
};

const systemBridge = {
  storageInfo: () => ipcRenderer.invoke('system:storageInfo'),
};

type UpdateProgress = {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
};

const updateBridge = {
  check: () => ipcRenderer.invoke('update:check'),
  download: () => ipcRenderer.invoke('update:download'),
  install: () => ipcRenderer.invoke('update:install'),
  onProgress: (callback: (progress: UpdateProgress) => void) => {
    const handler = (_event: unknown, progress: UpdateProgress) =>
      callback(progress);
    ipcRenderer.on('update:progress', handler);
    return () => ipcRenderer.off('update:progress', handler);
  },
  onDownloaded: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('update:downloaded', handler);
    return () => ipcRenderer.off('update:downloaded', handler);
  },
  onError: (callback: (message: string) => void) => {
    const handler = (_event: unknown, message: string) => callback(message);
    ipcRenderer.on('update:error', handler);
    return () => ipcRenderer.off('update:error', handler);
  },
};

// Electron only runs on these three platforms; narrow without an `as` cast.
function rendererPlatform(): 'darwin' | 'win32' | 'linux' {
  const platform = process.platform;
  if (platform === 'darwin' || platform === 'win32' || platform === 'linux') {
    return platform;
  }
  return 'linux';
}

const electronAPI = {
  openFile: () => ipcRenderer.invoke('dialog:openProtocol'),
  saveFile: (suggestedName: string, data: Uint8Array) =>
    ipcRenderer.invoke('dialog:saveFile', suggestedName, data),
  fetchProtocolFromUrl: (url: string) =>
    ipcRenderer.invoke('protocol:fetchFromUrl', url),
  platform: rendererPlatform(),
  isPackaged: process.argv.includes('--isPackaged'),
  db: dbBridge,
  auth: authBridge,
  system: systemBridge,
  update: updateBridge,
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
