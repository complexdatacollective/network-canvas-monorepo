import { CapacitorHttp } from '@capacitor/core';

import { isCapacitor, isElectron } from '../platform/platform';

// On Electron, the renderer's CSP is `connect-src 'self'` — outbound HTTP runs
// in the main process. On Capacitor, `CapacitorHttp` is used so the request
// goes through the native HTTP stack and is not subject to WebView CORS. On
// web, plain fetch applies and the user is responsible for hosting on a
// CORS-enabled origin.
export async function fetchProtocolFromUrl(url: string): Promise<Uint8Array> {
  if (isElectron && window.electronAPI?.fetchProtocolFromUrl) {
    const result = await window.electronAPI.fetchProtocolFromUrl(url);
    if (!result.ok) throw new Error(result.message);
    return result.data;
  }

  if (isCapacitor) {
    const response = await CapacitorHttp.request({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Server responded with ${response.status}`);
    }
    return decodeCapacitorBinary(response.data);
  }

  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(
      `Server responded with ${response.status} ${response.statusText}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

// CapacitorHttp returns binary as a base64 string on iOS/Android because the
// bridge can't transport raw bytes. ArrayBuffer / Uint8Array are handled too
// in case a future runtime hands them through directly.
function decodeCapacitorBinary(data: unknown): Uint8Array {
  if (typeof data === 'string') {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Uint8Array) return data;
  throw new Error('Unexpected response payload from CapacitorHttp');
}
