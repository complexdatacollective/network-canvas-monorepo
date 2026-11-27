import {
  type DynamicValueArgument,
  type DynamicValueArguments,
  dynamicValueCaseKeysIn,
  dynamicValueNamesIn,
  MISSING_CASE,
} from '../../localization/dynamicValueMessages.ts';
import { logicValueNames } from '../../localization/logic.ts';
import {
  type MessageNode,
  messageStructure,
  printMessageStructure,
} from '../../localization/messageStructure.ts';
import type { StageSubject } from './common/subjects.ts';
import {
  type DynamicAttribute,
  logicOfDynamicAttribute,
} from './dynamic-attributes.ts';
import {
  BOOLEAN_CASES,
  type DynamicValueRole,
  INTRINSIC_DYNAMIC_VALUES,
  optionCaseKey,
  type ParsedDynamicValuePath,
  parseDynamicValueName,
  TRUE_CASE,
  FALSE_CASE,
} from './dynamic-value-names.ts';
import { placesByTapping } from './stage-wording/bins.ts';
import type { VariableType } from './variables/types.ts';
import { isSameOptionValue } from './variables/variable.ts';

/**
 * Where a participant-facing text that may show dynamic values sits, which
 * decides what it can show (see `dynamicValueRolesAt`):
 * - `stageText`, text about the stage as a whole (an introduction, a panel
 *   heading, an Information screen): the participant and the interview;
 * - `prompt`, a stage's question, shown while its interface is on one active
 *   entity where it has one (the pair a Dyad Census asks about, the focal
 *   node of a one-to-many census, the node a Geospatial stage is placing,
 *   the node a bin stage in select mode is placing);
 * - `formField`, a form field's caption, shown while the form describes one
 *   entity: a node or edge form's fields, and the question a Categorical Bin
 *   asks about the node just put in its "other" bin;
 * - `nodeLabel`, the label a node type gives its nodes (the codebook's
 *   `dynamicLabel`), shown on every node of that type wherever the interview
 *   draws one: only that node, by its attributes and the label the interview
 *   would otherwise choose for it. It sits on no stage, so
 *   `nodeLabelValueContext` gives what it can show rather than
 *   `dynamicValueRolesAt`.
 *
 * Text at any site can also choose its wording by a condition: a set of
 * rules asked of what the text can show there (see `conditions.ts`).
 */
export type DynamicValueSite =
  | 'stageText'
  | 'prompt'
  | 'formField'
  | 'nodeLabel';

export {
  type AttributeDynamicValueRole,
  DYNAMIC_VALUE_ROLES,
  type DynamicValueName,
  type DynamicValueRole,
  dynamicValueNameFor,
  FALSE_CASE,
  INTRINSIC_DYNAMIC_VALUES,
  type IntrinsicDynamicValue,
  isAttributeDynamicValueRole,
  isLabelledDynamicValueRole,
  type LabelledDynamicValueRole,
  optionCaseKey,
  optionIdFromCaseKey,
  type ParsedDynamicValuePath,
  parseDynamicValueName,
  TRUE_CASE,
} from './dynamic-value-names.ts';

/** One name a message uses, with what it stands for and the cases it gives. */
export type DynamicValueReference = Readonly<{
  name: string;
  /** Undefined when the name stands for nothing text can show. */
  parsed: ParsedDynamicValuePath | undefined;
  /**
   * The case keys the message gives a version for in its selects on the
   * name, besides `missing` and `other`: option case keys, or `true` and
   * `false`.
   */
  caseKeys: readonly string[];
}>;

/**
 * Every name `message` uses, shown or chosen by, with what each stands for
 * and the case keys it gives. A message that does not parse uses none.
 */
export const dynamicValueReferencesIn = (
  message: string,
): readonly DynamicValueReference[] => {
  const caseKeys = dynamicValueCaseKeysIn(message);
  return dynamicValueNamesIn(message).map((name) => ({
    name,
    parsed: parseDynamicValueName(name),
    caseKeys: caseKeys.get(name) ?? [],
  }));
};

