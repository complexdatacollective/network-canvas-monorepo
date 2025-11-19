/* eslint-disable import/prefer-default-export */

import { getVariableNamesFromNetwork } from "@codaco/protocol-validation";
import csvParse from "csv-parse";
import { first, get } from "lodash";

/**
 * Generate a switching function that takes a filepath/URL as an argument
 * and returns match from configuration object.
 */
const withExtensionSwitch =
	(configuration, fallback = () => Promise.resolve()) =>
	(filePathOrUrl) => {
		// Extract extension from path/URL (web-compatible)
		const extension = filePathOrUrl.split(".").pop()?.toLowerCase() || "";

		return get(configuration, [extension], fallback);
	};

const readJsonVariables = (data) =>
	new Promise((resolve, reject) => {
		try {
			const network = JSON.parse(data);

			const variableNames = getVariableNamesFromNetwork(network);

			return resolve(variableNames);
		} catch (e) {
			return reject(e);
		}
	});

const readCsvVariables = (data) =>
	new Promise((resolve, reject) => {
		try {
			csvParse(data, { trim: true }, (_err, tableData) => {
				const firstRow = first(tableData);

				return resolve(firstRow);
			});
		} catch (e) {
			reject(e);
		}
	});

/**
 * Get validator based on filePath, if no validator available it resolves by default
 * @param {string} filepath - The filename of the network asset
 * @returns {string} - Returns a function that returns a promise.
 */
const getVariableReader = withExtensionSwitch({
	csv: readCsvVariables,
	json: readJsonVariables,
});

/**
 * Gets node variables from an external data source
 * In the future, this will fetch from a remote asset service
 * @param {string} assetUrl - The URL of the external data source
 */
export const getAssetVariables = async (assetUrl) => {
	const _variableReader = getVariableReader(assetUrl);
	return [];
};
