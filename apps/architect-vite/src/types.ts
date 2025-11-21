import type { CurrentProtocol } from "@codaco/protocol-validation";

/**
 * Extended protocol type that includes runtime metadata added by the app.
 * The base CurrentProtocol from protocol-validation contains only the protocol schema,
 * but the app adds metadata like name, description, and lastModified at runtime.
 */
export type ProtocolWithMetadata = CurrentProtocol & {
	name?: string;
	lastModified?: string;
	filePath?: string;
	workingPath?: string;
};
