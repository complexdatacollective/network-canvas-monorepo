import type { CurrentProtocol } from "@codaco/protocol-validation";

/**
 * Extended protocol type that includes optional runtime metadata.
 * The base CurrentProtocol from protocol-validation contains only the protocol schema.
 * Note: Protocol name is now stored separately in protocolMeta slice.
 */
export type ProtocolWithMetadata = CurrentProtocol & {
	lastModified?: string;
	filePath?: string;
	workingPath?: string;
};
