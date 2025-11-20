import { filter, map } from "lodash";
import { connect } from "react-redux";
import { compose, withHandlers, withState } from "recompose";
import type { Asset } from "~/ducks/modules/protocol/assetManifest";
import type { RootState } from "~/ducks/modules/root";
import { getAssetIndex, utils as indexUtils } from "~/selectors/indexes";
import { getAssetManifest } from "~/selectors/protocol";

type AssetWithId = Asset;
type AssetWithUsage = AssetWithId & { isUsed: boolean };

const filterByAssetType = (assetType: string | null, assets: AssetWithId[]): AssetWithId[] =>
	assetType ? filter(assets, ({ type }) => type === assetType) : assets;

const withKeysAsIds = (assets: Record<string, Asset>): AssetWithId[] => map(assets, (asset, id) => ({ ...asset, id }));

const filterAssets = (assetType: string | null, assets: Record<string, Asset>): AssetWithId[] =>
	filterByAssetType(assetType, withKeysAsIds(assets));

type FilterHandlerProps = {
	setAssetType: (assetType: string | null) => void;
};

const filterHandlers = withHandlers<FilterHandlerProps, {}>({
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

const mapStateToProps = (state: RootState, { assetType, selected }: OwnProps) => {
	const allAssets = getAssetManifest(state);
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
	withState("assetType", "setAssetType", ({ type }: OwnProps) => type),
	filterHandlers,
	connect(mapStateToProps),
);

export default withAssets;
