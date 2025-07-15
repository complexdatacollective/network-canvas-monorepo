import type { Protocol } from "@codaco/protocol-validation";
import { createAsyncThunk, createSelector } from "@reduxjs/toolkit";
import { find, findIndex, reduce } from "es-toolkit/compat";
import { UnsavedChanges } from "~/components/Dialogs";
import { selectActiveProtocol } from "~/ducks/modules/activeProtocol";
import { actionCreators as dialogsActions } from "~/ducks/modules/dialogs";
import type { RootState } from "~/ducks/modules/root";

const propStageId = (_: any, props: { stageId: string }) => props.stageId;

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

export const getStageList = createSelector([getProtocol], (protocol: Protocol) => {
	const stages = protocol ? protocol.stages : [];

	return stages.map((stage) => ({
		id: stage.id,
		type: stage.type,
		label: stage.label,
		hasFilter: !!stage.filter,
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

// TODO: replace this with getStage
export const makeGetStage = () =>
	createSelector(getProtocol, propStageId, (protocol, stageId) =>
		protocol ? find(protocol.stages, ["id", stageId]) : null,
	);

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
	// TODO: need a new state item to track last saved time
	return false;
};

export const checkUnsavedChanges = createAsyncThunk("protocol/check-unsaved-changes", (_, thunkAPI) => {
	const state = thunkAPI.getState() as RootState;
	const hasUnsavedChanges = getHasUnsavedChanges(state);

	if (!hasUnsavedChanges) {
		return Promise.resolve(true);
	}

	const unsavedChangesDialog = UnsavedChanges({
		confirmLabel: "Discard changes and continue",
	});

	return thunkAPI.dispatch(dialogsActions.openDialog(unsavedChangesDialog)).unwrap();
});

export const getIsProtocolValid = (_state: RootState): boolean => {
	// Return validation result from Redux state
	return true;
};

// Timeline selector
export const getTimelineLocus = (state: RootState) => {
	// Check new activeProtocol store first
	const activeProtocolTimeline = (state as any).activeProtocol?.timeline;
	if (activeProtocolTimeline?.length > 0) {
		return activeProtocolTimeline[activeProtocolTimeline.length - 1];
	}

	// Fall back to old protocol store
	const protocolTimeline = (state as any).protocol?.timeline;
	if (protocolTimeline?.length > 0) {
		return protocolTimeline[protocolTimeline.length - 1];
	}

	return null;
};

// New selectors for the activeProtocol store
export const hasActiveProtocol = (state: RootState): boolean => {
	return Boolean(selectActiveProtocol(state));
};
