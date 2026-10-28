import { get } from 'es-toolkit/compat';

import type { Asset } from '@codaco/protocol-validation';
import { getNetworkVariables } from '~/utils/protocols/assetTools';

export const getAssetPath = (
  assetManifest: Record<string, Asset>,
  dataSource: string,
) => {
  const asset = get(assetManifest, dataSource);

  if (!asset) {
    return null;
  }

  if (!('source' in asset)) {
    return null;
  }

  const assetPath = `assets/${asset.source}`;
  return assetPath;
};

export const makeGetNetworkAssetVariables =
  (assetManifest: Record<string, Asset>) =>
  async (dataSource: string, asOptions = false) => {
    const asset = get(assetManifest, dataSource);

    if (!asset) {
      return null;
    }

    const variables = await getNetworkVariables(dataSource);

    if (!variables) {
      return null;
    }

    if (asOptions) {
      const variableOptions = variables.map((attribute: string) => ({
        label: attribute,
        value: attribute,
      }));
      return variableOptions;
    }

    return variables;
  };
