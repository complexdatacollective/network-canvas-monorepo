import { z } from 'zod';

// Contract schemas shared source-first between server validation, the
// generated OpenAPI document, and the client (#1248): one Zod source of truth.
// Contract schemas must have identical input and output types — no
// `.transform()`, coercions, or divergent defaults. Named spec components
// come from Zod's registry via `.meta({ id })`.

export const StatusSchema = z
  .object({
    name: z.string(),
    version: z.string(),
  })
  .meta({ id: 'Status' });
