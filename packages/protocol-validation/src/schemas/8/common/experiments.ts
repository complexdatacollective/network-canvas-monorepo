import { z } from "~/utils/zod-mock-extension";

export const ExperimentsSchema = z.object({
	encryptedVariables: z.boolean().optional(),
});

export type Experiments = z.infer<typeof ExperimentsSchema>;
