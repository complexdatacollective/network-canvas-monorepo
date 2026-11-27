import type { VariableType } from './variables/types.ts';

// The names text gives the values it shows, and what each stands for. A leaf
// module, imported by `dynamic-values.ts` (which re-exports everything here)
// and by the readers of text that must not depend on the codebook's schema
// (`localization/contentDocument.ts`).

/**
 * Values the interview itself knows, rather than an attribute of someone in
 * it. Only today's date, for text that anchors a question in time ("since
 * {today}"). Identifiers and protocol metadata (the interview's ID or case
 * ID, its start time, the protocol's name or hash, the stage's ID) are left
 * out on purpose: a participant has no use for them. `optional` marks a value
 * a host may not supply, which then shows nothing.
 */
export const INTRINSIC_DYNAMIC_VALUES = {
  now: { type: 'datetime', optional: false },
} as const satisfies Record<string, { type: VariableType; optional: boolean }>;

export type IntrinsicDynamicValue = keyof typeof INTRINSIC_DYNAMIC_VALUES;

const isIntrinsic = (path: string): path is IntrinsicDynamicValue =>
  Object.hasOwn(INTRINSIC_DYNAMIC_VALUES, path);

/**
 * Whose value it is: the participant (`ego`), the one entity a form or
 * interface is on (`node`, `edge`), the two nodes a Dyad Census asks about
 * (`dyadSource`, `dyadTarget`), the focal node of a one-to-many census, or
 * the two nodes an edge form's edge joins (`edgeFrom`, `edgeTo`).
 */
export type DynamicValueRole =
  | 'ego'
  | 'node'
  | 'edge'
  | 'dyadSource'
  | 'dyadTarget'
  | 'focal'
  | 'edgeFrom'
  | 'edgeTo';

/** Every role, by the name text writes it with. */
export const DYNAMIC_VALUE_ROLES: readonly DynamicValueRole[] = [
  'ego',
  'node',
  'edge',
  'dyadSource',
  'dyadTarget',
  'focal',
  'edgeFrom',
  'edgeTo',
];

const isDynamicValueRole = (value: string): value is DynamicValueRole =>
  DYNAMIC_VALUE_ROLES.some((role) => role === value);

/**
 * The roles that are a node, and so have the label the interview shows on
 * it (see `dynamicValueNameFor`).
 */
export type LabelledDynamicValueRole = Exclude<
  DynamicValueRole,
  'ego' | 'edge'
>;

/**
 * The roles whose attributes text can name. An edge's two ends can be nodes
 * of any type, so no codebook says which attributes they have: text names
 * them only by their label.
 */
export type AttributeDynamicValueRole = Exclude<
  DynamicValueRole,
  'edgeFrom' | 'edgeTo'
>;

export const isLabelledDynamicValueRole = (
  role: DynamicValueRole,
): role is LabelledDynamicValueRole => role !== 'ego' && role !== 'edge';

export const isAttributeDynamicValueRole = (
  role: DynamicValueRole,
): role is AttributeDynamicValueRole =>
  role !== 'edgeFrom' && role !== 'edgeTo';

/**
 * The case keys of a yes/no value: a yes/no attribute, a condition, and
 * whether a node is the participant. Text reads `other` for whichever it
 * gives no version.
 */
export const TRUE_CASE = 'true';
export const FALSE_CASE = 'false';

export const BOOLEAN_CASES: readonly string[] = [TRUE_CASE, FALSE_CASE];

// Words after a role that name something other than an attribute. Variable
// ids are UUIDs, so no attribute is called either.
const LABEL_WORD = 'label';
const PARTICIPANT_WORD = 'isParticipant';
const CONDITION_WORD = 'condition';
// The word that opens the name of a dynamic attribute, which is no role.
const DYNAMIC_ATTRIBUTE_WORD = 'dynamic';

