import {
  type CurrentProtocol as LegacyProtocol,
  validateProtocol,
} from 'fresco-schema-8/protocol-validation';

import { type ProtocolValidationError } from '~/lib/protocol/validateImportedProtocol';
import { LEGACY_SCHEMA_VERSION } from '~/lib/schema-8/version';

export type { LegacyProtocol };

type LegacyProtocolValidationResult =
  | { success: true; protocol: LegacyProtocol }
  | ProtocolValidationError;

/**
 * Validate a schema 8 protocol being imported, as it is, with the validation
 * schema 8 was released with. It is stored at schema 8 and its interviews run
 * in the schema 8 interview Fresco bundles. The counterpart of
 * `validateImportedProtocol`, for the current schema.
 */
export async function validateImportedLegacyProtocol(protocolJson: {
  schemaVersion: number;
}): Promise<LegacyProtocolValidationResult> {
  if (protocolJson.schemaVersion !== LEGACY_SCHEMA_VERSION) {
    return {
      success: false,
      error: 'unsupported-version',
      version: protocolJson.schemaVersion,
    };
  }

  // Schema 8's validator is typed for a protocol it has already read, but it
  // parses whatever it is given: this is the file as it was imported.
  const validationResult = await validateProtocol(
    protocolJson as Parameters<typeof validateProtocol>[0],
  );
  if (!validationResult.success) {
    return { success: false, error: 'validation-failed', validationResult };
  }

  const protocol = validationResult.data;
  if (protocol.schemaVersion !== LEGACY_SCHEMA_VERSION) {
    return { success: false, error: 'validation-failed', validationResult };
  }

  return { success: true, protocol };
}