/**
 * `message` with names and case keys replaced: `name` gives the new name
 * for a name, and `caseKey` the new key for a case key of a select on a
 * name (given its name before any renaming); each leaves what it returns
 * undefined for as it is. A message that does not parse, or in which
 * nothing changes, is returned as it was.
 */
export const rewriteDynamicValueReferences = (
  message: string,
  {
    name: renameName,
    caseKey: renameCaseKey,
  }: {
    name?: (name: string) => string | undefined;
    caseKey?: (name: string, key: string) => string | undefined;
  },
): string => {
  if (!message.includes('{')) return message;
  const structure = messageStructure(message);
  if (!('nodes' in structure)) return message;
  let changed = false;
  const rewrite = (nodes: readonly MessageNode[]): MessageNode[] =>
    nodes.map((node): MessageNode => {
      if (node.kind === 'argument') {
        const renamed = renameName?.(node.name);
        if (renamed === undefined || renamed === node.name) return node;
        changed = true;
        return { kind: 'argument', name: renamed };
      }
      if (node.kind !== 'switch') return node;
      const renamed = renameName?.(node.argument) ?? node.argument;
      if (renamed !== node.argument) changed = true;
      return {
        ...node,
        argument: renamed,
        versions: node.versions.map((version) => {
          const key =
            node.type === 'select' &&
            version.key !== MISSING_CASE &&
            version.key !== 'other'
              ? (renameCaseKey?.(node.argument, version.key) ?? version.key)
              : version.key;
          if (key !== version.key) changed = true;
          return { key, nodes: rewrite(version.nodes) };
        }),
      };
    });
  const nodes = rewrite(structure.nodes);
  return changed ? printMessageStructure(nodes) : message;
};

/** Stages whose prompts are shown about two nodes at a time. */
const DYAD_STAGE_TYPES: ReadonlySet<string> = new Set([
  'DyadCensus',
  'TieStrengthCensus',
]);

/** Stages that can place one node at a time, in select mode. */
const BIN_STAGE_TYPES: ReadonlySet<string> = new Set([
  'CategoricalBin',
  'OrdinalBin',
]);

/**
 * What of a stage decides which values its text can show: its type and, for
 * a bin stage, its behaviours (raw protocol data, so read loosely).
 */
export type DynamicValueStage = Readonly<{
  type: string;
  behaviours?: unknown;
}>;

/**
 * Whether a bin stage places one node at a time: in select mode the node
 * being placed is active, and its prompt is shown about it.
 */
const placesOneNodeAtATime = (stage: DynamicValueStage): boolean =>
  BIN_STAGE_TYPES.has(stage.type) && placesByTapping(stage);

/**
 * What a form field's form describes: its entity, and whether that is the
 * stage's own subject. Only then can text name the entity's attributes: a
 * Network Composer edge type's form describes an edge type of its own, which
 * no stage text can name unambiguously.
 */
export type DynamicValueForm = Readonly<{
  entity: StageSubject['entity'];
  isStageSubject: boolean;
}>;

/**
 * The roles a site can show values of, from the stage it is on and where on
 * it it sits. This is the one table of what is available where: the
 * protocol's validation and Architect's palette both read it.
 *
 * Ego values are available everywhere, because every stage runs inside an
 * interview's network. A stage's prompts add the entities its interface is
 * on while the prompt shows: a Dyad Census's pair, a one-to-many census's
 * focal node, the node a Geospatial stage is placing. A form field adds the
 * entity its form describes, when that is the stage's own subject, and an
 * edge form adds the two nodes its edge joins, by label. An interface that
 * shows many nodes at once exposes none of theirs, except a bin stage in
 * select mode, whose prompt is shown about the one node it is placing.
 */
