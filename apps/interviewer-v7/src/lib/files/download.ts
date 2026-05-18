import { isCapacitor, isElectron } from '../platform/platform';

export async function downloadBlob(
  blob: Blob,
  suggestedName: string,
): Promise<void> {
  const buffer = new Uint8Array(await blob.arrayBuffer());

  if (isElectron && window.electronAPI?.saveFile) {
    await window.electronAPI.saveFile(suggestedName, buffer);
    return;
  }

  if (isCapacitor) {
    const { Filesystem, Directory, Encoding } =
      await import('@capacitor/filesystem');
    const base64 = await blobToBase64(blob);
    await Filesystem.writeFile({
      path: suggestedName,
      data: base64,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
