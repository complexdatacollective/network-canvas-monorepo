import {
  CASED_VARIABLE_TYPES,
  type DynamicValueRole,
  type DynamicValueSiteContext,
  dynamicValueNameFor,
  dynamicValueNamesIn,
  dynamicValueStatus,
  dynamicValueUnshowableReason,
  FALSE_CASE,
  INTRINSIC_DYNAMIC_VALUES,
  type IntrinsicDynamicValue,
  isAttributeDynamicValueRole,
  isLabelledDynamicValueRole,
  optionCaseKey,
  type ParsedDynamicValuePath,
  TRUE_CASE,
} from '@codaco/protocol-validation';

/**
 * Something a piece of stage text can show at one place: a value the
 * interview knows, or an attribute or the label of a node or edge on screen
 * there. What Architect offers to insert, built from the same availability
 * rules the protocol is validated against (`dynamicValueStatus`).
 */
export type DynamicValueChoice = Readonly<{
  /**
   * The name the text uses for it (`dynamicValueNameFor`), such as
   * `ego_<variable id>`. A researcher never reads it: its pill is labelled
   * from the attribute's name.
   */
  name: string;
  /**
   * What it is: a value the interview knows, an attribute, the label the
   * interview shows on a node, or whether that node is the participant.
   */
  kind: 'intrinsic' | 'attribute' | 'label' | 'participant' | 'condition';
  /**
   * For a node type's own label, where "the label" is the one the interview
   * would otherwise have chosen for the node.
   */
  defaultLabel?: true;
  /**
   * For a node type's own label, an attribute of the node the label is on,
   * which the menu lists as that node's rather than as the context's.
   */
  ownNode?: true;
  /** The condition a condition value names. */
  condition?: Readonly<{ id: string }>;
  /** The role whose value it is, or undefined for an interview value. */
  role: DynamicValueRole | undefined;
  /** The attribute's id, or the interview value's key; empty for a label. */
  variableId: string;
  /** The codebook's name for the attribute; undefined for an interview value. */
  variableName: string | undefined;
  variableType: string;
  /** Whether it can be missing, so text shows it only when it is not. */
  optional: boolean;
  /** Whether text can choose a version by its number. */
  numeric: boolean;
  /**
   * The answers text can choose a version by, for a categorical, ordinal or
   * boolean attribute, each with the case key that chooses it.
   */
  options: readonly DynamicValueOption[];
  /**
   * Why text cannot show it as words, though it can choose wording by it, or
   * undefined when it can: a yes/no attribute shows its answers' labels, so
   * one without labels for both answers needs them first (`needsLabels`),
   * and an on/off switch, which never has any, cannot be shown (`switch`).
   */
  unshowable: 'needsLabels' | 'switch' | undefined;
}>;

