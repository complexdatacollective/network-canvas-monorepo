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
 * introduction and a roster's panel title, which are prose about the task
 * rather than about the type.
 */
export const SUBJECT_INDEPENDENT_FIELDS: readonly string[] = Object.freeze([
  'id',
  'type',
  'label',
  'interviewScript',
  'introductionPanel',
  'panelTitle',
  'subject',
  // The words a canvas shows its participant: its name box and tooltips, and
  // the headings of its panels. Prose about the canvas, which a subject change
  // keeps, the same as the task's introduction.
  'addNamePlaceholder',
  'overtakenEditNotice',
  'groupsHeading',
  'attributesHeading',
  'linksHeading',
  'tooltips',
  'keyHeading',
  'conditionText',
]);

/**
 * Prose a stage keeps INSIDE a key that otherwise describes the subject, by
 * that key: the Family Pedigree's name question sits beside the attributes
 * its `nodeConfiguration` binds. It is about the task, like the keys above,
 * so a subject change keeps it while the attributes around it go.
 */
export const SUBJECT_INDEPENDENT_PARTS: Readonly<
  Record<string, readonly string[]>
> = Object.freeze({ nodeConfiguration: ['nameField'] });

const isRecord = (value: unknown): value is Record<string, FieldValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The subject-independent parts `held` has under `key`, if any. */
const keptPartsOf = (
  key: string,
  held: unknown,
): Record<string, FieldValue> | undefined => {
  const parts = SUBJECT_INDEPENDENT_PARTS[key];
  if (parts === undefined || !isRecord(held)) return undefined;
  const kept = Object.fromEntries(
    parts.flatMap((part) =>
      held[part] === undefined ? [] : [[part, held[part]]],
    ),
  );
  return Object.keys(kept).length === 0 ? undefined : kept;
};

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
 * Every key a subject change invalidates, from all four places one can be
 * hiding.
 *
 * The form's own values cover what is on screen. The committed draft covers a
 * section the researcher has never opened — a collapsed capability contributes
 * nothing to the form's values while still holding configuration that belongs
 * to the old subject. The form's PARKED values cover a key that is in neither:
 * a control the researcher answered in this session and that has since
 * unmounted is not a registered field any more and was never committed, and
 * the submission replays it on purpose. The template covers a key none of them
 * has yet, which the interface nevertheless expects a stage of this type to
 * carry.
 *
 * The caller supplies the first three; see `useResetStageOnSubjectChange`,
 * which is where a parked path is reduced to the stage key it belongs to.
 * `heldAt` reads what the stage holds at a key, so that the parts of it a
 * subject change keeps (`SUBJECT_INDEPENDENT_PARTS`) are carried into its
 * reset value.
 */
export function subjectDependentResets(
  presentKeys: Iterable<string>,
  template: Readonly<Record<string, FieldValue>>,
  heldAt: (key: string) => unknown = () => undefined,
): SubjectReset[] {
  const keys = new Set<string>([...presentKeys, ...Object.keys(template)]);
  return [...keys]
    .filter((key) => !SUBJECT_INDEPENDENT_FIELDS.includes(key))
    .toSorted()
    .map((key) => {
      const kept = keptPartsOf(key, heldAt(key));
      if (kept === undefined) return { key, value: template[key] };
      const fallback = template[key];
      return {
        key,
        value: { ...(isRecord(fallback) ? fallback : {}), ...kept },
      };
    });
}

/**
 * The paths a subject change would lose under `key`: the key itself, or,
 * where it holds subject-independent parts (`SUBJECT_INDEPENDENT_PARTS`),
 * each of its other parts.
 */
export function subjectDependentPaths(key: string, held: unknown): string[] {
  const parts = SUBJECT_INDEPENDENT_PARTS[key];
  if (parts === undefined) return [key];
  if (!isRecord(held)) return [];
  return Object.keys(held)
    .filter((part) => !parts.includes(part))
    .map((part) => `${key}.${part}`);
}
