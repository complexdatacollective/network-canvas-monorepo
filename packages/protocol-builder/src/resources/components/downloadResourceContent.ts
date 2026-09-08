import type { ResourceContent } from '../gateway.ts';

/**
 * Hands bytes the gateway returned to the researcher's own computer.
 *
 * The gateway returns content rather than a location, so saving it is the
 * editor's job and involves no host URL: an object URL made here, used once,
 * and revoked. Hosts without one (a test environment, a server render) simply
 * do not save, which is why the call site announces the download from the
 * gateway's result rather than from anything this returns.
 */
export function downloadResourceContent(
  content: ResourceContent,
  filename: string,
): void {
  if (typeof URL.createObjectURL !== 'function') return;

  // Copied into a buffer of its own rather than handed the view the gateway
  // returned: a `Blob` takes ownership of what it is given, and the gateway's
  // bytes may be a view onto something the host still holds.
  const buffer = new ArrayBuffer(content.bytes.byteLength);
  new Uint8Array(buffer).set(content.bytes);
  const url = URL.createObjectURL(
    new Blob([buffer], { type: content.contentType }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
