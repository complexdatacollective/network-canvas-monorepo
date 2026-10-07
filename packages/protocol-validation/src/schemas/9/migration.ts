import { createMigration } from '../../migration/index.ts';
import type { Codebook } from '../8/schema.ts';

// Under schema 8 the runtime encrypted an attribute marked `encrypted` only
// while `experiments.encryptedVariables` was on; otherwise it stored the
// plaintext. Schema 9 always encrypts, so a protocol migrated with the
// experiment off loses the mark, and an interview already under way goes on
// storing its answers as plaintext, as it did before.
const withoutEncryptedAttributes = (codebook: Codebook): Codebook => {
  if (!codebook.node) return codebook;
  return {
    ...codebook,
    node: Object.fromEntries(
      Object.entries(codebook.node).map(([type, definition]) => [
        type,
        definition.variables
          ? {
              ...definition,
              variables: Object.fromEntries(
                Object.entries(definition.variables).map(
                  ([id, { encrypted: _encrypted, ...variable }]) => [
                    id,
                    variable,
                  ],
                ),
              ),
            }
          : definition,
      ]),
    ),
  };
};

const migrationV8toV9 = createMigration({
  from: 8,
  to: 9,
  dependencies: {},
  notes: `- Attribute names can now use letters from any language, as well as spaces and punctuation. Existing attribute names are not changed.
- Encrypted attributes are no longer experimental: the Anonymisation interface is always available, and an attribute marked as encrypted is always encrypted. If this protocol marked attributes as encrypted without turning on the experimental "Encrypted Attributes" feature, those attributes are no longer marked, so they keep being collected without encryption.`,
  migrate: ({ experiments, ...doc }) => ({
    ...doc,
    codebook:
      experiments?.encryptedVariables === true
        ? doc.codebook
        : withoutEncryptedAttributes(doc.codebook),
    schemaVersion: 9 as const,
  }),
});

export default migrationV8toV9;