export type DynamicValueOption = Readonly<{
  /**
   * The select case key that chooses this answer: the option's id written
   * as a name (`optionCaseKey`), or `true` and `false` for a yes/no value.
   */
  caseKey: string;
  /** The stored option value. */
  value: string | number | boolean;
  /** The option's label as the codebook holds it, if it has one. */
  label: unknown;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOptionValue = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

// `variable.type` is whatever a stored protocol holds, so ask the set as a set of
// anything: a value that is not a cased type is simply not in it.
const casedTypes: ReadonlySet<unknown> = CASED_VARIABLE_TYPES;

/**
 * The answers text can give a version for: a yes/no attribute's two, with
 * the labels its options give them, and each option of a categorical or
 * ordinal attribute that has an id, in codebook order.
 */
const optionsOf = (variable: Record<string, unknown>): DynamicValueOption[] => {
  if (!casedTypes.has(variable.type)) return [];
  const options: unknown[] = Array.isArray(variable.options)
    ? variable.options
    : [];
  if (variable.type === 'boolean') {
    const labelFor = (value: boolean): unknown => {
      const option = options.find(
        (each) => isRecord(each) && each.value === value,
      );
      return isRecord(option) ? option.label : undefined;
    };
    return [
      { caseKey: TRUE_CASE, value: true, label: labelFor(true) },
      { caseKey: FALSE_CASE, value: false, label: labelFor(false) },
    ];
  }
  return options.flatMap((option) =>
    isRecord(option) &&
    typeof option.id === 'string' &&
    isOptionValue(option.value)
      ? [
          {
            caseKey: optionCaseKey(option.id),
            value: option.value,
            label: option.label,
          },
        ]
      : [],
  );
};

/** The one case a yes/no value that is never shown is worded for. */
const FLAG_OPTIONS: readonly DynamicValueOption[] = [
  { caseKey: TRUE_CASE, value: true, label: undefined },
];

/**
 * Everything text at this place can show: for each available role its node's
 * label, where it is a node, and its attributes in codebook order, the roles
 * this place is about first and the participant's own after them, then the
 * interview's own values.
 */
export const dynamicValueChoices = (
  context: DynamicValueSiteContext,
): DynamicValueChoice[] => {
  const available = (parsed: ParsedDynamicValuePath) =>
    dynamicValueStatus(parsed, context);
  const intrinsics =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the keys of a const object are exactly IntrinsicDynamicValue, which is defined as keyof it
    (Object.keys(INTRINSIC_DYNAMIC_VALUES) as IntrinsicDynamicValue[])
      // A node type's own label shows none of them.
      .filter(
        (name) => available({ kind: 'intrinsic', name }).status === 'available',
      )
      .map((name): DynamicValueChoice => ({
        name: dynamicValueNameFor({ kind: 'intrinsic', name }),
        kind: 'intrinsic',
        role: undefined,
        variableId: name,
        variableName: undefined,
        variableType: INTRINSIC_DYNAMIC_VALUES[name].type,
        optional: INTRINSIC_DYNAMIC_VALUES[name].optional,
        numeric: false,
        options: [],
        unshowable: undefined,
      }));
  const labelOf = (role: DynamicValueRole): DynamicValueChoice[] => {
    if (!isLabelledDynamicValueRole(role)) return [];
    const parsed: ParsedDynamicValuePath = { kind: 'label', role };
    const status = available(parsed);
    if (status.status !== 'available') return [];
    return [
      {
        name: dynamicValueNameFor(parsed),
        kind: 'label',
        role,
        variableId: '',
        variableName: undefined,
        variableType: 'text',
        // Missing only where no node may be on screen.
        optional: status.argument.optional,
        numeric: false,
        options: [],
        unshowable: undefined,
        ...(context.nodeLabel !== undefined && {
          defaultLabel: true,
          ownNode: true,
        }),
      },
    ];
  };
  // The conditions declared beside the text: each true or false, and so
  // only ever worded for, as an "If".
  const conditions = [...(context.conditions ?? [])].flatMap(
    ([id, { about }]): DynamicValueChoice[] => {
      const parsed: ParsedDynamicValuePath = {
        kind: 'condition',
        conditionId: id,
      };
      if (available(parsed).status !== 'available') return [];
      return [
        {
          name: dynamicValueNameFor(parsed),
          kind: 'condition',
          condition: { id },
          role: about ?? 'ego',
          variableId: '',
          variableName: undefined,
          variableType: 'boolean',
          optional: false,
          numeric: false,
          options: FLAG_OPTIONS,
          unshowable: 'switch',
        },
      ];
    },
  );
  // Whether the node is the participant only chooses wording: a version for
  // the participant, and the other for everyone else.
  const participantOf = (role: DynamicValueRole): DynamicValueChoice[] => {
    if (role !== 'node') return [];
    const parsed: ParsedDynamicValuePath = { kind: 'participant', role };
    if (available(parsed).status !== 'available') return [];
    return [
      {
        name: dynamicValueNameFor(parsed),
        kind: 'participant',
        role,
        variableId: '',
        variableName: undefined,
        variableType: 'boolean',
        optional: false,
        numeric: false,
        options: FLAG_OPTIONS,
        unshowable: 'switch',
      },
    ];
  };
  const attributesOf = (role: DynamicValueRole): DynamicValueChoice[] =>
    isAttributeDynamicValueRole(role)
      ? Object.entries(context.variablesFor(role) ?? {}).flatMap(
          ([variableId, variable]): DynamicValueChoice[] => {
            const parsed: ParsedDynamicValuePath = {
              kind: 'attribute',
              role,
              variableId,
            };
            if (available(parsed).status !== 'available') return [];
            const full: Record<string, unknown> = isRecord(variable)
              ? variable
              : {};
            return [
              {
                name: dynamicValueNameFor(parsed),
                kind: 'attribute',
                role,
                variableId,
                variableName:
                  typeof full.name === 'string' && full.name.trim() !== ''
                    ? full.name
                    : undefined,
                variableType: variable.type,
                optional: true,
                numeric:
                  variable.type === 'number' || variable.type === 'scalar',
                options: optionsOf(full),
                unshowable:
                  dynamicValueUnshowableReason(variable) === undefined
                    ? undefined
                    : full.component === 'Toggle'
                      ? 'switch'
                      : 'needsLabels',
                ...(context.nodeLabel !== undefined && { ownNode: true }),
              },
            ];
          },
        )
      : [];
  const roles = [...context.roles];
  const attributes = [
    ...roles.filter((role) => role !== 'ego'),
    ...roles.filter((role) => role === 'ego'),
  ].flatMap((role) => [
    ...labelOf(role),
    ...participantOf(role),
    ...attributesOf(role),
  ]);
  return [...attributes, ...intrinsics, ...conditions];
};

/**
 * Whether `choice` is only ever true or false, and so only chooses between
 * two versions of the text and is never shown itself: whether a node is the
 * participant, or a condition declared beside the text.
 */
export const isFlagChoice = (choice: DynamicValueChoice): boolean =>
  choice.kind === 'participant' || choice.kind === 'condition';

/**
 * Every value name the text in `value` uses, anywhere in it: what keeps a
 * condition needed. Over-counting is safe; a condition is only ever dropped
 * when no text names it.
 */
export const dynamicValueNamesUsedIn = (
  value: unknown,
  names: Set<string> = new Set(),
): Set<string> => {
  if (typeof value === 'string') {
    if (value.includes('{')) {
      for (const name of dynamicValueNamesIn(value)) names.add(name);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) dynamicValueNamesUsedIn(item, names);
  } else if (isRecord(value)) {
    for (const item of Object.values(value)) {
      dynamicValueNamesUsedIn(item, names);
    }
  }
  return names;
};
