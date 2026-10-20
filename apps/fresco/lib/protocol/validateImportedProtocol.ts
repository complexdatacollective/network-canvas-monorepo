import {
  CURRENT_SCHEMA_VERSION,
  type CurrentProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';

type ProtocolValidationSuccess = {
  success: true;
  protocol: CurrentProtocol;
};

export type ProtocolValidationError =
  | { success: false; error: 'invalid-object' }
  | { success: false; error: 'unsupported-version'; version: unknown }
  | { success: false; error: 'validation-failed'; validationResult: unknown };

type ProtocolValidationResult =
  | ProtocolValidationSuccess
  | ProtocolValidationError;

/**
 * Validate a protocol imported at the current schema version, as it is.
 *
 * Fresco never upgrades a protocol: each schema version it accepts is stored
 * at that version, and a schema 8 protocol is validated by
 * `validateImportedLegacyProtocol` instead. Any other version is refused.
 */
export async function validateImportedProtocol(
  protocolJson: unknown,
): Promise<ProtocolValidationResult> {
  if (!protocolJson || typeof protocolJson !== 'object') {
    return { success: false, error: 'invalid-object' };
  }

  const version =
    'schemaVersion' in protocolJson ? protocolJson.schemaVersion : undefined;
  if (version !== CURRENT_SCHEMA_VERSION) {
    return { success: false, error: 'unsupported-version', version };
  }

  const validationResult = await validateProtocol(protocolJson);

  if (!validationResult.success) {
    return {
      success: false,
      error: 'validation-failed',
      validationResult,
    };
  }

  return { success: true, protocol: validationResult.data as CurrentProtocol };
}
