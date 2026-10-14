import {
  CASED_VARIABLE_TYPES,
  DYNAMIC_VALUE_NAME,
  type DynamicValueBinding,
  type DynamicValueRole,
  type DynamicValues,
  type DynamicValueSiteContext,
  dynamicValueNamesIn,
  dynamicValuePathFor,
  dynamicValueStatus,
  INTRINSIC_DYNAMIC_VALUES,
  type IntrinsicDynamicValue,
  type MessageNode,
  MISSING_CASE,
  messageStructure,
} from '@codaco/protocol-validation';

/**
 * Something a piece of stage text can show at one place: a value the
 * interview knows, or an attribute of someone on screen there. What Architect
 * offers to insert, built from the same availability rules the protocol is
 * validated against (`dynamicValueStatus`).
 */
export type DynamicValueChoice = Readonly<{
  path: string;
  /** The role whose attribute it is, or undefined for an interview value. */
  role: DynamicValueRole | undefined;
  /** The attribute's name, or the interview value's key. */
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
   * boolean attribute, each with the case key a new binding would give it.
   */
  options: readonly DynamicValueOption[];
}>;

export type DynamicValueOption = Readonly<{
  /** The stored option value. */
  value: string | number | boolean;
  /** The option's label as the codebook holds it, if it has one. */
  label: unknown;
}>;

const INTRINSIC_NAMES: Readonly<Record<IntrinsicDynamicValue, string>> = {
  now: 'today',
};