// A UUID as a name writes it, with underscores for its hyphens.
const UUID_AS_NAME =
  /^[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$/i;

/**
 * An id as text writes it. A message's argument names and select keys cannot
 * contain `-`, so a UUID's hyphens are written as underscores. No UUID
 * contains an underscore, so the change can always be undone (`idFromName`).
 */
const idAsName = (id: string): string => id.replaceAll('-', '_');

/**
 * The id a name's part stands for: the UUID it spells with underscores for
 * hyphens, or undefined when it spells none. Schema 9 keys every attribute,
 * option and condition by a UUID, so a part that is anything else names
 * nothing (`ego_first_name`, `ego_now`, `ego_toString`).
 */
const idFromName = (part: string): string | undefined =>
  UUID_AS_NAME.test(part) ? part.replaceAll('_', '-') : undefined;

/**
 * The select case key that chooses an option of a categorical or ordinal
 * attribute: its id, written as a name (see `idAsName`). Answers are stored
 * by the option's value, which need not be a name; the id always is.
 */
export const optionCaseKey = (optionId: string): string => idAsName(optionId);

/**
 * The option id a case key names (the inverse of `optionCaseKey`), or
 * undefined for a key that names no option (`true`, `false`).
 */
export const optionIdFromCaseKey = (key: string): string | undefined =>
  idFromName(key);

/**
 * What one name in a message stands for:
 * - `intrinsic`, a value the interview knows (`now`);
 * - `label`, the label the interview shows on a node (`node_label`);
 * - `participant`, whether the node a form describes is the participant
 *   (`node_isParticipant`);
 * - `condition`, whether one of the conditions declared beside the text is
 *   met (`condition_<id>`);
 * - `dynamicAttribute`, one of the dynamic attributes declared beside the
 *   text, which shows a wording that its logic chooses (`dynamic_<id>`, see
 *   `dynamic-attributes.ts`);
 * - `attribute`, an attribute of someone on screen (`ego_<variable id>`).
 */
export type ParsedDynamicValuePath =
  | Readonly<{ kind: 'intrinsic'; name: IntrinsicDynamicValue }>
  | Readonly<{ kind: 'label'; role: LabelledDynamicValueRole }>
  | Readonly<{ kind: 'participant'; role: 'node' }>
  | Readonly<{ kind: 'condition'; conditionId: string }>
  | Readonly<{ kind: 'dynamicAttribute'; id: string }>
  | Readonly<{
      kind: 'attribute';
      role: AttributeDynamicValueRole;
      variableId: string;
    }>;

/** The name of a value, as `dynamicValueNameFor` describes it. */
const nameOf = (value: ParsedDynamicValuePath): string => {
  switch (value.kind) {
    case 'intrinsic':
      return value.name;
    case 'label':
      return `${value.role}_${LABEL_WORD}`;
    case 'participant':
      return `${value.role}_${PARTICIPANT_WORD}`;
    case 'condition':
      return `${CONDITION_WORD}_${idAsName(value.conditionId)}`;
    case 'dynamicAttribute':
      return `${DYNAMIC_ATTRIBUTE_WORD}_${idAsName(value.id)}`;
    case 'attribute':
    default:
      return `${value.role}_${idAsName(value.variableId)}`;
  }
};

declare const DYNAMIC_VALUE_NAME: unique symbol;

/**
 * The name that text uses for a value, as `dynamicValueNameFor` writes it:
 * a string that only that function makes, so that a name built by hand
 * (`'dynamic_' + id`) cannot be passed where a value's name is asked for.
 * A name read from a message is a plain string until
 * `parseDynamicValueName` says what it stands for.
 */
export type DynamicValueName = string & {
  readonly [DYNAMIC_VALUE_NAME]: true;
};

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the one place a name is made: every caller below writes it by the grammar that `parseDynamicValueName` reads
const asDynamicValueName = (name: string) => name as DynamicValueName;

/**
 * The name text uses for a value. Attributes and conditions are named by
 * their ids, so renaming an attribute changes no message, and each id is
 * prefixed by whose it is: the two nodes of a pair are often of one type, so
 * one attribute can be shown for each.
 * - an attribute: `<role>_<variable id>`, as `ego_3377af3f_3c79_…`;
 * - a node's label: `<role>_label`, as `dyadSource_label`;
 * - whether the node is the participant: `node_isParticipant`;
 * - a condition: `condition_<condition id>`;
 * - a dynamic attribute: `dynamic_<dynamic attribute id>`;
 * - today's date: `now`.
 */
export const dynamicValueNameFor = (
  value: ParsedDynamicValuePath,
): DynamicValueName => asDynamicValueName(nameOf(value));

/**
 * What a name in a message stands for (see `dynamicValueNameFor`), or
 * undefined when it stands for nothing text can show.
 */
export const parseDynamicValueName = (
  name: string,
): ParsedDynamicValuePath | undefined => {
  if (isIntrinsic(name)) return { kind: 'intrinsic', name };
  const separator = name.indexOf('_');
  if (separator <= 0) return undefined;
  const head = name.slice(0, separator);
  const rest = name.slice(separator + 1);
  if (rest === '') return undefined;
  if (head === CONDITION_WORD) {
    const conditionId = idFromName(rest);
    return conditionId === undefined
      ? undefined
      : { kind: 'condition', conditionId };
  }
  if (head === DYNAMIC_ATTRIBUTE_WORD) {
    const id = idFromName(rest);
    return id === undefined ? undefined : { kind: 'dynamicAttribute', id };
  }
  if (!isDynamicValueRole(head)) return undefined;
  if (rest === LABEL_WORD) {
    return isLabelledDynamicValueRole(head)
      ? { kind: 'label', role: head }
      : undefined;
  }
  if (rest === PARTICIPANT_WORD) {
    return head === 'node' ? { kind: 'participant', role: head } : undefined;
  }
  const variableId = idFromName(rest);
  return isAttributeDynamicValueRole(head) && variableId !== undefined
    ? { kind: 'attribute', role: head, variableId }
    : undefined;
};
