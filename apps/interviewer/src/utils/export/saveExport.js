/* global cordova */
import { Buffer } from 'buffer';

import { isCordova, isElectron } from '../Environment';
import { writeFile } from '../filesystem';

const blobToUint8Array = async (blob) => {
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
};

/**
 * Save an exported zip Blob to disk in a cross-platform way.
 *
 * ELECTRON: prompt with a native save dialog (default name = fileName), then
 * write the bytes to the chosen path via the app's writeFile helper.
 *
 * CORDOVA: write the bytes to cordova.file.dataDirectory + fileName.
 *
 * @param {Object} args
 * @param {Blob} args.blob The produced zip contents.
 * @param {string} args.fileName Default/suggested file name (with extension).
 * @returns {Promise<{ saved: boolean, path: string | null }>}
 */
export const saveExportBlob = async ({ blob, fileName }) => {
  const bytes = await blobToUint8Array(blob);

  if (isElectron()) {
    const { canceled, filePath } =
      await window.electronAPI.dialog.showSaveDialog({
        defaultPath: fileName,
        filters: [{ name: 'Zip archive', extensions: ['zip'] }],
      });

    if (canceled || !filePath) {
      return { saved: false, path: null };
    }

    // writeFile base64-encodes Buffer/Uint8Array/ArrayBuffer for IPC transport.
    await writeFile(filePath, Buffer.from(bytes));
    return { saved: true, path: filePath };
  }

  if (isCordova()) {
    // NOTE: writes into the app's private data directory. A subsequent share
    // step (e.g. cordova-plugin-x-socialsharing) may be desired so the user can
    // move the file off-device; that is not wired here.
    const destination = `${cordova.file.dataDirectory}${fileName}`;
    await writeFile(destination, bytes);
    return { saved: true, path: destination };
  }

  throw new Error('saveExportBlob() is not supported on this platform');
};
