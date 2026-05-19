import { readFile, writeFile } from 'node:fs/promises';
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
import { migrateLegacyDbFilename } from './db/service';
import { registerAuthHandlers } from './handlers/authHandlers';
import { registerDbHandlers } from './handlers/dbHandlers';
import { buildMenu } from './menu';

const isDev = !app.isPackaged;
const RENDERER_DEV_URL =
  process.env.ELECTRON_RENDERER_URL ?? 'http://localhost:5181';

// Vite HMR injects inline scripts/styles and uses a WebSocket back to the dev
// server, so dev CSP must permit those. unsafe-eval is deliberately omitted —
// keeping it out silences Electron's "Insecure Content-Security-Policy" warning
// without blocking ESM-based HMR.
const CSP_DEV = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${RENDERER_DEV_URL}`,
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
    title: 'Network Canvas Interviewer v7',
    backgroundColor: '#1c1c1c',
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
