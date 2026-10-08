import {
  type CurrentProtocol,
  hashProtocol,
} from '@codaco/protocol-validation';

import type { ProtocolPayload, ResolvedAsset } from './types';

export function currentProtocolToPayload(
  protocol: CurrentProtocol,
  identity: Pick<ProtocolPayload, 'id' | 'importedAt'>,
): ProtocolPayload {
  const { assetManifest, ...rest } = protocol;
  const assets = Object.entries(assetManifest ?? {}).map<ResolvedAsset>(
    ([assetId, asset]) =>
      asset.type === 'apikey'
        ? { assetId, name: asset.name, type: 'apikey', value: asset.value }
        : { assetId, name: asset.name, type: asset.type, source: asset.source },
  );

  return {
    ...rest,
    id: identity.id,
    hash: hashProtocol(protocol),
    importedAt: identity.importedAt,
    assets,
  };
}
