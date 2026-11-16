import type { AssetRequestHandler } from '../contract/types';

/**
 * Reads the text out of a `data:` URL without fetching it. A host may hand an
 * asset over this way, and a page whose content security policy leaves `data:`
 * out of `connect-src` refuses to fetch one.
 */
function decodeDataUrl(url: string): string | undefined {
  if (!url.startsWith('data:')) return undefined;
  const comma = url.indexOf(',');
  if (comma === -1) return undefined;
  const body = url.slice(comma + 1);
  if (!url.slice(0, comma).endsWith(';base64')) {
    return decodeURIComponent(body);
  }
  const bytes = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Resolves an asset through the host and reads its contents as text. */
export async function readAssetText(
  onRequestAsset: AssetRequestHandler,
  assetId: string,
  signal: AbortSignal,
): Promise<string> {
  const url = await onRequestAsset(assetId);
  signal.throwIfAborted();
  const inline = decodeDataUrl(url);
  if (inline !== undefined) return inline;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Asset "${assetId}" failed to load (${response.status})`);
  }
  return response.text();
}
