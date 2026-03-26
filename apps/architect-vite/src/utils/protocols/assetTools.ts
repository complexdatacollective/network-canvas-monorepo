/* eslint-disable import/prefer-default-export */

import { getVariableNamesFromNetwork, type Network, validateNames } from "@codaco/protocol-validation";
import csv from "csvtojson";
import { get } from "es-toolkit/compat";
import { getAssetById } from "~/utils/assetUtils";
import { getSupportedAssetType } from "~/utils/protocols/importAsset";

type ReaderFunc = (...args: string[]) => Promise<unknown>;
type ExtensionConfig = Record<string, ReaderFunc>;

interface CodedError extends Error {
	code?: string;
}

const withExtensionSwitch =
	(configuration: ExtensionConfig, fallback: ReaderFunc = () => Promise.resolve()) =>
	(filePathOrUrl: string, ...rest: string[]) => {
		if (!filePathOrUrl) {
			return null;
		}
		const extension = filePathOrUrl.split(".").pop()?.toLowerCase() || "";

		const f = get(configuration, [extension], fallback) as ReaderFunc;
		return f(...rest);
	};

const readJsonNetwork = async (assetId: string): Promise<Network> => {
	const asset = await getAssetById(assetId);

	if (!asset) {
		throw new Error(`Asset with ID "${assetId}" not found in IndexedDB`);
	}

	if (typeof asset.data === "string") {
		return JSON.parse(asset.data) as Network;
	}

	const text = await asset.data.text();
	return JSON.parse(text) as Network;
};

const readCsvNetwork = async (assetId: string): Promise<Network> => {
	const asset = await getAssetById(assetId);

	if (!asset) {
		throw new Error(`Asset with ID "${assetId}" not found in IndexedDB`);
	}

	if (typeof asset.data === "string") {
		throw new Error("Expected Blob data for CSV asset");
	}

	const data = await asset.data.text();

	let nodes: Network["nodes"];
	try {
		const rows = await csv({ checkColumn: true }).fromString(data);
		nodes = rows.map((attributes) => ({ attributes })) as Network["nodes"];
	} catch (e: unknown) {
		const error = e as CodedError;
		if (error.toString().includes("column_mismatched")) {
			error.code = "COLUMN_MISMATCHED";
		}
		throw error;
	}

	return {
		nodes,
		edges: [],
	};
};

export const networkReader = withExtensionSwitch({
	csv: readCsvNetwork,
	json: readJsonNetwork,
});

export const getNetworkVariables = async (assetId: string) => {
	const asset = await getAssetById(assetId);
	if (!asset) {
		throw new Error(`Asset with ID "${assetId}" not found in IndexedDB`);
	}

	const network = (await networkReader(asset.name, assetId)) as Network | null;

	if (!network) {
		return null;
	}
	return getVariableNamesFromNetwork(network);
};

const validateNetwork = async (file: File) => {
	const extension = file.name.split(".").pop()?.toLowerCase() || "";

	let network: Network | undefined;

	if (extension === "json") {
		const text = await file.text();
		network = JSON.parse(text) as Network;
	} else if (extension === "csv") {
		const text = await file.text();
		const csvModule = await import("csvtojson");
		let nodes: Network["nodes"];
		try {
			const rows = await csvModule.default({ checkColumn: true }).fromString(text);
			nodes = rows.map((attributes) => ({ attributes })) as Network["nodes"];
		} catch (e: unknown) {
			const error = e as CodedError;
			if (error.toString().includes("column_mismatched")) {
				error.code = "COLUMN_MISMATCHED";
			}
			throw error;
		}
		network = { nodes, edges: [] };
	}

	if (get(network, "nodes", []).length === 0 && get(network, "edges", []).length === 0) {
		throw new Error("Network asset doesn't include any nodes or edges");
	}

	const variableNames = getVariableNamesFromNetwork(network as Network);

	const errorString = validateNames(variableNames);

	if (errorString) {
		const error: CodedError = new Error(errorString);
		error.code = "VARIABLE_NAME";
		throw error;
	}

	return true;
};

export const validateAsset = async (file: File) => {
	const assetType = getSupportedAssetType(file.name);

	if (!assetType) {
		throw new Error("Asset type not supported");
	}

	if (assetType === "network") {
		await validateNetwork(file);
	}

	return true;
};

export const getGeoJsonVariables = async (assetId: string) => {
	const asset = await getAssetById(assetId);

	if (!asset) {
		throw new Error(`Asset with ID "${assetId}" not found in IndexedDB`);
	}

	if (typeof asset.data === "string") {
		throw new Error("Expected Blob data for GeoJSON asset");
	}

	const text = await asset.data.text();
	const geoJson = JSON.parse(text) as { features?: { properties?: Record<string, unknown> }[] };

	if (geoJson?.features?.[0]?.properties) {
		return Object.keys(geoJson.features[0].properties);
	}

	return [];
};
