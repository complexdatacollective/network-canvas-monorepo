import { statfsSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
} from 'electron';

import { bootstrapNoLock } from './auth/vault';
import { getDbPath, migrateLegacyDbFilename } from './db/service';
import { registerAuthHandlers } from './handlers/authHandlers';
import { registerDbHandlers } from './handlers/dbHandlers';
import { buildMenu } from './menu';

const isDev = !app.isPackaged;
const RENDERER_DEV_URL =
  process.env.ELECTRON_RENDERER_URL ?? 'http://localhost:5181';

// Dev CSP: Vite serves source modules from RENDERER_DEV_URL and HMR uses a
// WebSocket back to the dev server. `unsafe-inline` covers Vite's inline
// bootstrap; `unsafe-eval` is required because several dev-pulled libraries
// (motion's core bundle, csvtojson, react-refresh metadata) rely on dynamic
// code evaluation. This trips Electron's "Insecure CSP" warning — accepted
// in dev only; prod CSP stays locked down.
const CSP_DEV = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${RENDERER_DEV_URL}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${RENDERER_DEV_URL} ${RENDERER_DEV_URL.replace(/^http/, 'ws')}`,
  "worker-src 'self' blob:",
].join('; ');

const CSP_PROD = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
].join('; ');

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Network Canvas Interviewer 7',
    backgroundColor: '#232053', // navy taupe
    // remove the default titlebar
    titleBarStyle: 'hidden',
    // expose window controls in Windows/Linux
    ...(process.platform !== 'darwin' ? { titleBarOverlay: true } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: app.isPackaged ? ['--isPackaged'] : [],
    },
  });

  Menu.setApplicationMenu(buildMenu(mainWindow));

  if (isDev) {
    void mainWindow.loadURL(RENDERER_DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Top-level navigation must stay on the bundled renderer. Any nav to a remote
  // origin (e.g. accidental <a href> click) would inherit the preload bridge and
  // hand DB/auth IPC + file dialogs to untrusted content.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev
      ? url.startsWith(RENDERER_DEV_URL)
      : url.startsWith('file://');
    if (!allowed) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Must be called before any BrowserWindow is created so navigator.credentials
// surfaces a platform-authenticator prompt in the renderer. macOS Touch ID needs
// a signed binary + `keychainAccessGroup` (set once we have a signing identity);
// for now we enable the default WebAuthn stack only (USB security keys, Windows
// Hello, Chromium virtual authenticator in dev).
app.configureWebAuthn({});

app.whenReady().then(() => {
  try {
    migrateLegacyDbFilename();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    dialog.showErrorBox('Cannot start Network Canvas Interviewer v7', message);
    app.exit(1);
    return;
  }
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [isDev ? CSP_DEV : CSP_PROD],
      },
    });
  });
  registerDbHandlers();
  registerAuthHandlers();
  bootstrapNoLock();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('dialog:openProtocol', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open protocol',
    filters: [
      { name: 'Network Canvas Protocol', extensions: ['netcanvas', 'zip'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }
  const path = result.filePaths[0];
  if (!path) return { canceled: true };
  const data = await readFile(path);
  return {
    canceled: false,
    name: basename(path),
    data: new Uint8Array(data),
  };
});

ipcMain.handle(
  'dialog:saveFile',
  async (_event, suggestedName: string, payload: Uint8Array) => {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save export',
      defaultPath: suggestedName,
      filters: [{ name: 'Zip archive', extensions: ['zip'] }],
    });
    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }
    await writeFile(result.filePath, Buffer.from(payload));
    return { canceled: false, path: result.filePath };
  },
);

ipcMain.handle('system:platform', () => process.platform);

ipcMain.handle('system:storageInfo', async () => {
  // Three independent measurements: DB file size, disk free, disk total.
  // Each can fail (file absent, statfs unsupported, permission denied) and
  // surfaces as null in the result rather than tearing the whole IPC.
  let dbBytes: number | null = null;
  try {
    const s = await stat(getDbPath());
    dbBytes = s.size;
  } catch {
    dbBytes = null;
  }
  let diskFreeBytes: number | null = null;
  let diskTotalBytes: number | null = null;
  try {
    const fs = statfsSync(app.getPath('userData'));
    diskFreeBytes = fs.bavail * fs.bsize;
    diskTotalBytes = fs.blocks * fs.bsize;
  } catch {
    diskFreeBytes = null;
    diskTotalBytes = null;
  }
  return { dbBytes, diskFreeBytes, diskTotalBytes };
});
