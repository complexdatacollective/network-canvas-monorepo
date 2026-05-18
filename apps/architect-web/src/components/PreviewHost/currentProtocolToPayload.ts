import { v4 as uuid } from 'uuid';

import type { ProtocolPayload, ResolvedAsset } from '@codaco/interview';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { hashProtocol } from '@codaco/protocol-validation';

export function currentProtocolToPayload(
  protocol: CurrentProtocol,
): ProtocolPayload {
  const { assetManifest, ...rest } = protocol;
  const assets: ResolvedAsset[] = Object.entries(assetManifest ?? {}).map(
    ([assetId, asset]) => {
      if (asset.type === 'apikey') {
        return {
          assetId,
          name: asset.name,
          type: 'apikey',
          value: asset.value,
        };
      }
      return { assetId, name: asset.source, type: asset.type };
    },
  );

  return {
    ...rest,
    id: uuid(),
    hash: hashProtocol({
      codebook: protocol.codebook,
      stages: protocol.stages,
    }),
    importedAt: new Date().toISOString(),
    assets,
  };
}
