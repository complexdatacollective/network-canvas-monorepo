import { z } from 'zod';

import { type StageType, stageSchema } from '@codaco/protocol-validation';

/** The two keys the editing session owns, which are never a section's. */
const IDENTITY_KEYS: readonly string[] = Object.freeze(['id', 'type']);

/**
 * A key the schema declares only to refuse it — a finish stage's `skipLogic`
 * — can never be configured, so no editor owns it.
 */
const isRefusedKey = (schema: z.ZodType): boolean =>
  (schema instanceof z.ZodOptional ? schema.unwrap() : schema) instanceof
  z.ZodNever;

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
  const shape: Record<string, z.ZodType> = option.shape;
  return Object.keys(shape)
    .filter((key) => !IDENTITY_KEYS.includes(key))
    .filter((key) => {
      const keySchema = shape[key];
      return keySchema === undefined || !isRefusedKey(keySchema);
    })
    .toSorted();
}