export const dynamicValueRolesAt = (
  stage: DynamicValueStage,
  site: DynamicValueSite,
  form: DynamicValueForm | undefined,
): ReadonlySet<DynamicValueRole> => {
  // A node's label is about that node alone, on whichever stage draws it.
  if (site === 'nodeLabel') return new Set<DynamicValueRole>(['node']);
  const roles = new Set<DynamicValueRole>(['ego']);
  if (site === 'prompt') {
    if (DYAD_STAGE_TYPES.has(stage.type)) {
      roles.add('dyadSource');
      roles.add('dyadTarget');
    }
    if (stage.type === 'OneToManyDyadCensus') roles.add('focal');
    if (stage.type === 'Geospatial') roles.add('node');
    if (placesOneNodeAtATime(stage)) roles.add('node');
  }
  if (site === 'formField' && form !== undefined) {
    if (form.entity === 'node' && form.isStageSubject) roles.add('node');
    if (form.entity === 'edge') {
      if (form.isStageSubject) roles.add('edge');
      roles.add('edgeFrom');
      roles.add('edgeTo');
    }
  }
  return roles;
};

/**
 * The roles at a site whose node may be the participant, so text there can
 * choose its wording by whether it is: the node a Family Pedigree's person
 * form describes, which is the participant when the panel is about them.
 */
export const dynamicValueParticipantRolesAt = (
  stage: DynamicValueStage,
  site: DynamicValueSite,
  form: DynamicValueForm | undefined,
): ReadonlySet<DynamicValueRole> =>
  new Set<DynamicValueRole>(
    stage.type === 'FamilyPedigree' &&
      site === 'formField' &&
      form?.entity === 'node' &&
      form.isStageSubject
      ? ['node']
      : [],
  );

/**
 * The roles a site can show that may have no entity on screen while its text
 * shows: a bin stage in select mode has no node to place once every node has
 * been placed. Even a node's label can then be missing, so text showing it
 * needs a version for when it is.
 */
export const dynamicValueAbsentRolesAt = (
  stage: DynamicValueStage,
  site: DynamicValueSite,
): ReadonlySet<DynamicValueRole> =>
  new Set<DynamicValueRole>(
    site === 'prompt' && placesOneNodeAtATime(stage) ? ['node'] : [],
  );

/** Variable types a dynamic value can be. */
export const DYNAMIC_VALUE_VARIABLE_TYPES: ReadonlySet<VariableType> =
  new Set<VariableType>([
    'text',
    'number',
    'scalar',
    'datetime',
    'boolean',
    'ordinal',
    'categorical',
  ]);

/** Variable types whose values text can choose a version by case. */
export const CASED_VARIABLE_TYPES: ReadonlySet<VariableType> =
  new Set<VariableType>(['boolean', 'ordinal', 'categorical']);

/** Variable types whose values text can choose a version by number. */
export const NUMERIC_VARIABLE_TYPES: ReadonlySet<VariableType> =
  new Set<VariableType>(['number', 'scalar']);

/** The facts about a variable that decide how a value of it can be used. */
export type DynamicValueVariable = Readonly<{
  type: VariableType;
  name?: string;
  encrypted?: boolean;
  options?: readonly Readonly<{
    id?: unknown;
    value: unknown;
    label?: unknown;
  }>[];
}>;

/**
 * Why text cannot show a value of `variable` as words, or undefined when it
 * can. Text shows an answer by its option's label, and a yes/no attribute
 * need not have any: a Toggle never does, and a Boolean question without
 * labels shows the standard Yes and No, which are in the interface's
 * language rather than the protocol's. Such an attribute needs a label for
 * yes and for no before text shows it, though text may choose its wording by
 * it, which shows no label.
 */
export const dynamicValueUnshowableReason = (
  variable: DynamicValueVariable,
): string | undefined => {
  if (variable.type !== 'boolean') return undefined;
  const labelled = (value: boolean) =>
    variable.options?.some(
      (option) => option.value === value && option.label !== undefined,
    ) ?? false;
  if (labelled(true) && labelled(false)) return undefined;
  const attribute =
    variable.name === undefined ? 'the yes/no attribute' : `"${variable.name}"`;
  return `${attribute} is a yes/no attribute without labels for both of its answers. Add a label for yes and for no to ${attribute}, or give the wording a different version for each answer.`;
};

