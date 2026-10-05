import migrationV8toV9 from '../../9/migration.ts';
import ProtocolSchemaV9 from '../../9/schema.ts';
import ProtocolSchemaV8 from '../schema.ts';

/**
 * Schema 8 is a loose stub, so a version 8 document is validated the way a
 * host validates it: checked against that stub, migrated to version 9, and
 * parsed by the schema 9 root. Issue paths and messages are schema 9's.
 */
export const V8OutputSchema = ProtocolSchemaV8.transform((protocol): unknown =>
  migrationV8toV9.migrate(protocol, {}),
).pipe(ProtocolSchemaV9);
