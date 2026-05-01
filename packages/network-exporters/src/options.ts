import { z } from "zod/mini";

/**
 * @public
 */
export const ExportOptionsSchema = z.object({
	exportGraphML: z.boolean(),
	exportCSV: z.boolean(),
	globalOptions: z.object({
		useScreenLayoutCoordinates: z.boolean(),
		screenLayoutHeight: z.number(),
		screenLayoutWidth: z.number(),
	}),
	concurrency: z.optional(z.number()),
	appVersion: z.optional(z.string()),
	commitHash: z.optional(z.string()),
});

export type ExportOptions = z.infer<typeof ExportOptionsSchema>;

export type ExportFormat = "graphml" | "attributeList" | "edgeList" | "ego" | "adjacencyMatrix";