const ROLE_PREFIXES: Readonly<Record<DynamicValueRole, string>> = {
  ego: '',
  node: '',
  edge: '',
  dyadSource: 'first',
  dyadTarget: 'second',
  focal: 'focal',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOptionValue = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

const optionsOf = (variable: Record<string, unknown>): DynamicValueOption[] => {
  if (!CASED_VARIABLE_TYPES.has(variable.type as never)) return [];
  const options = Array.isArray(variable.options) ? variable.options : [];
  const listed = options.flatMap((option: unknown) =>
    isRecord(option) && isOptionValue(option.value)
      ? [{ value: option.value, label: option.label }]
      : [],
  );
  // A boolean with no labels of its own is answered yes or no.
  if (listed.length === 0 && variable.type === 'boolean') {
    return [
      { value: true, label: undefined },
      { value: false, label: undefined },
    ];
  }
  return listed;
};

/**
 * Everything text at this place can show: the interview's own values, then
 * each available role's attributes in codebook order.
 */
export const dynamicValueChoices = (
  context: DynamicValueSiteContext,
): DynamicValueChoice[] => {
  const intrinsics = (
    Object.keys(INTRINSIC_DYNAMIC_VALUES) as IntrinsicDynamicValue[]
  ).map((name): DynamicValueChoice => ({
    path: name,
    role: undefined,
    variableId: name,
    variableName: undefined,
    variableType: INTRINSIC_DYNAMIC_VALUES[name].type,
    optional: INTRINSIC_DYNAMIC_VALUES[name].optional,
    numeric: false,
    options: [],
  }));
  const attributes = [...context.roles].flatMap((role) =>
    Object.entries(context.variablesFor(role) ?? {}).flatMap(
      ([variableId, variable]): DynamicValueChoice[] => {
        const path = dynamicValuePathFor(role, variableId);
        if (dynamicValueStatus({ path }, context).status !== 'available') {
          return [];
        }
        const full: Record<string, unknown> = isRecord(variable)
          ? variable
          : {};
        return [
          {
            path,
            role,
            variableId,
            variableName:
              typeof full.name === 'string' && full.name.trim() !== ''
                ? full.name
                : undefined,
            variableType: variable.type,
            optional: true,
            numeric: variable.type === 'number' || variable.type === 'scalar',
            options: optionsOf(full),
          },
        ];
      },
    ),
  );
  return [...intrinsics, ...attributes];
};

/** Words of `text` as an argument name: ASCII letters and digits, camel-cased. */
const identifierFrom = (text: string): string => {
  const words = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word !== '');
  const joined = words
    .map((word, index) =>
      index === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join('');
  return /^[A-Za-z]/.test(joined) ? joined : '';
};

const unique = (base: string, taken: (name: string) => boolean): string => {
  if (!taken(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}${suffix}`;
    if (!taken(candidate)) return candidate;
  }
};

/**
 * The argument name a new binding for `choice` gets: the attribute's name as
 * an identifier, so a translator reads `{partnerName}`, prefixed for the
 * second and first person of a pair and the person being asked about, and
 * numbered when the stage already uses the name.
 */
const nameFor = (
  choice: DynamicValueChoice,
  taken: (name: string) => boolean,
): string => {
  if (choice.role === undefined) {
    return unique(
      INTRINSIC_NAMES[choice.variableId as IntrinsicDynamicValue],
      taken,
    );
  }
  const own =
    identifierFrom(choice.variableName ?? '') ||
    identifierFrom(choice.variableId) ||
    'value';
  const prefix = ROLE_PREFIXES[choice.role];
  const base =
    prefix === '' ? own : prefix + own.charAt(0).toUpperCase() + own.slice(1);
  return unique(base, taken);
};

const isCaseKey = (key: string) =>
  DYNAMIC_VALUE_NAME.test(key) && key !== MISSING_CASE && key !== 'other';

/**
 * The cases a binding names each of `options` by, added to the cases it
 * already records (`recorded`), whose names they do not take.
 */
const casesFor = (
  options: readonly DynamicValueOption[],
  labelText: (label: unknown) => string,
  recorded: Readonly<Record<string, string | number | boolean>> = {},
): Record<string, string | number | boolean> => {
  const cases: Record<string, string | number | boolean> = { ...recorded };
  options.forEach((option, index) => {
    const fromValue =
      typeof option.value === 'boolean'
        ? option.value
          ? 'yes'
          : 'no'
        : identifierFrom(String(option.value));
    const base = [fromValue, identifierFrom(labelText(option.label))].find(
      isCaseKey,
    );
    const key = unique(
      base ?? `option${index + 1}`,
      (candidate) => !isCaseKey(candidate) || Object.hasOwn(cases, candidate),
    );
    cases[key] = option.value;
  });
  return cases;
};

/**
 * The stage's binding for `choice`: one that already shows the same value
 * (preferring one that names all its answers), or a new one. A value with
 * answers keeps the name the stage binds it under however many of its
 * answers that binding records cases for (a save keeps only the cases text
 * uses), offered with a case for each answer it lacks, which a by-answer
 * insertion adds to it.
 */
export const bindingFor = (
  choice: DynamicValueChoice,
  bindings: DynamicValues,
  pending: DynamicValues,
  labelText: (label: unknown) => string,
): Readonly<{ name: string; binding: DynamicValueBinding }> => {
  const covers = (binding: DynamicValueBinding) => {
    const values = Object.values(binding.cases ?? {});
    return choice.options.every((option) => values.includes(option.value));
  };
  for (const source of [bindings, pending]) {
    for (const [name, binding] of Object.entries(source)) {
      if (binding.path === choice.path && covers(binding)) {
        return { name, binding };
      }
    }
  }
  for (const [name, binding] of Object.entries(bindings)) {
    if (binding.path !== choice.path) continue;
    const recorded = Object.values(binding.cases ?? {});
    const lacking = choice.options.filter(
      (option) => !recorded.includes(option.value),
    );
    return {
      name,
      binding: {
        path: choice.path,
        cases: casesFor(lacking, labelText, binding.cases),
      },
    };
  }
  const name = nameFor(
    choice,
    (candidate) =>
      Object.hasOwn(bindings, candidate) || Object.hasOwn(pending, candidate),
  );
  return {
    name,
    binding:
      choice.options.length === 0
        ? { path: choice.path }
        : { path: choice.path, cases: casesFor(choice.options, labelText) },
  };
};

/** Whether `nodes` show a version for one of `cases` of the value `name`. */
const selectsOnCases = (
  nodes: readonly MessageNode[],
  name: string,
  cases: Readonly<Record<string, unknown>>,
): boolean =>
  nodes.some(
    (node) =>
      node.kind === 'switch' &&
      ((node.argument === name &&
        node.type === 'select' &&
        node.versions.some((version) => Object.hasOwn(cases, version.key))) ||
        node.versions.some((version) =>
          selectsOnCases(version.nodes, name, cases),
        )),
  );

/**
 * What an edit that leaves the text as `nodes` records for the value `name`,
 * offered as `offered`, when the stage binds it as `existing`; undefined when
 * the stage's binding stays as it is. Cases are recorded only once the text
 * shows a version for one of them: a value only ever shown as itself is
 * bound without cases, so a later change to its attribute's options leaves
 * no stale case behind for a researcher who never wrote one.
 */
export const bindingRecordedFor = (
  name: string,
  offered: DynamicValueBinding,
  existing: DynamicValueBinding | undefined,
  nodes: readonly MessageNode[],
): DynamicValueBinding | undefined => {
  if (offered.cases === undefined) {
    return existing === undefined ? offered : undefined;
  }
  if (existing === undefined) {
    return selectsOnCases(nodes, name, offered.cases)
      ? offered
      : { path: offered.path };
  }
  // Only a version for a case the stage does not record yet changes it.
  const added = Object.fromEntries(
    Object.entries(offered.cases).filter(
      ([key]) => !Object.hasOwn(existing.cases ?? {}, key),
    ),
  );
  return selectsOnCases(nodes, name, added) ? offered : undefined;
};

/**
 * Every value name the text in `value` uses, anywhere in it: what keeps a
 * binding needed. Over-counting is safe; a binding is only ever dropped when
 * no text names it.
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

/**
 * The versions the text in `value` shows for each value it selects on, by
 * the value's name: what keeps a binding's cases needed. A value named in a
 * message this cannot read keeps all of its cases (`'all'`): over-counting is
 * safe, and a case is only ever dropped when no text shows a version for it.
 */
export const dynamicValueCasesUsedIn = (
  value: unknown,
  cases: Map<string, Set<string> | 'all'> = new Map(),
): Map<string, Set<string> | 'all'> => {
  const visit = (nodes: readonly MessageNode[]) => {
    for (const node of nodes) {
      if (node.kind !== 'switch') continue;
      if (node.type === 'select') {
        const keys = cases.get(node.argument) ?? new Set<string>();
        if (keys !== 'all') {
          for (const version of node.versions) keys.add(version.key);
          cases.set(node.argument, keys);
        }
      }
      for (const version of node.versions) visit(version.nodes);
    }
  };
  if (typeof value === 'string') {
    if (value.includes('{')) {
      const structure = messageStructure(value);
      if ('nodes' in structure) visit(structure.nodes);
      else {
        for (const name of dynamicValueNamesIn(value)) cases.set(name, 'all');
      }
    }
  } else if (Array.isArray(value)) {
    for (const item of value) dynamicValueCasesUsedIn(item, cases);
  } else if (isRecord(value)) {
    for (const item of Object.values(value)) {
      dynamicValueCasesUsedIn(item, cases);
    }
  }
  return cases;
};
