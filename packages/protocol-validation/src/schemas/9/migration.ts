import { createMigration } from '../../migration/index.ts';

// Schema 9 only accepts more variable names than schema 8 did, so every valid
// version 8 document is already a valid version 9 one.
const migrationV8toV9 = createMigration({
  from: 8,
  to: 9,
  dependencies: {},
  notes: `- Attribute names can now use letters from any language, as well as spaces and punctuation. Existing attribute names are not changed.`,
  migrate: (doc) => ({
    ...doc,
    schemaVersion: 9 as const,
  }),
});

export default migrationV8toV9;
