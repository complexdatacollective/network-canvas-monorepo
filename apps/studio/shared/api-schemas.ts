import { z } from '@hono/zod-openapi';

// Contract schemas shared source-first between server validation, the
// generated OpenAPI document, and the client (#1248): one Zod source of truth.
// Contract schemas must have identical input and output types — no
// `.transform()`, coercions, or divergent defaults.

export const StatusSchema = z
  .object({
    name: z.string(),
    version: z.string(),
  })
  .openapi('Status');

export type Status = z.infer<typeof StatusSchema>;
