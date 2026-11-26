/**
 * `generateNetwork` runs on unvalidated, possibly in-progress protocol state —
 * Architect's live preview feeds it a draft protocol as it is being edited, and
 * the package's own tests construct stages via `as unknown as Stage` — so a
 * stage's `subject` can be absent, or carry the wrong `entity`, even though the
 * schema types mark it required. Every subject-bearing handler re-derives the
 * subject at runtime instead of trusting the static type, and skips
 * (returns `undefined`, never throws) on a mismatch or missing subject.
 */
const subjectOf = (stage: object): unknown =>
  'subject' in stage ? stage.subject : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The node types a stage's subject lists, or `undefined` when the stage has
 * no node subject or its `types` is missing, empty or not a list of strings.
 */
export function getStageNodeTypes(stage: object): string[] | undefined {
  const subject = subjectOf(stage);
  if (!isRecord(subject) || subject.entity !== 'node') return undefined;
  const { types } = subject;
  if (!Array.isArray(types) || types.length === 0) return undefined;
  const strings = types.filter(
    (type): type is string => typeof type === 'string',
  );
  return strings.length === types.length ? strings : undefined;
}

/** The stage's node type when its subject lists exactly one. */
export function getSingleStageNodeType(stage: object): string | undefined {
  const types = getStageNodeTypes(stage);
  return types?.length === 1 ? types[0] : undefined;
}

/** The edge type of a stage whose subject is an edge type. */
export function getEdgeSubjectType(stage: object): string | undefined {
  const subject = subjectOf(stage);
  if (
    !isRecord(subject) ||
    subject.entity !== 'edge' ||
    typeof subject.type !== 'string'
  ) {
    return undefined;
  }
  return subject.type;
}
