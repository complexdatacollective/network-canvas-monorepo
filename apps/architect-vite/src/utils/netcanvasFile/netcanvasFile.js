import { canUpgrade, migrateProtocol } from "@codaco/protocol-validation";
import { APP_SCHEMA_VERSION } from "~/config";
import { saveDialog } from "~/utils/dialogs";
import protocolTemplate from "~/utils/protocolTemplate.json";
import { errors } from "./errors";

const schemaVersionStates = {
	UPGRADE_APP: "UPGRADE_APP",
	UPGRADE_PROTOCOL: "UPGRADE_PROTOCOL",
	OK: "OK",
};

const getNewFileName = (filePath) =>
	Promise.resolve(path.basename(filePath, ".netcanvas")).then((basename) =>
		saveDialog({
			buttonLabel: "Save",
			nameFieldLabel: "Save:",
			defaultPath: `${basename} (schema version ${APP_SCHEMA_VERSION}).netcanvas`,
			filters: [{ name: "Network Canvas", extensions: ["netcanvas"] }],
		}),
	);

const ProtocolsDidNotMatchError = new Error("Protocols did not match");

/**
 * Create a new .netcanvas file at the target location.
 *
 * @param destinationUserPath Destination path
 * @returns {Promise} Resolves to { savePath, backupPath }
 */
const createNetcanvas = () => Promise.resolve({ schemaVersion: APP_SCHEMA_VERSION, ...protocolTemplate });
// getTempDir("new")
// 	.then((newDir) => {
// 		const workingPath = path.join(newDir, uuid());
// 		const assetPath = path.join(workingPath, "assets");

// 		return fse
// 			.mkdirp(assetPath)
// 			.then(() => ({ schemaVersion: APP_SCHEMA_VERSION, ...protocolTemplate }))
// 			.then((protocol) => createNetcanvasExport(workingPath, protocol))
// 			.then((netcanvasExportPath) => deployNetcanvas(netcanvasExportPath, destinationUserPath))
// 			.then(() => destinationUserPath);
// 	})
// 	.catch(handleError(errors.CreateFailed));

/**
 * Asseses a .netcanvas file schema version against the app schema version (or
 * optional specified version). Returns a status code from `schemaVersionStates`.
 *
 * @param filePath .netcanvas file path
 * @param referenceVersion (optional) schema version for comparison
 * @returns {Promise} Resolves to a `schemaVersionStatus`
 */
const checkSchemaVersion = (protocol, referenceVersion = APP_SCHEMA_VERSION) =>
	new Promise((resolve, reject) => {
		if (!protocol.schemaVersion) {
			reject(errors.MissingSchemaVersion);
		}

		// If the version matches, then we can open it!
		if (referenceVersion === protocol.schemaVersion) {
			resolve([protocol.schemaVersion, schemaVersionStates.OK]);
		}

		// If the schema is potentially upgradable then try to migrate it
		if (canUpgrade(protocol.schemaVersion, referenceVersion)) {
			resolve([protocol.schemaVersion, schemaVersionStates.UPGRADE_PROTOCOL]);
		}

		// If the schema version is higher than the app, or
		// we can't find an upgrade path user may need to upgrade the app
		resolve([protocol.schemaVersion, schemaVersionStates.UPGRADE_APP]);
	});

/**
 * Save the protocol to the target filepath, verify before moving to userspace
 * @param filePath .netcanvas file path
 * @returns {Promise} Resolves to { savePath, backupPath }
 */
const saveNetcanvas = (workingPath, protocol, filePath) => {
	console.log("save netcanvas not implemented");
};

/**
 * Upgrades a .netcanvas file to the app schema version (or optional specified version).
 * Creates a new file for the updated .netcanvas
 *
 * @param filePath .netcanvas file path
 * @param newFilePath destination file path
 * @param targetVersion (optional) target version to migrate to
 * @returns {Promise} Resolves to `newFilePath`
 */
const migrateNetcanvas = (protocol, targetVersion = APP_SCHEMA_VERSION) =>
	migrateProtocol(protocol, targetVersion).then((updatedProtocol) => {
		log.info("Migrated protocol", { updatedProtocol });

		return saveNetcanvas(workingPath, updatedProtocol, newFilePath);
	});

export { checkSchemaVersion, createNetcanvas, getNewFileName, migrateNetcanvas, saveNetcanvas, schemaVersionStates };
