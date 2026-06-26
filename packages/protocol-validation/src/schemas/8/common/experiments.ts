import { z } from 'zod';

export const ExperimentsSchema = z.strictObject({
  encryptedVariables: z.boolean().optional(),
});

export type Experiments = z.infer<typeof ExperimentsSchema>;
