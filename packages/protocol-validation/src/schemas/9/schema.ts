import { z } from "~/utils/zod-mock-extension";

export * from "../8/assets";
export * from "../8/codebook";
export * from "../8/common/experiments";
export * from "../8/common/forms";
export * from "../8/common/introductionPanel";
export * from "../8/common/panels";
export * from "../8/common/prompts";
export * from "../8/common/subjects";
export * from "../8/filters";
export * from "../8/variables";

export * from "./stages";
export * from "./timeline";

import { assetSchema } from "../8/assets";
import { CodebookSchema } from "../8/codebook";
import { ExperimentsSchema } from "../8/common/experiments";
import { timelineSchema } from "./timeline/timeline";

const ProtocolSchema = z.strictObject({
	name: z.string().min(1),
	description: z.string().optional(),
	experiments: ExperimentsSchema.optional(),
	lastModified: z.string().datetime().optional(),
	schemaVersion: z.literal(9),
	codebook: CodebookSchema,
	assetManifest: z.record(z.string(), assetSchema).optional(),
	timeline: timelineSchema,
});

export default ProtocolSchema;