/**
 * The case keys text can give a version for on a value: each option of a
 * categorical or ordinal attribute (`optionCaseKey` of its id), in codebook
 * order, and `true` and `false` for a yes/no attribute. An option without an
 * id is refused by the codebook's own check, and has no key here.
 */
const caseKeysOfVariable = (
  variable: DynamicValueVariable,
): readonly string[] => {
  if (variable.type === 'boolean') return BOOLEAN_CASES;
  if (!CASED_VARIABLE_TYPES.has(variable.type)) return [];
  return (variable.options ?? []).flatMap((option) =>
    typeof option.id === 'string' ? [optionCaseKey(option.id)] : [],
  );
};

/**
 * The case a present value chooses in a select that gives versions for
 * `givenKeys`, or undefined when it chooses none, and so reads `other`:
 * - a yes/no value (a yes/no attribute, a condition, whether a node is the
 *   participant) chooses `true` or `false`;
 * - an option of a categorical or ordinal attribute chooses its
 *   `optionCaseKey`. A categorical answer can hold several options at once:
 *   it chooses the first of them, in the codebook's order of the options,
 *   that the select gives a version for.
 *
 * `variable` is the attribute's codebook variable, and is not needed for a
 * yes/no value that is no attribute.
 */
export const dynamicValueCaseOf = (
  value: unknown,
  variable: Pick<DynamicValueVariable, 'options'> | undefined,
  givenKeys: Iterable<string>,
): string | undefined => {
  const given = new Set(givenKeys);
  if (typeof value === 'boolean') {
    const key = value ? TRUE_CASE : FALSE_CASE;
    return given.has(key) ? key : undefined;
  }
  const answers: readonly unknown[] = Array.isArray(value) ? value : [value];
  for (const option of variable?.options ?? []) {
    if (typeof option.id !== 'string') continue;
    const key = optionCaseKey(option.id);
    if (
      given.has(key) &&
      answers.some((answer) => isSameOptionValue(answer, option.value))
    ) {
      return key;
    }
  }
  return undefined;
};

/**
 * The cases text gives a value, as the message checker sees them: the keys
 * the text gives, and whether they cover every answer the value can have, in
 * which case its `other` version is never read. Or the first key the text
 * gives that is not one the value has.
 */
const givenCases = (
  allowed: readonly string[],
  caseKeys: readonly string[],
):
  | Readonly<{ cases: string[]; exhaustive: boolean }>
  | Readonly<{ wrong: string }> => {
  const given = new Set(caseKeys);
  const wrong = [...given].find((key) => !allowed.includes(key));
  if (wrong !== undefined) return { wrong };
  const cases = allowed.filter((key) => given.has(key));
  return {
    cases,
    exhaustive: allowed.length > 0 && cases.length === allowed.length,
  };
};

/**
 * A name in a message as one site sees it:
 * - `available`, with its argument for the message checker;
 * - `unavailable`, naming a value that site cannot show;
 * - `unknown`, naming nothing (no such attribute, condition or role), an
 *   attribute of a kind that cannot be shown, or giving a version for a case
 *   the value does not have.
 *
 * `problem` is the rest of a sentence whose subject is the string ("This
 * wording", "This label"). It names the value as a researcher knows it (by the
 * attribute's name, "today’s date", "a logic block"), and never by the name
 * the message uses for it, its id or a case key. A name that does not parse
 * is the only one quoted, because nothing else identifies it.
 */
export type DynamicValueStatus =
  | Readonly<{ status: 'available'; argument: DynamicValueArgument }>
  | Readonly<{ status: 'unavailable' | 'unknown'; problem: string }>;

