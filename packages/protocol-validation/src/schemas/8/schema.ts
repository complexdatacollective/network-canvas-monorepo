import { z } from 'zod';

const ProtocolSchema = z.looseObject({
  description: z.string().optional(),
  lastModified: z.string().datetime().optional(),
  schemaVersion: z.literal(8),
  codebook: z.looseObject({}),
  stages: z.array(z.looseObject({})),
});

export default ProtocolSchema;
