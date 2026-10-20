import {
  type CurrentProtocol as LegacyProtocol,
  getMigrationInfo,
  migrateProtocol,
  validateProtocol,
  type VersionedProtocol,
  VersionedProtocolSchema,
} from 'fresco-schema-8/protocol-validation';

import { type ProtocolValidationError } from '~/lib/protocol/validateAndMigrateProtocol';
import { LEGACY_SCHEMA_VERSION } from '~/lib/schema-8/version';

export type { LegacyProtocol };

type LegacyProtocolValidationResult =
  | { success: true; protocol: LegacyProtocol }
  | ProtocolValidationError;

/**
 * Validate a protocol a researcher chose to keep at schema 8 when importing
 * it, with the validation schema 8 was released with. A schema 7 protocol is
 * brought up to schema 8 on the way, as Fresco 4 did when it imported one.
 * The counterpart of `validateAndMigrateProtocol`, which upgrades to the
 * current schema.
 */
export async function validateAndMigrateLegacyProtocol(
  protocolJson: { schemaVersion: number },
  dependencies: Record<string, unknown> = {},
): Promise<LegacyProtocolValidationResult> {
  if (protocolJson.schemaVersion > LEGACY_SCHEMA_VERSION) {
    return {
      success: false,
      error: 'unsupported-version',
      version: protocolJson.schemaVersion,
    };
  }

  // The document as schema 8's own reader sees it.
  const versioned = VersionedProtocolSchema.safeParse(protocolJson);
  if (!versioned.success) {
    return {
      success: false,
      error: 'validation-failed',
      validationResult: versioned,
    };
  }
  const protocolVersion = versioned.data.schemaVersion;

  let protocolToValidate: VersionedProtocol = versioned.data;
  if (protocolVersion < LEGACY_SCHEMA_VERSION) {
    const missingDependencies = getMigrationInfo(
      protocolVersion,
      LEGACY_SCHEMA_VERSION,
    ).dependencies.filter((dep) => !(dep in dependencies));

    if (missingDependencies.length > 0) {
      return {
        success: false,
        error: 'missing-dependencies',
        missingDependencies,
      };
    }

    protocolToValidate = migrateProtocol(
      versioned.data,
      LEGACY_SCHEMA_VERSION,
      dependencies,
    );
  }

  const validationResult = await validateProtocol(protocolToValidate);
  if (!validationResult.success) {
    return { success: false, error: 'validation-failed', validationResult };
  }

  const protocol = validationResult.data;
  if (protocol.schemaVersion !== LEGACY_SCHEMA_VERSION) {
    return { success: false, error: 'validation-failed', validationResult };
  }

  return { success: true, protocol };
}
