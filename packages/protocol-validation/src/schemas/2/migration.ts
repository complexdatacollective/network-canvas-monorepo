import { createMigration, type ProtocolDocument } from '~/migration';

const migrationV1toV2 = createMigration({
  from: 1,
  to: 2,
  dependencies: {},
  migrate: (doc) =>
    ({
      ...doc,
      schemaVersion: 2 as const,
    }) as ProtocolDocument<2>,
});

export default migrationV1toV2;
