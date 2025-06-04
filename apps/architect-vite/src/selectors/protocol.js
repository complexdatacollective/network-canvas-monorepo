import { find, findIndex, get, reduce } from "es-toolkit/compat";
import { createSelector } from "@reduxjs/toolkit";

const propStageId = (_, props) => props.stageId;

export const getProtocol = (state) => state.protocol.present;
export const getAssetManifest = (state) => get(state, "protocol.present.assetManifest", {});
export const getCodebook = (state) => get(state, "protocol.present.codebook", null);

export const getStageList = createSelector(
	[getProtocol],
	(protocol) => {
		const stages = protocol ? protocol.stages : [];

		return stages.map((stage) => ({
			id: stage.id,
			type: stage.type,
			label: stage.label,
			hasFilter: !!stage.filter,
			hasSkipLogic: !!stage.skipLogic,
		}));
	}
);

export const getStage = (state, id) => {
	const protocol = getProtocol(state);
	const stage = find(protocol.stages, ["id", id]);

	return stage;
};

export const getStageIndex = (state, id) => {
	const protocol = getProtocol(state);
	const stageIndex = findIndex(protocol.stages, ["id", id]);

	return stageIndex;
};

// TODO: replace this with getStage
export const makeGetStage = () =>
	createSelector(getProtocol, propStageId, (protocol, stageId) => find(protocol.stages, ["id", stageId]));

const networkTypes = new Set(["network", "async:network"]);

// TODO: Does this method make sense here?
export const getNetworkAssets = createSelector(getAssetManifest, (assetManifest) =>
	reduce(
		assetManifest,
		(memo, asset, name) => {
			if (!networkTypes.has(asset.type)) {
				return memo;
			}

			return { ...memo, [name]: asset };
		},
		{},
	),
);

export const getExperiments = (state) => {
	const protocol = getProtocol(state);
	const experiments = protocol ? protocol.experiments : [];

	return experiments;
};

export const getHasUnsavedChanges = (state) => {
	const activeProtocol = getProtocol(state);

	return activeProtocol.lastChanged > activeProtocol.lastSaved;
};

export const getIsProtocolValid = (state) => {
	const protocol = getProtocol(state);
	if (!protocol) {
		return false;
	}

	return true; // TODO: Implement actual validation logic
};
