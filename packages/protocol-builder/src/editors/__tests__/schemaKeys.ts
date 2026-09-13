import { type StageType, stageSchema } from '@codaco/protocol-validation';

/** The two keys the editing session owns, which are never a section's. */
const IDENTITY_KEYS: readonly string[] = Object.freeze(['id', 'type']);

/**
 * Every key the protocol schema declares for one interface, asked of the
 * schema itself.
 *
 * Read rather than listed, because a list would be a second copy of the
 * schema: a key added to an interface in a later release has to fail the tests
 * that use this, and a list written out beside them would go on passing while
 * the editor silently discarded it.
 *
 * Shared rather than declared in each test that wants it: two copies of a
 * "read the schema" helper is two chances to read it differently, and the
 * whole value of the reading is that it is the schema's answer rather than
 * somebody's.
 */
export function schemaKeysFor(stageType: StageType): string[] {
  const option = stageSchema.options.find(
    (candidate) => candidate.shape.type.value === stageType,
  );
  if (option === undefined) {
    throw new Error(`The protocol schema has no "${stageType}" stage.`);
  }
  return Object.keys(option.shape)
    .filter((key) => !IDENTITY_KEYS.includes(key))
    .toSorted();
}
