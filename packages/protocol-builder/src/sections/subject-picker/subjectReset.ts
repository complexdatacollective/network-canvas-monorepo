import { isEqual } from 'es-toolkit';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';

/**
 * Everything a stage keeps when its subject changes.
 *
 * Every other key is configuration ABOUT the subject — prompts naming its
 * variables, panels filtering its type, forms listing its attributes — and
 * carrying any of it across to a different type leaves the stage referring to
 * variables that type does not have. The list is the one Architect has always
 * used, so a protocol edited in either tool loses and keeps the same things:
 * the stage's identity and name, the notes for the interviewer, and a
 * roster's panel title, which is prose about the task
 * rather than about the type. The words a stage shows participants
 * (`minNodesNotice`, `outsideAreasLabel`, a Family Pedigree's `wording` and
 * the rest) are prose the same way, and Network Canvas seeds them on every new
 * stage: a seeded message is not configuration, so choosing a type must not
 * ask to discard it.
 */
export const SUBJECT_INDEPENDENT_FIELDS: readonly string[] = Object.freeze([
  'id',
  'type',
  'label',
  'interviewScript',
  'panelTitle',
  'subject',
  'allAddedNotice',
  'maxNodesNotice',
  'minNodesNotice',
  'unnamedLabel',
  'addNamePlaceholder',
  'unplacedNodesNotice',
  'outsideAreasLabel',
  // The words a canvas shows its participant: the headings of its panels.
  // Prose about the canvas, which a subject change keeps, the same as a
  // roster's panel title.
  'groupsHeading',
  'attributesHeading',
  'linksHeading',
  'conditionText',
  'wording',
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

/** Whether `row` is about a type in `types`, by its own `type`. */
const isAboutOneOf = (row: unknown, types: readonly string[]): boolean =>
  isRecord(row) && typeof row.type === 'string' && types.includes(row.type);

/**
 * A stage's prompts once the node types in `removed` are no longer shown and
 * those in `added` are: the highlight entries and sort rules about a removed
 * type removed, each removed type taken out of a node type order, and each
 * added type put at the end of one, in the order given. An order must name
 * every type the stage shows, so one a prompt already has is completed rather
 * than left short. A list left empty goes, as does an order left naming one
 * type, because absence is how the schema spells "none".
 *
 * `undefined` when nothing in the prompts changes, so a caller writes nothing.
 */
export function fitPromptsToNodeTypes(
  prompts: unknown,
  removed: readonly string[],
  added: readonly string[] = [],
): Record<string, FieldValue>[] | undefined {
  if (!Array.isArray(prompts)) return undefined;
  const records = prompts.filter(isRecord);
  // A list holding anything but prompts is not one this can rewrite safely.
  if (records.length !== prompts.length) return undefined;
  let changed = false;
  const fitted = records.map((prompt) => {
    const next: Record<string, FieldValue> = { ...prompt };
    for (const key of ['highlight', 'sortOrder']) {
      const rows = prompt[key];
      if (!Array.isArray(rows)) continue;
      const kept = rows.filter((row) => !isAboutOneOf(row, removed));
      if (kept.length === rows.length) continue;
      changed = true;
      if (kept.length === 0) delete next[key];
      else next[key] = kept;
    }
    const order = prompt.nodeTypeOrder;
    if (Array.isArray(order)) {
      const kept = order.filter(
        (type) => typeof type !== 'string' || !removed.includes(type),
      );
      const fitOrder = [
        ...kept,
        ...added.filter((type) => !kept.includes(type)),
      ];
      if (!isEqual(fitOrder, order)) {
        changed = true;
        if (fitOrder.length <= 1) delete next.nodeTypeOrder;
        else next.nodeTypeOrder = fitOrder;
      }
    }
    return next;
  });
  return changed ? fitted : undefined;
}

/** Whether the prompts say anything about `type` that removing it would lose. */
export const promptsDescribeNodeType = (
  prompts: unknown,
  type: string,
): boolean => fitPromptsToNodeTypes(prompts, [type]) !== undefined;

/**
 * The prompts, by position from 1, that removing `type` would leave unable to
 * do their task: a highlight task that highlights only that type, and a
 * connect task whose edge type cannot join any pair of the `remaining` types.
 * Pruning cannot repair either, so the removal is refused until the
 * researcher changes those prompts.
 */
export function promptsNeedingNodeType(
  prompts: unknown,
  type: string,
  remaining: readonly string[],
  edgeTypeAllowsAnyPair: (
    edgeType: string,
    types: readonly string[],
  ) => boolean,
): Readonly<{ highlight: number[]; connect: number[] }> {
  const highlight: number[] = [];
  const connect: number[] = [];
  if (!Array.isArray(prompts)) return { highlight, connect };
  prompts.forEach((prompt: unknown, index) => {
    if (!isRecord(prompt)) return;
    const rows = prompt.highlight;
    if (
      prompt.task === 'highlight' &&
      Array.isArray(rows) &&
      rows.length > 0 &&
      rows.every((row) => isAboutOneOf(row, [type]))
    ) {
      highlight.push(index + 1);
    }
    const edges = prompt.edges;
    const create = isRecord(edges) ? edges.create : undefined;
    if (
      prompt.task === 'connect' &&
      typeof create === 'string' &&
      remaining.length > 0 &&
      !edgeTypeAllowsAnyPair(create, remaining)
    ) {
      connect.push(index + 1);
    }
  });
  return { highlight, connect };
}
