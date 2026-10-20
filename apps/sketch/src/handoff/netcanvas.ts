// Builds the .netcanvas file: a zip holding protocol.json and the files its
// assetManifest names under assets/<source name>.

import type JSZip from 'jszip';

import type { GeneratedAsset } from '../shared/api.ts';

export const netcanvasFileName = (protocolName: string): string => {
  const slug = protocolName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return `${slug || 'protocol'}.netcanvas`;
};

// JSZip loads on first use, keeping it out of the start page's bundle.
const createZip = async (
  protocol: Record<string, unknown>,
  assets: GeneratedAsset[],
): Promise<JSZip> => {
  const { default: JSZipClass } = await import('jszip');
  const zip = new JSZipClass();
  zip.file('protocol.json', JSON.stringify(protocol, null, 2));
  for (const asset of assets) {
    zip.file(`assets/${asset.name}`, asset.content);
  }
  return zip;
};

// The archive's bytes (what the download saves).
export const buildNetcanvas = async (
  protocol: Record<string, unknown>,
  assets: GeneratedAsset[],
): Promise<Uint8Array> =>
  (await createZip(protocol, assets)).generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
  });

// Builds the file and hands it to the browser to save. Returns the file name.
export const downloadNetcanvas = async (
  protocol: Record<string, unknown>,
  assets: GeneratedAsset[],
  protocolName: string,
): Promise<string> => {
  const blob = await (
    await createZip(protocol, assets)
  ).generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    mimeType: 'application/zip',
  });
  const fileName = netcanvasFileName(protocolName);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return fileName;
};
