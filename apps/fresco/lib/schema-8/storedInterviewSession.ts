import {
  NcNetworkSchema,
  StageMetadataSchema,
} from 'fresco-schema-8/shared-consts';
import { z } from 'zod/mini';

const StoredInterviewSessionSchema = z.object({
  network: NcNetworkSchema,
  stageMetadata: z.nullable(StageMetadataSchema),
});

/**
 * Parse the participant data a schema 8 interview row holds, with the shapes
 * the schema 8 interview writes. The counterpart of
 * `parseStoredInterviewSession` (lib/db/storedInterviewSession.ts), and as
 * there, a row that does not parse has no fallback.
 */
export function parseLegacyStoredInterviewSession(row: {
  network: unknown;
  stageMetadata: unknown;
}) {
  return StoredInterviewSessionSchema.safeParse({
    network: row.network,
    stageMetadata: row.stageMetadata,
  });
}
