import { z } from 'zod';

import {
  originalCodebookKeys,
  withOriginalCodebookKeys,
} from '../../../__tests__/testIds.ts';
import migrationV8toV9 from '../../9/migration.ts';
import { ProtocolSchemaV9 } from '../../9/schema.ts';
import ProtocolSchemaV8 from '../schema.ts';

const withKeysIn = (text: string, keys: ReadonlyMap<string, string>) =>
  [...keys].reduce(
    (result, [key, original]) => result.replaceAll(key, original),
    text,
  );

/**
 * Schema 8 is a loose stub, so a version 8 document is validated the way a
 * host validates it: checked against that stub, migrated to version 9, and
 * parsed by the schema 9 root. Issue paths and messages are schema 9's.
 *
 * The migration gives each node type, edge type and variable whose key is
 * not a UUID a new random id, so the result, and each issue's path and
 * message, name each by the key the version 8 document gave it (see
 * `withOriginalCodebookKeys`).
 */
export const V8OutputSchema = ProtocolSchemaV8.transform((protocol, ctx) => {
  const migrated = migrationV8toV9.migrate(protocol, {});
  const result = ProtocolSchemaV9.safeParse(migrated);
  if (result.success) return withOriginalCodebookKeys(result.data, protocol);
  const keys = originalCodebookKeys(migrated, protocol);
  for (const issue of result.error.issues) {
    ctx.addIssue({
      ...issue,
      message: withKeysIn(issue.message, keys),
      path: issue.path.map((segment) =>
        typeof segment === 'string' ? (keys.get(segment) ?? segment) : segment,
      ),
    });
  }
  return z.NEVER;
});
