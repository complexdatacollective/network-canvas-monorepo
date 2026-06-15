import {
  app,
  type BrowserWindow,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
  shell,
} from 'electron';

import { revoke } from './auth/vault';

const isMac = process.platform === 'darwin';

async function handleResetAllAppData(window: BrowserWindow): Promise<void> {
  const result = await dialog.showMessageBox(window, {
    type: 'warning',
    buttons: ['Reset', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Reset all app data',
    message: 'Reset all app data?',
    detail:
      'This will permanently delete all imported protocols, recorded sessions, app settings, and your security setup. The app will return to its first-run state. This cannot be undone.',
  });
  if (result.response !== 0) return;
  try {
    await revoke();
  } catch (cause) {
    await dialog.showMessageBox(window, {
      type: 'error',
      title: 'Reset failed',
      message: 'Could not reset app data',
      detail: cause instanceof Error ? cause.message : String(cause),
    });
    return;
  }
  window.webContents.reload();
}

export function buildMenu(mainWindow: BrowserWindow): Menu {
  const resetItem: MenuItemConstructorOptions = {
    label: 'Reset all app data…',
    click: () => void handleResetAllAppData(mainWindow),
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              resetItem,
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ] satisfies MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [
        ...(isMac
          ? []
          : ([
              resetItem,
              { type: 'separator' },
            ] satisfies MenuItemConstructorOptions[])),
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? ([
              { role: 'pasteAndMatchStyle' },
              { role: 'delete' },
              { role: 'selectAll' },
            ] satisfies MenuItemConstructorOptions[])
          : ([
              { role: 'delete' },
              { type: 'separator' },
              { role: 'selectAll' },
            ] satisfies MenuItemConstructorOptions[])),
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? ([
              { type: 'separator' },
              { role: 'front' },
              { type: 'separator' },
              { role: 'window' },
            ] satisfies MenuItemConstructorOptions[])
          : ([{ role: 'close' }] satisfies MenuItemConstructorOptions[])),
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Open Network Canvas website',
          click: () => void shell.openExternal('https://networkcanvas.com'),
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}
