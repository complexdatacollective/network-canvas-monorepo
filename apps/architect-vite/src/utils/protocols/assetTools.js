/* eslint-disable import/prefer-default-export */

import { getVariableNamesFromNetwork, validateNames } from "@codaco/protocol-validation";
import csv from "csvtojson";
import { get } from "es-toolkit/compat";
import { getSupportedAssetType } from "~/utils/protocols/importAsset";

/**
 * Generate a switching function that takes a filepath/URL as an argument
 * and returns match from configuration object based on file extension.
 */
const withExtensionSwitch =
	(configuration, fallback = () => Promise.resolve()) =>
	(filePathOrUrl, ...rest) => {
		if (!filePathOrUrl) {
			return null;
		}
		// Extract extension from path/URL (web-compatible)
		const extension = filePathOrUrl.split(".").pop()?.toLowerCase() || "";

		const f = get(configuration, [extension], fallback);
		return f(filePathOrUrl, ...rest);
	};

/**
 * Fetches and parses JSON network data
 * In the future, this will fetch from a remote asset service
 */
const readJsonNetwork = async (_assetUrl) => {
	// TODO: When assets are stored remotely, this will be:
	// const response = await fetch(assetUrl);
	// return response.json();

	// For now, return empty network as placeholder
	console.warn("Asset loading not yet implemented for web. Returning empty network.");
	return { nodes: [], edges: [] };
};

/**
 * Fetches and parses CSV network data
 * In the future, this will fetch from a remote asset service
 */
const readCsvNetwork = async (_assetUrl) => {
	// TODO: When assets are stored remotely, this will be:
	// const response = await fetch(assetUrl);
	// const data = await response.text();

	// For now, return empty network as placeholder
	console.warn("CSV asset loading not yet implemented for web. Returning empty network.");
	const data = "";

	const nodes = await csv({ checkColumn: true })
		.fromString(data)
		.then((rows) => rows.map((attributes) => ({ attributes })))
		.catch((e) => {
			if (e.toString().includes("column_mismatched")) {
				e.code = "COLUMN_MISMATCHED";
			}
			throw e;
		});

	return {
		nodes,
	};
};

/**
 * Get validator based on filePath, if no validator available it resolves by default
 * @param {string} filepath - The filename of the network asset
 * @returns {string} - Returns a function that returns a promise.
 */
export const networkReader = withExtensionSwitch({
	csv: readCsvNetwork,
	json: readJsonNetwork,
});

/**
 * Gets node variables from an external data source
 * @param {buffer} file - The external data source
 */
export const getNetworkVariables = async (filePath) => {
	const network = await networkReader(filePath);

	if (!network) {
		return null;
	}
	return getVariableNamesFromNetwork(network);
};

const validateNetwork = async (filePath) => {
	const network = await networkReader(filePath);

	if (get(network, "nodes", []).length === 0 && get(network, "edges", []).length === 0) {
		throw new Error("Network asset doesn't include any nodes or edges");
	}

	// check variable names
	const variableNames = getVariableNamesFromNetwork(network);

	const errorString = validateNames(variableNames);

	if (errorString) {
		const error = new Error(errorString);
		error.code = "VARIABLE_NAME";
		throw error;
	}

	return true;
};

/**
 * Checks that imported asset is valid
 * @param {buffer} file - The file to check.
 */
export const validateAsset = async (filePath) => {
	const assetType = getSupportedAssetType(filePath);

	if (!assetType) {
		throw new Error("Asset type not supported");
	}

	if (assetType === "network") {
		await validateNetwork(filePath);
	}

	return true;
};

/**
 * Gets variables from a GeoJSON asset
 * In the future, this will fetch from a remote asset service
 */
export const getGeoJsonVariables = async (_assetUrl) => {
	// TODO: When assets are stored remotely, this will be:
	// const response = await fetch(assetUrl);
	// const geoJson = await response.json();

	// For now, return empty array as placeholder
	console.warn("GeoJSON asset loading not yet implemented for web. Returning empty variables.");
	return [];
};
