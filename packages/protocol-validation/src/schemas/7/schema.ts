import z from "zod";

const ProtocolSchema = z
	.object({
		description: z.string().optional(),
		lastModified: z.string().datetime().optional(),
		schemaVersion: z.literal(7),
		codebook: z.object({}).passthrough(), // Simplified for example
		stages: z.array(z.object({}).passthrough()),
	})
	.passthrough();

export default ProtocolSchema;