export type DynamicValueSiteContext = Readonly<{
  roles: ReadonlySet<DynamicValueRole>;
  /**
   * The roles among `roles` that may have nothing on screen while the text
   * shows (`dynamicValueAbsentRolesAt`); absent, every role is on screen.
   */
  absentRoles?: ReadonlySet<DynamicValueRole>;
  /**
   * The roles among `roles` whose node may be the participant
   * (`dynamicValueParticipantRolesAt`); absent, none is.
   */
  participantRoles?: ReadonlySet<DynamicValueRole>;
  /**
   * Set for a node type's own label, which shows no value the interview
   * knows (today's date): it is drawn on many nodes at once, on every stage.
   * There, a node's label is the one the interview would otherwise choose.
   */
  nodeLabel?: boolean;
  /**
   * The conditions declared beside the text, by id, each with the role its
   * node and edge rules are asked of (absent for one that asks only about
   * the participant). Absent where none are declared.
   */
  conditions?: ReadonlyMap<
    string,
    Readonly<{ about?: DynamicValueRole | undefined }>
  >;
  /**
   * The dynamic attributes declared beside the text, by id (see
   * `dynamic-attributes.ts`). Absent where none are declared.
   */
  dynamicAttributes?: ReadonlyMap<string, DynamicAttribute>;
  /**
   * The variables of each role's entity, or undefined where the role names
   * no codebook entity (a node role on a stage with no node subject).
   */
  variablesFor: (
    role: DynamicValueRole,
  ) => Readonly<Record<string, DynamicValueVariable>> | undefined;
}>;

const ROLE_NAMES: Readonly<Record<DynamicValueRole, string>> = {
  ego: 'the participant',
  node: 'the node this stage is about',
  edge: 'the edge this stage is about',
  dyadSource: 'the first node of the pair',
  dyadTarget: 'the second node of the pair',
  focal: 'the node being asked about',
  edgeFrom: 'the first node of the edge',
  edgeTo: 'the second node of the edge',
};

/** A role as a researcher knows it, at a site. */
const roleName = (
  role: DynamicValueRole,
  context: DynamicValueSiteContext,
): string =>
  context.nodeLabel === true && role === 'node'
    ? 'the node that the label is on'
    : ROLE_NAMES[role];

/**
 * A variable of a role, read as an own property: Schema 9 keys every
 * variable by a UUID, and no name may find `Object.prototype`'s.
 */
const variableOf = (
  context: DynamicValueSiteContext,
  role: DynamicValueRole,
  variableId: string,
): DynamicValueVariable | undefined => {
  const variables = context.variablesFor(role);
  return variables !== undefined && Object.hasOwn(variables, variableId)
    ? variables[variableId]
    : undefined;
};

/**
 * What a researcher knows a value by: the attribute's name and whose it is,
 * the label of a node, whether the node is the participant, a logic block (a
 * condition), or today's date. An attribute that is not in the codebook is
 * "an attribute".
 */
const describeValue = (
  parsed: ParsedDynamicValuePath,
  context: DynamicValueSiteContext,
): string => {
  switch (parsed.kind) {
    case 'intrinsic':
      return 'today’s date';
    case 'label':
      return `the label of ${roleName(parsed.role, context)}`;
    case 'participant':
      return 'whether the node is the participant';
    case 'condition':
      return 'a logic block';
    case 'dynamicAttribute':
      return 'a dynamic attribute';
    case 'attribute':
    default: {
      const name = variableOf(context, parsed.role, parsed.variableId)?.name;
      return name === undefined
        ? `an attribute of ${roleName(parsed.role, context)}`
        : `the "${name}" attribute of ${roleName(parsed.role, context)}`;
    }
  }
};

const ANSWERS_ARE_NOT_CASES =
  'only a categorical, ordinal or yes/no attribute can have a different version for each answer';

/**
 * Why rules about `about` cannot choose a version where the wording does not
 * refer to it, as the end of "has a logic block …" or "has a dynamic
 * attribute …".
 */
const rulesAboutProblem = (
  about: DynamicValueRole,
  context: DynamicValueSiteContext,
): string =>
  `whose rules are about ${roleName(about, context)}, which this wording does not refer to`;

/**
 * How a researcher knows the case a wrong key stands for, as the end of
 * "chooses between versions by …, but one of its versions is …".
 */
