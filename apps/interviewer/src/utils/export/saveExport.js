import { Buffer } from 'buffer';

import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

import { isCapacitor, isElectron } from '../Environment';
import { writeFile } from '../filesystem';

/**
 * Save an exported zip Blob to disk in a cross-platform way.
 *
 * ELECTRON: prompt with a native save dialog (default name = fileName), then
 * write the bytes to the chosen path via the app's writeFile helper.
 *
 * CAPACITOR: base64-encode the bytes, write to the OS cache directory, then
 * open the native share sheet so the user can move the file off-device.
 *
 * @param {Object} args
 * @param {Blob} args.blob The produced zip contents.
 * @param {string} args.fileName Default/suggested file name (with extension).
 * @returns {Promise<{ saved: boolean, path: string | null }>}
 */
export const saveExportBlob = async ({ blob, fileName }) => {
  const arrayBuffer = await blob.arrayBuffer();

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
    await writeFile(filePath, Buffer.from(arrayBuffer));
    return { saved: true, path: filePath };
  }

  if (isCapacitor()) {
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const { uri } = await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({ title: fileName, url: uri });
    return { saved: true, path: uri };
  }

  throw new Error('saveExportBlob() is not supported on this platform');
};
