import JSZip from 'jszip';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { getAssetById } from './assetUtils';

async function getAllProtocolAssets(
  protocol: CurrentProtocol,
  protocolId?: string,
) {
  const assets: Array<{ id: string; source: string; data: Blob | string }> = [];

  if (!protocol.assetManifest) {
    return assets;
  }

  for (const [assetId, assetDefinition] of Object.entries(
    protocol.assetManifest,
  )) {
    // apikey assets have no file data to bundle (and no `source`).
    if (assetDefinition.type === 'apikey') {
      continue;
    }

    const assetData = await getAssetById(assetId, protocolId);

    // A missing asset means an unresolvable scope or stranded manifest entry;
    // bundling it silently would produce a broken .netcanvas, so fail loudly.
    if (!assetData) {
      throw new Error(
        `Cannot resolve asset "${assetId}" for export. Pass the owning ` +
          `protocolId or set an active protocol scope before bundling.`,
      );
    }

    if (typeof assetData.data === 'string') {
      continue;
    }

    assets.push({
      id: assetId,
      source: assetDefinition.source,
      data: assetData.data,
    });
  }

  return assets;
}

async function bundleProtocol(
  protocol: CurrentProtocol,
  protocolId?: string,
): Promise<Blob> {
  const zip = new JSZip();

  const protocolJson = JSON.stringify(protocol, null, 2);
  zip.file('protocol.json', protocolJson);

  if (protocol.assetManifest) {
    const assets = await getAllProtocolAssets(protocol, protocolId);

    const assetsFolder = zip.folder('assets');
    if (assetsFolder) {
      for (const asset of assets) {
        assetsFolder.file(asset.source, asset.data);
      }
    }
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
  });

  return blob;
}

export async function downloadProtocolAsNetcanvas(
  protocol: CurrentProtocol,
  protocolName?: string,
  protocolId?: string,
): Promise<void> {
  try {
    const blob = await bundleProtocol(protocol, protocolId);

    // build local timestamp YYYY-MM-DD_HH-MM
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timestamp = `${year}-${month}-${day}_${hours}-${minutes}`;

    // Use provided name, or default to "protocol"
    const fileName = `${(protocolName ?? 'protocol').replace(/\s+/g, '_')}-${timestamp}.netcanvas`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    throw new Error(
      `Failed to download protocol: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { cause: error },
    );
  }
}
