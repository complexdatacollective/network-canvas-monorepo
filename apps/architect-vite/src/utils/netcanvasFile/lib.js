import { pruneProtocol } from "~/utils/prune";
import pruneProtocolAssets from "~/utils/pruneProtocolAssets";
import { errors, handleError } from "./errors";

/**
 * Essentially the same as path.join, but also creates the directory.
 * @returns {Promise} Resolves to path as a string
 */
const getTempDir = (...args) => {
	const dirPath = path.join(remote.app.getPath("temp"), "architect", ...args);
	return fse.mkdirp(dirPath).then(() => dirPath);
};

/**
 * Given the working path for a protocol (in /tmp/protocols `protocol.json`,
 * returns a promise that resolves to the parsed json object
 * @param {string} workingPath The protocol directory.
 * @returns {object} The protocol as an object
 */
const readProtocol = (workingPath) => {
	const protocolJsonPath = path.join(workingPath, "protocol.json");

	return fse.readJson(protocolJsonPath).catch(handleError(errors.ReadError));
};

/**
 * Given the working path for a protocol (in /tmp/protocols `protocol.json`.
 * Removes assets that aren't referenced in the protocol, and removes any
 * unsuported JSON values.
 * @param {string} workingPath The protocol directory.
 * @param {object} protocol the protocol data to write
 * @returns {Promise}
 */
const writeProtocol = (workingPath, protocol) => {
	const protocolJsonPath = path.join(workingPath, "protocol.json");

	const protocolWithDate = {
		...protocol,
		lastModified: new Date().toISOString(),
	};

	return Promise.resolve()
		.then(() => pruneProtocol(protocolWithDate))
		.then((prunedProtocol) =>
			fse
				.writeJson(protocolJsonPath, prunedProtocol, { spaces: 2 })
				.catch(handleError(errors.WriteError))
				.then(() => pruneProtocolAssets(workingPath))
				.then(() => prunedProtocol),
		);
};

const commitNetcanvas = ({ savePath, backupPath }) => {
	if (!backupPath) {
		return Promise.resolve(savePath);
	}
	// Check the new file definitely exists before deleting backup
	return fse.stat(savePath).then((stat) => {
		if (!stat.isFile()) {
			throw new Error(`"${savePath}" (savePath) does not exist`);
		}
		return fse.unlink(backupPath).then(() => savePath);
	});
};

const revertNetcanvas = ({ savePath, backupPath }) => {
	if (!backupPath) {
		return Promise.resolve(savePath);
	} // Nothing to revert
	// Check the backup definitely exists before deleting other file
	return fse.stat(backupPath).then((stat) => {
		if (!stat.isFile()) {
			throw new Error(`"${backupPath}" (backupPath) does not exist`);
		}
		return fse
			.unlink(savePath)
			.then(() => fse.rename(backupPath, savePath))
			.then(() => savePath);
	});
};

export { commitNetcanvas, getTempDir, readProtocol, revertNetcanvas, writeProtocol };
