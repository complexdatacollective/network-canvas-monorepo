import {
  detectSchemaVersion,
  protocolMigrations,
  VersionedProtocolSchema,
} from '@codaco/protocol-validation';

const LEGACY_ARCHITECT_SCHEMA_VERSION = 7;

const normalizeForValidation = (protocol) => {
  const schemaVersion = detectSchemaVersion(protocol);

  if (schemaVersion < LEGACY_ARCHITECT_SCHEMA_VERSION) {
    return protocolMigrations.migrate(
      { ...protocol, schemaVersion },
      LEGACY_ARCHITECT_SCHEMA_VERSION,
      {},
    );
  }

  return { ...protocol, schemaVersion };
};

const issuesFor = (protocol) => {
  try {
    const result = VersionedProtocolSchema.safeParse(
      normalizeForValidation(protocol),
    );
    return result.success ? [] : result.error.issues;
  } catch (error) {
    return [
      {
        message: error instanceof Error ? error.message : String(error),
        path: [],
      },
    ];
  }
};

export const validateSchema = (protocol) => issuesFor(protocol);

// Cross-reference validation is integrated into the current Zod schemas.
export const validateLogic = () => [];
