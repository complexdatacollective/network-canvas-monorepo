import { z } from "zod";

export const ExperimentsSchema = z.object({
	encryptedVariables: z.boolean().optional(),
});

export type Experiments = z.infer<typeof ExperimentsSchema>;
