import { isCapacitor, isElectron } from '../platform/platform';

export type DownloadResult = {
  saved: boolean;
  path?: string;
};

export async function downloadBlob(
  blob: Blob,
  suggestedName: string,
): Promise<DownloadResult> {
  const buffer = new Uint8Array(await blob.arrayBuffer());

  if (isElectron && window.electronAPI?.saveFile) {
    const result = await window.electronAPI.saveFile(suggestedName, buffer);
    if (result.canceled) {
      return { saved: false };
    }
    return { saved: true, path: result.path };
  }

  if (isCapacitor) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const base64 = await blobToBase64(blob);
    // Omit `encoding` so Capacitor decodes the base64 string to binary bytes;
    // passing an encoding writes the literal base64 text instead.
    const result = await Filesystem.writeFile({
      path: suggestedName,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    });
    return { saved: true, path: result.uri };
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { saved: true };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader did not return a string'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}
