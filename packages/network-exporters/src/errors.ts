import { Data } from "effect";
import type { ExportFormat } from "./options";

export class DatabaseError extends Data.TaggedError("NetworkExporters/DatabaseError")<{
	readonly cause: unknown;
}> {}

export class OutputError extends Data.TaggedError("NetworkExporters/OutputError")<{
	readonly cause: unknown;
}> {}

export class ExportGenerationError extends Data.TaggedError("NetworkExporters/ExportGenerationError")<{
	readonly cause: unknown;
	readonly format: ExportFormat;
	readonly sessionId: string;
	readonly partitionEntity?: string;
}> {}

export class ProtocolNotFoundError extends Data.TaggedError("NetworkExporters/ProtocolNotFoundError")<{
	readonly hash: string;
	readonly sessionId: string;
}> {}

export class SessionProcessingError extends Data.TaggedError("NetworkExporters/SessionProcessingError")<{
	readonly cause: unknown;
	readonly stage: "format" | "insertEgo" | "resequence";
	readonly sessionId: string;
}> {}

export type ExportError = DatabaseError | OutputError;

type AnyExportError = ExportError | ExportGenerationError | ProtocolNotFoundError | SessionProcessingError;

const TAG_FALLBACK_MESSAGE: Record<AnyExportError["_tag"], string> = {
	"NetworkExporters/DatabaseError": "Database connection failed",
	"NetworkExporters/OutputError": "Output failed",
	"NetworkExporters/ExportGenerationError": "Failed to generate an export file",
	"NetworkExporters/ProtocolNotFoundError": "Protocol not found",
	"NetworkExporters/SessionProcessingError": "Failed to process session",
};

function classifyCause(
	cause: unknown,
): { kind: "oom" } | { kind: "disk-full" } | { kind: "timeout" } | { kind: "connection" } | { kind: "unknown" } {
	if (cause && typeof cause === "object" && "code" in cause) {
		const code = cause.code;
		if (code === "ENOSPC") return { kind: "disk-full" };
		if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") return { kind: "timeout" };
		if (code === "ECONNREFUSED" || code === "ECONNRESET") return { kind: "connection" };
	}

	const message = cause instanceof Error ? cause.message.toLowerCase() : String(cause).toLowerCase();
	if (message.includes("heap") || message.includes("out of memory")) return { kind: "oom" };
	if (message.includes("no space")) return { kind: "disk-full" };
	if (message.includes("timeout") || message.includes("timed out")) return { kind: "timeout" };
	if (message.includes("database") || message.includes("prisma")) return { kind: "connection" };
	return { kind: "unknown" };
}

export function describeExportError(error: unknown, stage?: string): string {
	const stageSuffix = stage ? ` while ${stage}` : "";

	if (error instanceof ExportGenerationError) {
		const partition = error.partitionEntity ? ` (${error.partitionEntity})` : "";
		return `Failed to generate ${error.format}${partition} for session ${error.sessionId}: ${
			error.cause instanceof Error ? error.cause.message : String(error.cause)
		}`;
	}

	if (error instanceof ProtocolNotFoundError) {
		return `Protocol ${error.hash} not found for session ${error.sessionId}`;
	}

	if (error instanceof SessionProcessingError) {
		return `Failed to process session ${error.sessionId} during ${error.stage}: ${
			error.cause instanceof Error ? error.cause.message : String(error.cause)
		}`;
	}

	if (error instanceof DatabaseError || error instanceof OutputError) {
		const classification = classifyCause(error.cause);
		switch (classification.kind) {
			case "oom":
				return `Export ran out of memory${stageSuffix}. Try exporting fewer interviews at a time.`;
			case "disk-full":
				return `Export ran out of disk space${stageSuffix}. Please free up server storage and try again.`;
			case "timeout":
				return `Export timed out${stageSuffix}. Try exporting fewer interviews at a time.`;
			case "connection":
				return `${TAG_FALLBACK_MESSAGE[error._tag]}${stageSuffix}.`;
			case "unknown":
				return `${TAG_FALLBACK_MESSAGE[error._tag]}${stageSuffix}: ${
					error.cause instanceof Error ? error.cause.message : String(error.cause)
				}`;
		}
	}

	const message = error instanceof Error ? error.message : "An unexpected error occurred";
	return `Export failed${stageSuffix}: ${message}`;
}
