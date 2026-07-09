import type { CurrentProtocol } from '@codaco/protocol-validation';
import { getAssetById } from '~/utils/assetUtils';

import type { ProtocolSourceRef } from './index';

const PROTOCOL_SOURCE_ENDPOINT = '/__architect/protocol-source/save';
const PROTOCOL_SOURCE_AUTHORING_HEADER =
  'X-Architect-Protocol-Source-Authoring';

export const isProtocolSourceAuthoringEnabled =
  import.meta.env.DEV &&
  import.meta.env.VITE_PROTOCOL_SOURCE_AUTHORING === 'true';

type SourceSaveAsset = {
  id: string;
  name: string;
  source: string;
  dataBase64: string;
  mimeType?: string;
};

type SourceSaveRequest = {
  sourceRef: ProtocolSourceRef;
  protocol: CurrentProtocol;
  assets: SourceSaveAsset[];
};

export type SourceSaveResponse =
  | {
      ok: true;
      writtenProtocolPath: string;
      writtenAssets: string[];
      removedAssets: string[];
    }
  | { ok: false; error: string; issues?: string[] };

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

const blobToBase64 = async (blob: Blob): Promise<string> =>
  arrayBufferToBase64(await blob.arrayBuffer());

const collectSourceAssets = async (
  protocol: CurrentProtocol,
  protocolId: string,
): Promise<SourceSaveAsset[]> => {
  const assets: SourceSaveAsset[] = [];

  for (const [assetId, definition] of Object.entries(
    protocol.assetManifest ?? {},
  )) {
    if (definition.type === 'apikey') {
      continue;
    }

    if (!('source' in definition) || typeof definition.source !== 'string') {
      throw new Error(`Asset ${assetId} is missing a source filename.`);
    }

    const asset = await getAssetById(assetId, protocolId);
    if (!asset || typeof asset.data === 'string') {
      throw new Error(`Asset ${definition.name} could not be read.`);
    }

    assets.push({
      id: assetId,
      name: asset.name,
      source: definition.source,
      dataBase64: await blobToBase64(asset.data),
      mimeType: asset.data.type || undefined,
    });
  }

  return assets;
};

export const saveProtocolSource = async ({
  sourceRef,
  protocol,
  protocolId,
}: {
  sourceRef: ProtocolSourceRef;
  protocol: CurrentProtocol;
  protocolId: string;
}): Promise<SourceSaveResponse> => {
  const request: SourceSaveRequest = {
    sourceRef,
    protocol,
    assets: await collectSourceAssets(protocol, protocolId),
  };

  const response = await fetch(PROTOCOL_SOURCE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [PROTOCOL_SOURCE_AUTHORING_HEADER]: 'true',
    },
    body: JSON.stringify(request),
  });

  const body = (await response.json()) as SourceSaveResponse;
  if (!response.ok && body.ok) {
    return { ok: false, error: 'Source save failed.' };
  }
  return body;
};
