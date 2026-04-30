import type { ExportGenerationError, ProtocolNotFoundError, SessionProcessingError } from "./errors";
import type { ExportFormat } from "./options";

export type OutputEntry = {
	readonly name: string;
	readonly data: AsyncIterable<Uint8Array>;
};

export type OutputResult = {
	readonly key?: string;
	readonly url?: string;
	readonly [k: string]: unknown;
};

export type OutputHandle = unknown;

export type ExportSuccess = {
	readonly success: true;
	readonly format: ExportFormat;
	readonly sessionId: string;
	readonly partitionEntity?: string;
	readonly name: string;
};

export type ExportFailure =
	| {
			readonly kind: "generation";
			readonly sessionId: string;
			readonly format: ExportFormat;
			readonly partitionEntity?: string;
			readonly error: ExportGenerationError;
	  }
	| {
			readonly kind: "protocol-missing";
			readonly sessionId: string;
			readonly error: ProtocolNotFoundError;
	  }
	| {
			readonly kind: "session-processing";
			readonly sessionId: string;
			readonly error: SessionProcessingError;
	  };

export type ExportResult = ExportSuccess | { readonly success: false; readonly failure: ExportFailure };

export type ExportReturn = {
	readonly status: "success" | "partial";
	readonly successfulExports: ExportSuccess[];
	readonly failedExports: ExportFailure[];
	readonly output: OutputResult;
};
