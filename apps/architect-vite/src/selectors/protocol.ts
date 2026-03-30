import type { CollectionEntityType, Entity, StageEntity } from "@codaco/protocol-validation";
import { createSelector } from "@reduxjs/toolkit";
import { reduce } from "es-toolkit/compat";
import type { RootState } from "~/ducks/modules/root";

// Protocol selectors
export const getProtocol = (state: RootState) => {
	// The activeProtocol in RootState is wrapped by the timeline middleware
	// We need to extract the present value
	const timelineState = state.activeProtocol;

	return timelineState.present;
};

// Protocol metadata selectors
export const getProtocolName = (state: RootState): string | undefined => {
	return getProtocol(state)?.name;
};

export const getAssetManifest = (state: RootState) => {
	const protocol = getProtocol(state);
	return protocol?.assetManifest || {};
};

export const getCodebook = (state: RootState) => {
	const protocol = getProtocol(state);
	return protocol?.codebook || null;
};

function flattenStageEntities(entities: Entity[]): StageEntity[] {
	const result: StageEntity[] = [];
	for (const entity of entities) {
		if (entity.type === "Stage") {
			result.push(entity);
		} else if (entity.type === "Collection") {
			result.push(...flattenStageEntities((entity as CollectionEntityType).children));
		}
	}
	return result;
}

function findEntityById(entities: Entity[], id: string): Entity | undefined {
	for (const entity of entities) {
		if (entity.id === id) return entity;
		if (entity.type === "Collection") {
			const found = findEntityById((entity as CollectionEntityType).children, id);
			if (found) return found;
		}
	}
	return undefined;
}

export const getStageList = createSelector([getProtocol], (protocol) => {
	const entities = protocol ? protocol.timeline.entities : [];
	const stages = flattenStageEntities(entities);

	return stages.map((stage) => ({
		id: stage.id,
		type: stage.stageType,
		label: stage.label,
		hasFilter: "filter" in stage ? !!stage.filter : false,
		hasSkipLogic: "skipLogic" in stage ? !!stage.skipLogic : false,
	}));
});

export const getStage = (state: RootState, id: string) => {
	const protocol = getProtocol(state);
	if (!protocol) return null;

	const entity = findEntityById(protocol.timeline.entities, id);
	if (!entity || entity.type !== "Stage") return null;
	return entity;
};

export const getStageIndex = (state: RootState, id: string) => {
	const protocol = getProtocol(state);
	if (!protocol) return -1;

	const stages = flattenStageEntities(protocol.timeline.entities);
	return stages.findIndex((stage) => stage.id === id);
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

export const getIsProtocolValid = (state: RootState): boolean => {
	// Return validation result from protocolValidation slice
	const validationResult = state.protocolValidation.validationResult;
	return validationResult?.success ?? true;
};

// Timeline selector - returns the undo/redo timeline locus (past/present/future)
export const getTimelineLocus = (state: RootState) => {
	const past = state.activeProtocol?.past;
	if (past && past.length > 0) {
		return past[past.length - 1];
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
