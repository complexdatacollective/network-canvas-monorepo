import { statfsSync, writeFileSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
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

// Packaged builds serve the renderer from a custom `app://` secure scheme so
// `crypto.subtle` is available for PIN/passphrase PBKDF2. The scheme is
// registered as `secure` via `registerSchemesAsPrivileged` below.
const RENDERER_SCHEME = 'app';
const RENDERER_HOST = 'localhost';
const RENDERER_ORIGIN = `${RENDERER_SCHEME}://${RENDERER_HOST}`;

protocol.registerSchemesAsPrivileged([
  {
    scheme: RENDERER_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

// Touch ID stores its Secure Enclave credential under this keychain group. The
// string MUST match `keychain-access-groups` in build-resources/entitlements.mac.plist
// and the binary must be signed with this team, or the platform authenticator is
// silently unavailable. The Team ID is not secret — it ships in every signed app.
const APPLE_TEAM_ID = '85EZ69PQHJ';
// Electron's docs store the Secure Enclave WebAuthn credential under a
// `.webauthn`-suffixed keychain group; the provisioning profile authorises
// `85EZ69PQHJ.*`, so any suffix under the team prefix is valid.
const KEYCHAIN_ACCESS_GROUP = `${APPLE_TEAM_ID}.Network-Canvas-Interviewer-7.webauthn`;

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
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// Keep in sync with `CSP_DIRECTIVES` in vite.renderer.config.ts — the renderer
// injects the same policy as a meta tag, and the browser intersects header
// with meta. Any divergence silently breaks the renderer.
const CSP_PROD = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

let mainWindow: BrowserWindow | null = null;

// Hand a URL to the OS browser only when it is a web/mail link. Never open
// file:// or other schemes, which could trigger unintended local handlers.
function openExternalIfWebUrl(url: string) {
  try {
    const { protocol: scheme } = new URL(url);
    if (scheme === 'http:' || scheme === 'https:' || scheme === 'mailto:') {
      void shell.openExternal(url);
    }
  } catch {
    // Ignore malformed URLs.
  }
}

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
    void mainWindow.loadURL(`${RENDERER_ORIGIN}/index.html`);
  }

  // TEMP DIAGNOSTIC: capture renderer origin + WebAuthn origin-check outcome.
  mainWindow.webContents.on('did-finish-load', () => {
    void mainWindow?.webContents
      .executeJavaScript(
        `(async () => {
          const out = { href: location.href, origin: location.origin, hostname: location.hostname, isSecureContext: window.isSecureContext, hasPublicKeyCredential: typeof PublicKeyCredential !== 'undefined' };
          try { out.iuvpaa = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch (e) { out.iuvpaaError = String(e); }
          try {
            await navigator.credentials.get({ publicKey: { challenge: new Uint8Array(32), rpId: location.hostname, timeout: 500, userVerification: 'discouraged', allowCredentials: [] } });
            out.getOutcome = 'no-throw';
          } catch (e) { out.getError = e.name + ': ' + e.message; }
          return out;
        })()`,
      )
      .then((r) =>
        writeFileSync(
          '/tmp/nci-webauthn-diag.json',
          JSON.stringify(r, null, 2),
        ),
      )
      .catch((e) =>
        writeFileSync('/tmp/nci-webauthn-diag.json', `EXEC ERR ${String(e)}`),
      );
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfWebUrl(url);
    return { action: 'deny' };
  });

  // Top-level navigation must stay on the bundled renderer. Any nav to a remote
  // origin (e.g. accidental <a href> click) would inherit the preload bridge and
  // hand DB/auth IPC + file dialogs to untrusted content. Compare the origin
  // exactly so sibling origins (a different host/port) are rejected.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    let allowed = false;
    try {
      const expected = isDev
        ? new URL(RENDERER_DEV_URL).origin
        : RENDERER_ORIGIN;
      allowed = new URL(url).origin === expected;
    } catch {
      allowed = false;
    }
    if (!allowed) {
      event.preventDefault();
      openExternalIfWebUrl(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Serves the bundled renderer over the custom `app://` secure scheme. Paths
// without a file extension are client-side (wouter) routes and fall back to
// the SPA shell; the relative()/isAbsolute() guard blocks traversal outside
// the renderer dir.
function registerRendererProtocol() {
  const rendererDir = join(__dirname, '../renderer');
  protocol.handle(RENDERER_SCHEME, (request) => {
    const { pathname } = new URL(request.url);
    const requested = decodeURIComponent(pathname).replace(/^\/+/, '');
    const candidate =
      requested === '' || extname(requested) === '' ? 'index.html' : requested;
    const resolved = join(rendererDir, candidate);
    const within = relative(rendererDir, resolved);
    if (within.startsWith('..') || isAbsolute(within)) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(resolved).toString());
  });
}

app.whenReady().then(() => {
  // Enable platform authenticators before any renderer loads. The macOS Touch ID
  // path touches Chromium's ResourceBundle, which is only initialised by the
  // `ready` event — calling configureWebAuthn at module top level (before ready)
  // trips a ResourceBundle CHECK and crashes (EXC_BREAKPOINT). whenReady is the
  // earliest safe point and still precedes createWindow. Touch ID is enabled only
  // for packaged + signed macOS builds (an unsigned dev binary can't claim
  // KEYCHAIN_ACCESS_GROUP); everywhere else the default WebAuthn stack is used.
  if (process.platform === 'darwin' && app.isPackaged) {
    app.configureWebAuthn({
      touchID: {
        keychainAccessGroup: KEYCHAIN_ACCESS_GROUP,
        promptReason: 'Unlock Network Canvas Interviewer',
      },
    });
  } else {
    app.configureWebAuthn({});
  }

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
  try {
    bootstrapNoLock();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    dialog.showErrorBox('Cannot start Network Canvas Interviewer v7', message);
    app.exit(1);
    return;
  }
  if (!isDev) registerRendererProtocol();
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

// Renderer's CSP stays at `connect-src 'self'`; this handler is the only path
// out to the network, so any change to size cap / scheme allowlist applies
// uniformly to URL imports.
const FETCH_PROTOCOL_MAX_BYTES = 200 * 1024 * 1024;
const FETCH_PROTOCOL_TIMEOUT_MS = 30_000;

ipcMain.handle('protocol:fetchFromUrl', async (_event, url: unknown) => {
  if (typeof url !== 'string') {
    return { ok: false, message: 'URL must be a string' };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, message: 'Invalid URL' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      ok: false,
      message: 'Only http: and https: URLs are supported',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    FETCH_PROTOCOL_TIMEOUT_MS,
  );

  try {
    const response = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        message: `Server responded with ${response.status} ${response.statusText}`,
      };
    }
    const declared = response.headers.get('content-length');
    if (declared && Number(declared) > FETCH_PROTOCOL_MAX_BYTES) {
      return {
        ok: false,
        message: `Protocol exceeds ${FETCH_PROTOCOL_MAX_BYTES} byte size limit`,
      };
    }
    const reader = response.body?.getReader();
    if (!reader) {
      return { ok: false, message: 'Response body unavailable' };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > FETCH_PROTOCOL_MAX_BYTES) {
        await reader.cancel();
        return {
          ok: false,
          message: `Protocol exceeds ${FETCH_PROTOCOL_MAX_BYTES} byte size limit`,
        };
      }
      chunks.push(value);
    }
    const data = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, data };
  } catch (cause) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        message: `Request timed out after ${FETCH_PROTOCOL_TIMEOUT_MS}ms`,
      };
    }
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  } finally {
    clearTimeout(timeout);
  }
});

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
