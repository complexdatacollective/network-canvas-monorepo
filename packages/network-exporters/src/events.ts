type ExportStage = "fetching" | "formatting" | "generating" | "outputting";

export const stageMessages: Record<ExportStage, string> = {
	fetching: "Fetching interview data...",
	formatting: "Formatting sessions...",
	generating: "Generating files...",
	outputting: "Writing output...",
};

type ExportStageEvent = {
	type: "stage";
	stage: ExportStage;
	message: string;
};

type ExportProgressEvent = {
	type: "progress";
	stage: "generating" | "outputting";
	current: number;
	total: number;
};

export type ExportEvent = ExportStageEvent | ExportProgressEvent;
