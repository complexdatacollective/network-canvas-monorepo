import {
  createMigration,
  type ProtocolDocument,
} from '../../migration/index.ts';

// Schema 9 only accepts more variable names than schema 8 did, so every valid
// version 8 document is already a valid version 9 one.
const migrationV8toV9 = createMigration({
  from: 8,
  to: 9,
  dependencies: {},
  notes: `- Attribute names can now use letters from any language, as well as spaces and punctuation. Existing attribute names are not changed.`,
  // Schema 8's stub type cannot carry the document's shape, so the result is
  // asserted here and checked against schema 9 when the chain validates it.
  migrate: (doc) =>
    ({
      ...doc,
      schemaVersion: 9 as const,
    }) as ProtocolDocument<9>,
});

export default migrationV8toV9;
