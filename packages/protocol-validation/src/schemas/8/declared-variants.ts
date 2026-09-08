import type { z } from 'zod';

/**
 * A schema that is a choice between mutually exclusive object shapes, said out
 * loud because nothing about the schema itself can be read to say it.
 *
 * `exclusive-variant-containers.ts` finds such a choice by looking for a union
 * of object shapes. That works wherever the union IS the schema, and it cannot
 * work for the shape `narrowTo` builds in `common/prompts.ts`: a loose object
 * with an author-facing refinement, piped into the union through a
 * `.transform()`. The union lives in that function's closure, and a function is
 * not something a walk of the schemas can look through.
 *
 * So the walk is told. The scan reports every transform it cannot read that is
 * NOT declared here, and its test fails on one — so a new variant built the
 * same way is a test failure rather than a container silently addressed leaf by
 * leaf, which is how a document holding two variants at once gets written.
 *
 * Kept in a module of its own so that the schemas can declare a variant and the
 * scan can read the declaration without the two importing each other.
 */
const DECLARED_VARIANTS = new WeakSet<z.core.$ZodType>();

/** Declares this schema a choice between shapes, and answers with it. */
export function asExclusiveVariants<T extends z.core.$ZodType>(schema: T): T {
  DECLARED_VARIANTS.add(schema);
  return schema;
}

export const isDeclaredExclusiveVariants = (schema: z.core.$ZodType): boolean =>
  DECLARED_VARIANTS.has(schema);
