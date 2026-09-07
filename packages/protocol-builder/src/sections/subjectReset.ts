import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';

/**
 * Everything a stage keeps when its subject changes.
 *
 * Every other key is configuration ABOUT the subject — prompts naming its
 * variables, panels filtering its type, forms listing its attributes — and
 * carrying any of it across to a different type leaves the stage referring to
 * variables that type does not have. The list is the one Architect has always
 * used, so a protocol edited in either tool loses and keeps the same things:
 * the stage's identity and name, the notes for the interviewer, and the task
 * introduction, which is prose about the task rather than about the type.
 */
export const SUBJECT_INDEPENDENT_FIELDS: readonly string[] = Object.freeze([
  'id',
  'type',
  'label',
  'interviewScript',
  'introductionPanel',
  'subject',
]);

/**
 * What each subject-dependent key becomes: the interface's own default for it,
 * or nothing at all.
 *
 * `undefined` means the key is REMOVED rather than emptied. Absence is how the
 * protocol schema spells "this stage does not do this"; an empty object or an
 * empty list is a configured capability with its contents missing, and the
 * schema refuses those.
 */
export type SubjectReset = Readonly<{
  key: string;
  value: FieldValue | undefined;
}>;

/**
 * Every key a subject change invalidates, from all three places one can be
 * hiding.
 *
 * The form's own values cover what is on screen. The committed draft covers a
 * section the researcher has never opened — a collapsed capability contributes
 * nothing to the form's values while still holding configuration that belongs
 * to the old subject. The template covers a key neither of them has yet, which
 * the interface nevertheless expects a stage of this type to carry.
 */
export function subjectDependentResets(
  presentKeys: Iterable<string>,
  template: Readonly<Record<string, FieldValue>>,
): SubjectReset[] {
  const keys = new Set<string>([...presentKeys, ...Object.keys(template)]);
  return [...keys]
    .filter((key) => !SUBJECT_INDEPENDENT_FIELDS.includes(key))
    .toSorted()
    .map((key) => ({ key, value: template[key] }));
}
