/**
 * `generateNetwork` runs on unvalidated, possibly in-progress protocol state —
 * Architect's live preview feeds it a draft protocol as it is being edited, and
 * the package's own tests construct stages via `as unknown as Stage` — so a
 * stage's `subject` can be absent, or carry the wrong `entity`, even though the
 * schema types mark it required. Every subject-bearing handler re-derives the
 * subject type at runtime instead of trusting the static type, and skips
 * (returns `undefined`, never throws) on a mismatch or missing subject.
 */
export function getSubjectType(
  subject: { entity?: string; type?: string } | undefined,
  entity: 'node' | 'edge',
): string | undefined {
  if (subject?.entity !== entity || typeof subject.type !== 'string') {
    return undefined;
  }
  return subject.type;
}
