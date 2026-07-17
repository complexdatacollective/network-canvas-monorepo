const ASSET_MIME_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
};

/**
 * Recover MIME types that archive formats do not retain from the manifest's
 * source filename. An empty string preserves the browser's default for file
 * types that do not need an explicit override.
 */
export function getAssetMimeType(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1) return '';

  return ASSET_MIME_TYPES[filename.slice(dotIndex).toLowerCase()] ?? '';
}
