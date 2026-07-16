import {
  createMigration,
  type ProtocolDocument,
} from '../../migration/index.ts';

const migrationV2toV3 = createMigration({
  from: 2,
  to: 3,
  dependencies: {},
  migrate: (doc) =>
    ({
      ...doc,
      schemaVersion: 3 as const,
    }) as ProtocolDocument<3>,
});

export default migrationV2toV3;
