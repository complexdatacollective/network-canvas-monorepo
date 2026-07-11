import {
  detectSchemaVersion,
  protocolMigrations,
} from '@codaco/protocol-validation';

const migrateProtocol = (document, targetVersion, dependencies = {}) => {
  const schemaVersion = detectSchemaVersion(document);
  return protocolMigrations.migrate(
    { ...document, schemaVersion },
    targetVersion,
    dependencies,
  );
};

export default migrateProtocol;
