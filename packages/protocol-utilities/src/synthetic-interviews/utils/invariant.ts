/**
 * Assert something a valid protocol guarantees.
 *
 * Generation assumes its input passed `@codaco/protocol-validation`, so the
 * cross-references a simulator follows — a stage's subject naming a codebook
 * entity, a `quickAdd` naming a text variable on it — always resolve. That
 * assumption is what lets a simulator read the codebook directly instead of
 * threading a recovery path through every lookup.
 *
 * Stating it as an assertion rather than a non-null assertion (`!`) keeps the
 * types honest without a cast, and turns a violated assumption into one
 * legible error naming the stage and reference at fault — rather than a
 * `TypeError` deep inside a draw, or a session that silently generated
 * nothing.
 */
export function invariant(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`Cannot generate a synthetic interview: ${message}`);
  }
}
