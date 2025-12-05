import { z } from "zod";

const ProtocolSchema = z.looseObject({
	description: z.string().optional(),
	lastModified: z.string().datetime().optional(),
	schemaVersion: z.literal(7),
	codebook: z.looseObject({}), // Simplified for example
	stages: z.array(z.looseObject({})),
});

export default ProtocolSchema;
