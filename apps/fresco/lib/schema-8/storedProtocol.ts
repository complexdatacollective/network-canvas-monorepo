import {
  CodebookSchema,
  ExperimentsSchema,
  stageSchema,
} from 'fresco-schema-8/protocol-validation';
import { z } from 'zod/mini';

const StoredProtocolSchema = z.object({
  stages: z.array(stageSchema),
  codebook: CodebookSchema,
  experiments: ExperimentsSchema,
});

/**
 * Parse the design a schema 8 protocol row holds, with the validation that
 * schema was released with. The counterpart of `parseStoredProtocol`
 * (lib/db/storedProtocol.ts), and as there, a row that does not parse has no
 * fallback: every caller refuses to go on.
 */
export function parseLegacyStoredProtocol(row: {
  stages: unknown;
  codebook: unknown;
  experiments: unknown;
}) {
  return StoredProtocolSchema.safeParse({
    stages: row.stages,
    codebook: row.codebook,
    // A protocol that enables no experiments stores none.
    experiments: row.experiments ?? {},
  });
}
