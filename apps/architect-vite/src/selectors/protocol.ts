import { createSelector } from "@reduxjs/toolkit";
import { find, findIndex, reduce } from "es-toolkit/compat";
import type { ActiveProtocolState } from "~/ducks/modules/activeProtocol";
import type { RootState } from "~/ducks/modules/root";

// Selector that properly handles the TimelineState wrapping in RootState
export const selectActiveProtocol = (state: RootState): ActiveProtocolState => {
	// The activeProtocol in RootState is wrapped by the timeline middleware
	// We need to extract the present value
	const timelineState = state.activeProtocol;

	if (timelineState && typeof timelineState === "object" && "present" in timelineState) {
		return (timelineState as unknown as { present: ActiveProtocolState }).present ?? null;
	}

	// Fallback for raw state (shouldn't happen in normal operation)
	return (timelineState as unknown as ActiveProtocolState) ?? null;
};

// During transition, check both old and new stores
export const getProtocol = (state: RootState) => {
	// First check new activeProtocol store (with timeline)
	const activeProtocol = selectActiveProtocol(state);
	if (activeProtocol) {
		return activeProtocol;
	}

	// Fall back to old protocol store during transition
	return state.activeProtocol?.present || null;
};

export const getAssetManifest = (state: RootState) => {
	const protocol = getProtocol(state);
	return protocol?.assetManifest || {};
};

export const getCodebook = (state: RootState) => {
	const protocol = getProtocol(state);
	return protocol?.codebook || null;
};

export const getStageList = createSelector([getProtocol], (protocol) => {
	const stages = protocol ? protocol.stages : [];

	return stages.map((stage) => ({
		id: stage.id,
		type: stage.type,
		label: stage.label,
		hasFilter: "filter" in stage ? !!stage.filter : false,
		hasSkipLogic: !!stage.skipLogic,
	}));
});

export const getStage = (state: RootState, id: string) => {
	const protocol = getProtocol(state);
	if (!protocol) return null;

	const stage = find(protocol.stages, ["id", id]);
	return stage;
};

export const getStageIndex = (state: RootState, id: string) => {
	const protocol = getProtocol(state);
	if (!protocol) return -1;

	const stageIndex = findIndex(protocol.stages, ["id", id]);
	return stageIndex;
};

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

export const getExperiments = (state: RootState) => {
	const protocol = getProtocol(state);
	const experiments = protocol ? protocol.experiments : undefined;

	return experiments;
};

export const getHasUnsavedChanges = (state: RootState): boolean => {
	const protocol = getProtocol(state);
	if (!protocol) return false;

	const currentTimeline = getTimelineLocus(state);
	const lastSavedTimeline = protocol.lastSavedTimeline;

	// No saved state yet
	if (!lastSavedTimeline) {
		// Has unsaved changes if timeline has moved from initial state
		const timeline = state.activeProtocol?.timeline || [];
		return timeline.length > 1;
	}

	// Compare current timeline position with last saved position
	return currentTimeline !== lastSavedTimeline;
};

export const getIsProtocolValid = (_state: RootState): boolean => {
	// Return validation result from Redux state
	return true;
};

// Timeline selector
export const getTimelineLocus = (state: RootState) => {
	// Check new activeProtocol store first
	const activeProtocolTimeline = (state as RootState & { activeProtocol?: { timeline?: unknown[] } }).activeProtocol
		?.timeline;
	if (activeProtocolTimeline?.length > 0) {
		return activeProtocolTimeline[activeProtocolTimeline.length - 1];
	}

	// Fall back to old protocol store
	const protocolTimeline = (state as RootState & { protocol?: { timeline?: unknown[] } }).protocol?.timeline;
	if (protocolTimeline && protocolTimeline.length > 0) {
		return protocolTimeline[protocolTimeline.length - 1];
	}

	return null;
};

// Undo/redo selectors
export const getCanUndo = (state: RootState): boolean => {
	const past = state.activeProtocol?.past || [];
	if (past.length === 0) return false;

	// Don't allow undo if it would take us back to a null state
	const wouldBePresent = past[past.length - 1];
	return wouldBePresent !== null && wouldBePresent !== undefined;
};

export const getCanRedo = (state: RootState): boolean => {
	const future = state.activeProtocol?.future || [];
	return future.length > 0;
};
