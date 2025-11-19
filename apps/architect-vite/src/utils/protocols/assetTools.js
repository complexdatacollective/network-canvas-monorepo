/* eslint-disable import/prefer-default-export */

import { getVariableNamesFromNetwork, validateNames } from "@codaco/protocol-validation";
import csv from "csvtojson";
import { get } from "es-toolkit/compat";
import { getAssetById } from "~/utils/assetUtils";
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
		return f(...rest);
	};

/**
 * Fetches and parses JSON network data
 * Loads from IndexedDB using the asset ID
 */
const readJsonNetwork = async (assetId) => {
	const asset = await getAssetById(assetId);

	if (!asset) {
		throw new Error(`Asset with ID "${assetId}" not found in IndexedDB`);
	}

	if (typeof asset.data === "string") {
		// If it's already a string, parse it as JSON
		return JSON.parse(asset.data);
	}

	// Convert Blob to text and parse as JSON
	const text = await asset.data.text();
	return JSON.parse(text);
};

/**
 * Fetches and parses CSV network data
 * Loads from IndexedDB using the asset ID
 */
const readCsvNetwork = async (assetId) => {
	const asset = await getAssetById(assetId);

	if (!asset) {
		throw new Error(`Asset with ID "${assetId}" not found in IndexedDB`);
	}

	// Convert Blob to text
	const data = await asset.data.text();

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
 * @param {string} assetId - The asset ID from the asset manifest
 */
export const getNetworkVariables = async (assetId) => {
	// Get the asset to determine its type from the filename
	const asset = await getAssetById(assetId);
	if (!asset) {
		throw new Error(`Asset with ID "${assetId}" not found in IndexedDB`);
	}

	// Use the asset name to determine file type, pass asset ID to the reader
	const network = await networkReader(asset.name, assetId);

	if (!network) {
		return null;
	}
	return getVariableNamesFromNetwork(network);
};

/**
 * Validates a network file (CSV or JSON)
 * @param {File} file - The File object to validate
 */
const validateNetwork = async (file) => {
	// Read file content based on extension
	const extension = file.name.split(".").pop()?.toLowerCase() || "";

	let network;

	if (extension === "json") {
		const text = await file.text();
		network = JSON.parse(text);
	} else if (extension === "csv") {
		const text = await file.text();
		const csv = await import("csvtojson");
		const nodes = await csv
			.default({ checkColumn: true })
			.fromString(text)
			.then((rows) => rows.map((attributes) => ({ attributes })))
			.catch((e) => {
				if (e.toString().includes("column_mismatched")) {
					e.code = "COLUMN_MISMATCHED";
				}
				throw e;
			});
		network = { nodes };
	}

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
 * @param {File} file - The File object to validate
 */
export const validateAsset = async (file) => {
	const assetType = getSupportedAssetType(file.name);

	if (!assetType) {
		throw new Error("Asset type not supported");
	}

	if (assetType === "network") {
		await validateNetwork(file);
	}

	return true;
};

/**
 * Gets variables from a GeoJSON asset
 * Loads from IndexedDB using the asset ID
 */
export const getGeoJsonVariables = async (assetId) => {
	const asset = await getAssetById(assetId);

	if (!asset) {
		throw new Error(`Asset with ID "${assetId}" not found in IndexedDB`);
	}

	let geoJson;
	// Convert Blob to text and parse as JSON
	const text = await asset.data.text();
	geoJson = JSON.parse(text);

	// Extract property keys from the first feature
	if (geoJson?.features?.[0]?.properties) {
		return Object.keys(geoJson.features[0].properties);
	}

	return [];
};
