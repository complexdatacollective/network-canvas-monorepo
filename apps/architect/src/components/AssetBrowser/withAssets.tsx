import { filter, map } from 'es-toolkit/compat';
import { compose, withHandlers, withState } from 'react-recompose';
import { connect } from 'react-redux';

import type { Asset as ProtocolAsset } from '@codaco/protocol-validation';
import type { Asset } from '~/ducks/modules/protocol/assetManifest';
import type { RootState } from '~/ducks/modules/root';
import { getAssetIndex, utils as indexUtils } from '~/selectors/indexes';
import { getDisplayAssetManifest } from '~/selectors/protocol';

type AssetWithUsage = Asset & { isUsed: boolean };

const filterByAssetType = (
  assetType: string | null,
  assets: Asset[],
): Asset[] =>
  assetType ? filter(assets, ({ type }) => type === assetType) : assets;

const withKeysAsIds = (assets: Record<string, ProtocolAsset>): Asset[] =>
  map(assets, (asset, id) => ({ ...asset, id }) as Asset);

const filterAssets = (
  assetType: string | null,
  assets: Record<string, ProtocolAsset>,
): Asset[] => filterByAssetType(assetType, withKeysAsIds(assets));

type FilterHandlerProps = {
  setAssetType: (assetType: string | null) => void;
};

const filterHandlers = withHandlers<FilterHandlerProps, object>({
  onUpdateAssetFilter:
    ({ setAssetType }: FilterHandlerProps) =>
    (assetType: string | null) =>
      setAssetType(assetType),
});

type OwnProps = {
  assetType: string | null;
  selected: string | null;
  type?: string | null;
};

const mapStateToProps = (
  state: RootState,
  { assetType, selected }: OwnProps,
) => {
  // Display names, so two resources sharing a filename can be told apart in the
  // library and in the stage-editor pickers. Every label a researcher reads or
  // types against is built from this `name`: the card heading and its tooltip,
  // the Preview/Download/Delete action labels, and the Collection's typeahead
  // key. The stored manifest is untouched — see `getDisplayAssetManifest`.
  const allAssets = getDisplayAssetManifest(state);
  const filteredAssets = filterAssets(assetType, allAssets);
  // Get asset usage index
  const assetIndex = getAssetIndex(state);
  const assetSearch = indexUtils.buildSearch([assetIndex]);

  // Check for asset usage
  const assets: AssetWithUsage[] = filteredAssets.map((asset) => {
    const isUsed = assetSearch.has(asset.id) || asset.id === selected;

    return {
      ...asset,
      isUsed,
    };
  });

  return {
    assets,
  };
};

const withAssets = compose<OwnProps, OwnProps>(
  withState('assetType', 'setAssetType', ({ type }: OwnProps) => type),
  filterHandlers,
  connect(mapStateToProps),
);

export default withAssets;
