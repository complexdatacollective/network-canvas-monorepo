import { createSelector } from "@reduxjs/toolkit";
import { get } from "es-toolkit/compat";
import { v4 as uuid } from "uuid";
import { getStageSubject } from "./prop";

const DefaultFinishStage = {
	// `id` is used as component key; must be unique from user input
	id: uuid(),
	type: "FinishSession",
	label: "Finish Interview",
};

const getActiveSession = (state) => state.activeSessionId && state.sessions[state.activeSessionId];

const getInstalledProtocols = (state) => state.installedProtocols;

const getCurrentSessionProtocol = createSelector(
	getActiveSession,
	getInstalledProtocols,
	(session, protocols) => protocols[session?.protocolUID],
);

export const getAssetManifest = createSelector(getCurrentSessionProtocol, (protocol) =>
	protocol.assets.reduce((manifest, asset) => {
		manifest[asset.assetId] = asset;
		return manifest;
	}, {}),
);

export const getAssetUrlFromId = createSelector(getAssetManifest, (manifest) => (id) => manifest[id]?.url);

export const getProtocolCodebook = createSelector(getCurrentSessionProtocol, (protocol) => protocol.codebook);

// Get all variables for all subjects in the codebook, adding the entity and type
export const getAllVariableUUIDsByEntity = createSelector(
	getProtocolCodebook,
	({ node: nodeTypes = {}, edge: edgeTypes = {}, ego = {} }) => {
		const variables = {};

		// Nodes
		for (const nodeType of Object.keys(nodeTypes)) {
			const nodeVariables = get(nodeTypes, [nodeType, "variables"], {});
			for (const variable of Object.keys(nodeVariables)) {
				variables[variable] = {
					entity: "node",
					entityType: nodeType,
					...nodeVariables[variable],
				};
			}
		}

		// Edges
		for (const edgeType of Object.keys(edgeTypes)) {
			const edgeVariables = get(edgeTypes, [edgeType, "variables"], {});
			for (const variable of Object.keys(edgeVariables)) {
				variables[variable] = {
					entity: "edge",
					entityType: edgeType,
					...edgeVariables[variable],
				};
			}
		}

		// Ego
		const egoVariables = get(ego, "variables", {});
		for (const variable of Object.keys(egoVariables)) {
			variables[variable] = {
				entity: "ego",
				entityType: null,
				...egoVariables[variable],
			};
		}

		return variables;
	},
);

const withFinishStage = (stages = []) => {
	if (!stages) {
		return [];
	}

	return [...stages, DefaultFinishStage];
};

export const getProtocolStages = createSelector(getCurrentSessionProtocol, (protocol) =>
	withFinishStage(protocol?.stages),
);

export const getCodebookVariablesForType = createSelector(
	getProtocolCodebook,
	getStageSubject,
	(codebook, subject) =>
		codebook && (subject ? codebook[subject.entity][subject.type].variables : codebook.ego.variables),
);
