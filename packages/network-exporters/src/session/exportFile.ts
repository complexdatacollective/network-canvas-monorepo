import type { Codebook } from "@codaco/protocol-validation";
import { Effect } from "effect";
import { ExportGenerationError } from "../errors";
import type { ExportFormat, ExportOptions } from "../options";
import type { ExportFailure, ExportSuccess, OutputEntry } from "../output";
import { getFileExtension, makeFilename } from "../utils/general";
import { getFormatter } from "../utils/getFormatter";
import type { partitionByType } from "./partitionByType";

export type ExportFileNetwork = ReturnType<typeof partitionByType>[number];

type ExportFileParams = {
	prefix: string;
	exportFormat: ExportFormat;
	network: ExportFileNetwork;
	codebook: Codebook;
	exportOptions: ExportOptions;
	sessionId: string;
};

export type GenerationResult =
	| { ok: true; success: ExportSuccess; entry: OutputEntry }
	| { ok: false; failure: ExportFailure };

const exportFile = (params: ExportFileParams): Effect.Effect<GenerationResult> =>
	Effect.sync(() => {
		const { prefix, exportFormat, network, codebook, exportOptions, sessionId } = params;
		const toBytes = getFormatter(exportFormat);
		const extension = getFileExtension(exportFormat);
		const name = makeFilename(prefix, network.partitionEntity, exportFormat, extension);

		try {
			const data = toBytes(network, codebook, exportOptions);
			const success: ExportSuccess = {
				success: true,
				format: exportFormat,
				sessionId,
				partitionEntity: network.partitionEntity,
				name,
			};
			return { ok: true, success, entry: { name, data } };
		} catch (cause) {
			const error = new ExportGenerationError({
				cause,
				format: exportFormat,
				sessionId,
				partitionEntity: network.partitionEntity,
			});
			return {
				ok: false,
				failure: {
					kind: "generation",
					sessionId,
					format: exportFormat,
					partitionEntity: network.partitionEntity,
					error,
				},
			};
		}
	});

export default exportFile;