const wrongCaseProblem = (
  description: string,
  wrong: string,
): Readonly<{ status: 'unknown'; problem: string }> => ({
  status: 'unknown',
  problem: `chooses between versions by ${description}, but one of its versions is ${wrong}`,
});

/**
 * How a name reads at a site (see `DynamicValueStatus`), given what it
 * stands for (`parseDynamicValueName`, undefined when nothing) and the case
 * keys the message gives a version for in its selects on it. `name` is the
 * name itself, quoted only in the problem of a name that does not parse.
 */
export const dynamicValueStatus = (
  parsed: ParsedDynamicValuePath | undefined,
  context: DynamicValueSiteContext,
  caseKeys: readonly string[] = [],
  name?: string,
): DynamicValueStatus => {
  if (parsed === undefined) {
    return {
      status: 'unknown',
      problem: `cannot use ${name === undefined ? 'a value' : `"${name}"`}: it does not refer to an attribute, a node’s label, a condition or today’s date`,
    };
  }
  const description = describeValue(parsed, context);
  // A value with no cases: a select on it gives versions only for when it
  // is missing and when it is not.
  const withoutCases = () => {
    const cases = givenCases([], caseKeys);
    return 'wrong' in cases
      ? {
          status: 'unknown' as const,
          problem: `chooses between versions by each value of ${description}, but ${ANSWERS_ARE_NOT_CASES}`,
        }
      : undefined;
  };
  if (parsed.kind === 'intrinsic') {
    if (context.nodeLabel === true) {
      return {
        status: 'unavailable',
        problem: `cannot use ${description}: a node’s label can show only what is known about that node`,
      };
    }
    const problem = withoutCases();
    if (problem !== undefined) return problem;
    return {
      status: 'available',
      argument: {
        description,
        cases: [],
        numeric: false,
        optional: INTRINSIC_DYNAMIC_VALUES[parsed.name].optional,
      },
    };
  }
  if (parsed.kind === 'condition') {
    const condition = context.conditions?.get(parsed.conditionId);
    if (condition === undefined) {
      return {
        status: 'unknown',
        problem: 'has a logic block whose rules no longer exist',
      };
    }
    if (condition.about !== undefined && !context.roles.has(condition.about)) {
      return {
        status: 'unavailable',
        problem: `has a logic block ${rulesAboutProblem(condition.about, context)}`,
      };
    }
    const cases = givenCases(BOOLEAN_CASES, caseKeys);
    if ('wrong' in cases) {
      return wrongCaseProblem(
        description,
        'neither for when its rules are met nor for when they are not',
      );
    }
    return {
      status: 'available',
      argument: {
        description,
        cases: cases.cases,
        numeric: false,
        optional: false,
        ...(cases.exhaustive && { exhaustive: true }),
        unshowable:
          'It chooses which version of the wording is shown. Give the wording a version for when its rules are met and a version for when they are not.',
      },
    };
  }
  if (parsed.kind === 'dynamicAttribute') {
    const definition = context.dynamicAttributes?.get(parsed.id);
    if (definition === undefined) {
      return {
        status: 'unknown',
        problem: 'refers to a dynamic attribute that no longer exists',
      };
    }
    if (caseKeys.length > 0) {
      return {
        status: 'unknown',
        problem: `chooses between versions by each value of ${description}, but ${ANSWERS_ARE_NOT_CASES}`,
      };
    }
    // The definition's own logic is read where the text is shown, so each
    // value it reads must be one that this text can read. A value that does
    // not exist, or an answer that it does not have, is a problem of the
    // definition, reported there (`findDynamicAttributeProblems`).
    for (const readName of logicValueNames(
      logicOfDynamicAttribute(definition),
    )) {
      const read = parseDynamicValueName(readName);
      const status = dynamicValueStatus(
        read,
        { ...context, dynamicAttributes: undefined },
        [],
        readName,
      );
      if (status.status === 'unavailable') {
        // The rules of a dynamic attribute are not a logic block.
        const about =
          read?.kind === 'condition'
            ? context.conditions?.get(read.conditionId)?.about
            : undefined;
        return {
          status: 'unavailable',
          problem:
            about === undefined
              ? `has a dynamic attribute that ${status.problem}`
              : `has a dynamic attribute ${rulesAboutProblem(about, context)}`,
        };
      }
    }
    return {
      status: 'available',
      argument: { description, cases: [], numeric: false, optional: false },
    };
  }
  if (!context.roles.has(parsed.role)) {
    return {
      status: 'unavailable',
      problem: `cannot use ${description}, because the wording does not refer to ${
        parsed.role === 'ego'
          ? 'the participant'
          : parsed.role === 'edge'
            ? 'that edge'
            : 'that node'
      }`,
    };
  }
  // A node on screen always shows a label, its type's name at least, but
  // there may be no node on screen.
  if (parsed.kind === 'label') {
    const problem = withoutCases();
    if (problem !== undefined) return problem;
    return {
      status: 'available',
      argument: {
        description,
        cases: [],
        numeric: false,
        optional: context.absentRoles?.has(parsed.role) ?? false,
      },
    };
  }
  if (parsed.kind === 'participant') {
    if (!(context.participantRoles?.has(parsed.role) ?? false)) {
      return {
        status: 'unavailable',
        problem: `cannot use ${description}, because this is known only in the questions of a Family Pedigree stage’s person form`,
      };
    }
    const cases = givenCases(BOOLEAN_CASES, caseKeys);
    if ('wrong' in cases) {
      return wrongCaseProblem(
        description,
        'neither for the participant nor for everyone else',
      );
    }
    return {
      status: 'available',
      argument: {
        description,
        cases: cases.cases,
        numeric: false,
        optional: false,
        ...(cases.exhaustive && { exhaustive: true }),
        unshowable:
          'It chooses which version of the wording is shown. Give the wording a version for the participant and a version for everyone else.',
      },
    };
  }
  const variable = variableOf(context, parsed.role, parsed.variableId);
  if (variable === undefined) {
    return {
      status: 'unknown',
      problem: 'refers to an attribute that no longer exists',
    };
  }
  if (variable.encrypted === true) {
    return {
      status: 'unknown',
      problem: `cannot use ${description}, because the attribute is encrypted`,
    };
  }
  if (!DYNAMIC_VALUE_VARIABLE_TYPES.has(variable.type)) {
    return {
      status: 'unknown',
      problem: `cannot use ${description}, because a ${variable.type} attribute cannot be shown as words`,
    };
  }
  const cases = givenCases(caseKeysOfVariable(variable), caseKeys);
  if ('wrong' in cases) {
    if (variable.type === 'boolean') {
      return wrongCaseProblem(description, 'neither for yes nor for no');
    }
    if (CASED_VARIABLE_TYPES.has(variable.type)) {
      return wrongCaseProblem(
        description,
        'for an option that no longer exists',
      );
    }
    return {
      status: 'unknown',
      problem: `chooses between versions by each answer of ${description}, but ${ANSWERS_ARE_NOT_CASES}`,
    };
  }
  const unshowable = dynamicValueUnshowableReason(variable);
  return {
    status: 'available',
    argument: {
      description,
      cases: cases.cases,
      numeric: NUMERIC_VARIABLE_TYPES.has(variable.type),
      optional: true,
      ...(cases.exhaustive && { exhaustive: true }),
      ...(variable.type === 'categorical' && { multiple: true }),
      ...(unshowable !== undefined && { unshowable }),
    },
  };
};

/**
 * The arguments `message` may use at a site: each name it uses that is
 * available there, with the cases it gives. A name that is not is left out,
 * and the message checker then reports it as a value that does not exist.
 */
export const dynamicValueArgumentsAt = (
  message: string,
  context: DynamicValueSiteContext,
): DynamicValueArguments =>
  Object.fromEntries(
    dynamicValueReferencesIn(message).flatMap(({ name, parsed, caseKeys }) => {
      const status = dynamicValueStatus(parsed, context, caseKeys, name);
      return status.status === 'available' ? [[name, status.argument]] : [];
    }),
  );
