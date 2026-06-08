import { BrowserWindow, ipcMain } from 'electron';

import FileExportManager from '../utils/network-exporters/src/FileExportManager.js';
import log from './log.js';

let currentExport = null;

/**
 * Register export-related IPC handlers
 */
export const registerExportHandlers = () => {
  log.info('Registering export handlers...');

  ipcMain.handle(
    'export:start',
    async (event, { sessions, protocols, exportOptions }) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const fileExportManager = new FileExportManager(exportOptions);

      const sendToRenderer = (channel, data) => {
        if (window && !window.isDestroyed()) {
          window.webContents.send(channel, data);
        }
      };

      // Forward events to renderer
      fileExportManager.on('begin', (data) =>
        sendToRenderer('export:begin', data),
      );
      fileExportManager.on('update', (data) =>
        sendToRenderer('export:update', data),
      );
      fileExportManager.on('session-exported', (sessionId) =>
        sendToRenderer('export:session-exported', sessionId),
      );
      fileExportManager.on('error', (error) =>
        sendToRenderer('export:error', error),
      );
      fileExportManager.on('finished', (data) =>
        sendToRenderer('export:finished', data),
      );
      fileExportManager.on('cancelled', (data) =>
        sendToRenderer('export:cancelled', data),
      );

      try {
        const exportTask = await fileExportManager.exportSessions(
          sessions,
          protocols,
        );
        currentExport = exportTask;
        await exportTask.run();
        return { success: true };
      } catch (error) {
        log.error('Export failed:', error);
        return { success: false, error: error.message };
      } finally {
        fileExportManager.removeAllListeners();
        currentExport = null;
      }
    },
  );

  ipcMain.handle('export:abort', () => {
    if (currentExport) {
      currentExport.abort();
    }
  });

  ipcMain.handle('export:setConsideringAbort', (_event, value) => {
    if (currentExport) {
      currentExport.setConsideringAbort(value);
    }
  });

  log.info('Export handlers registered');
};

/**
 * Remove export IPC handlers (for cleanup)
 */
export const removeExportHandlers = () => {
  const handlers = [
    'export:start',
    'export:abort',
    'export:setConsideringAbort',
  ];

  handlers.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });
};
