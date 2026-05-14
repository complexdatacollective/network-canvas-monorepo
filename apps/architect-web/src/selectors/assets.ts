import { get } from "es-toolkit/compat";
import type { RootState } from "~/ducks/modules/root";
import { getNetworkVariables } from "~/utils/protocols/assetTools";
import { getAssetManifest } from "./protocol";

export const getAssetPath = (state: RootState, dataSource: string) => {
	const assetManifest = getAssetManifest(state);
	const asset = get(assetManifest, dataSource);

	if (!asset) {
		return null;
	}

	if (!("source" in asset)) {
		return null;
	}

	const assetPath = `assets/${asset.source}`;
	return assetPath;
};

export const makeGetNetworkAssetVariables =
	(state: RootState) =>
	async (dataSource: string, asOptions = false) => {
		const assetManifest = getAssetManifest(state);
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
