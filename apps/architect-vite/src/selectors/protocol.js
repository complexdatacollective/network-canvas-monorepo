import { find, findIndex, reduce } from "es-toolkit/compat";
import { createSelector } from "@reduxjs/toolkit";

const propStageId = (_, props) => props.stageId;

export const getProtocol = (state) => {
	// First check new activeProtocol store (with timeline)
	if (state.activeProtocol?.present) {
		const protocol = state.activeProtocol.present;
		// Return null if we have an empty state
		if (!protocol || (!protocol.name && !protocol.stages && !protocol.codebook)) {
			return null;
		}
		return protocol;
	}

	// Fall back to old protocol store during transition
	return state.protocol?.present || null;
};
export const getAssetManifest = (state) => {
	const protocol = getProtocol(state);
	return protocol?.assetManifest || {};
};

export const getCodebook = (state) => {
	const protocol = getProtocol(state);
	return protocol?.codebook || null;
};

export const getStageList = createSelector([getProtocol], (protocol) => {
	const stages = protocol ? protocol.stages : [];

	return stages.map((stage) => ({
		id: stage.id,
		type: stage.type,
		label: stage.label,
		hasFilter: !!stage.filter,
		hasSkipLogic: !!stage.skipLogic,
	}));
});

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
	// During transition, check both stores

	// Check new activeProtocol store
	if (state.activeProtocol?.present) {
		// TODO: Implement proper change tracking for new store
		// For now, assume no unsaved changes
		return false;
	}

	// Check old protocol store
	const activeProtocol = state.protocol?.present;
	if (activeProtocol) {
		return activeProtocol.lastChanged > activeProtocol.lastSaved;
	}

	return false;
};

export const getIsProtocolValid = (state) => {
	const protocol = getProtocol(state);
	if (!protocol) {
		return false;
	}

	return true; // TODO: Implement actual validation logic
};

// Timeline selector - during transition, support both old and new stores
export const getTimelineLocus = (state) => {
	// Check new activeProtocol store first
	const activeProtocolTimeline = state.activeProtocol?.timeline;
	if (activeProtocolTimeline?.length > 0) {
		return activeProtocolTimeline[activeProtocolTimeline.length - 1];
	}

	// Fall back to old protocol store
	const protocolTimeline = state.protocol?.timeline;
	if (protocolTimeline?.length > 0) {
		return protocolTimeline[protocolTimeline.length - 1];
	}

	return null;
};
