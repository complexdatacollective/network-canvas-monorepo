import { stageSchema } from '@codaco/protocol-validation';

/**
 * Whether a stage's edges come from something that actually creates them.
 *
 * A topology says how densely a stage links people, which decides nothing on a
 * stage that creates no edges — a Sociogram whose prompts only DISPLAY them, or
 * a NetworkComposer with no drawable edge types (spec, "Sociogram nuance"). Both
 * the stage editor's section and the read-only overview have to answer this,
 * and a screen that claimed a topology applied while the other hid it would be
 * two answers to one question; hence one home.
 *
 * The two shapes are the schema's own: prompt-driven stages name the edge type
 * on the prompt (`createEdge`, or `edges.create` on a Sociogram), and a stage
 * that draws edges itself lists the drawable types on the stage. Which of those
 * a stage type is, is asked of the SCHEMA rather than by naming stage types
 * here.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A stage as any surface holds it: a parsed stage, or a mid-edit draft. */
export type EdgeCreatingStage = Record<string, unknown>;

const promptCreatesEdge = (prompt: unknown): boolean => {
  if (!isRecord(prompt)) return false;
  if (typeof prompt.createEdge === 'string') return true;
  return isRecord(prompt.edges) && typeof prompt.edges.create === 'string';
};

/**
 * Whether this stage type's schema admits a stage-level key at all.
 *
 * Every stage schema is a `z.strictObject`, so a key the matched branch does
 * not declare comes back as an `unrecognized_keys` issue naming it — a precise,
 * schema-owned answer that survives a stage whose other fields are still
 * mid-edit.
 */
const stageAdmitsKey = (
  stage: EdgeCreatingStage,
  key: string,
  value: unknown,
): boolean => {
  const result = stageSchema.safeParse({ ...stage, [key]: value });
  if (result.success) return true;
  return !result.error.issues.some(
    (issue) =>
      issue.code === 'unrecognized_keys' &&
      'keys' in issue &&
      issue.path.length === 0 &&
      issue.keys.includes(key),
  );
};

export const stageCreatesEdges = (stage: EdgeCreatingStage): boolean => {
  if (Array.isArray(stage.prompts))
    return stage.prompts.some(promptCreatesEdge);

  // A stage that lists its drawable edge types on the stage itself draws
  // exactly those, and nothing where the list is empty. The empty list and the
  // absent one are the same stage: the editor's `prune` strips `edges: []` on
  // save, and the simulator walks `stage.edges ?? []` either way — so an
  // absent list on a stage type that HAS one must not read as "unknown, assume
  // yes".
  if (stageAdmitsKey(stage, 'edges', [])) {
    return Array.isArray(stage.edges) && stage.edges.length > 0;
  }

  // Neither shape: the stage is not prompt-gated at all, and says so.
  return true;
};
