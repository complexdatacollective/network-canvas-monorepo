import { z } from 'zod';

import {
  DYNAMIC_VALUE_NAME,
  type DynamicValueArgument,
  type DynamicValueArguments,
  MISSING_CASE,
} from '../../localization/dynamicValueMessages.ts';
import type { StageSubject } from './common/subjects.ts';
import type { VariableType } from './variables/types.ts';

const DYNAMIC_VALUE_PATH = 'dynamicValuePath' as const;

/**
 * Where a participant-facing text that may show dynamic values sits, which
 * decides what it can show (see `dynamicValueRolesAt`):
 * - `stageText`, text about the stage as a whole (an introduction, a panel
 *   heading, an Information screen): the participant and the interview;
 * - `prompt`, a stage's question, shown while its interface is on one active
 *   entity where it has one (the pair a Dyad Census asks about, the focal
 *   node of a one-to-many census, the node a Geospatial stage is placing);
 * - `formField`, a form field's caption, shown while the form describes one
 *   entity: a node or edge form's fields, and the question a Categorical Bin
 *   asks about the node just put in its "other" bin.
 */
export type DynamicValueSite = 'stageText' | 'prompt' | 'formField';

/**
 * Values the interview itself knows, rather than an attribute of someone in
 * it. Only today's date, for text that anchors a question in time ("since
 * {today}"). Identifiers and protocol metadata (the interview's ID or case
 * ID, its start time, the protocol's name or hash, the stage's ID) are left
 * out on purpose: a participant has no use for them. `optional` marks a value
 * a host may not supply, which text then needs a `missing` version for.
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

export const DYNAMIC_VALUE_ROLE_PREFIXES: Readonly<
  Record<DynamicValueRole, string>
> = {
  ego: 'ego.',
  node: 'node.',
  edge: 'edge.',
  dyadSource: 'dyad.source.',
  dyadTarget: 'dyad.target.',
  focal: 'one_to_many.focal.',
  edgeFrom: 'edge.from.',
  edgeTo: 'edge.to.',
};

/**
 * The roles that are a node, and so have the label the interview shows on
 * it (see `dynamicValueLabelPathFor`).
 */
export const LABELLED_DYNAMIC_VALUE_ROLES: ReadonlySet<DynamicValueRole> =
  new Set<DynamicValueRole>([
    'node',
    'dyadSource',
    'dyadTarget',
    'focal',
    'edgeFrom',
    'edgeTo',
  ]);

/**
 * The roles text can name only by their label. An edge's two ends can be
 * nodes of any type, so no codebook says which attributes they have.
 */
const LABEL_ONLY_ROLES: ReadonlySet<DynamicValueRole> =
  new Set<DynamicValueRole>(['edgeFrom', 'edgeTo']);

// Codebook ids are letters, digits and `._:-`, so no attribute is named this.
const LABEL_PATH_SEGMENT = '$label';

export type ParsedDynamicValuePath =
  | Readonly<{ kind: 'intrinsic'; name: IntrinsicDynamicValue }>
  | Readonly<{ kind: 'label'; role: DynamicValueRole }>
  | Readonly<{ kind: 'attribute'; role: DynamicValueRole; variableId: string }>;

const ROLE_PREFIX_ENTRIES = Object.entries(DYNAMIC_VALUE_ROLE_PREFIXES) as [
  DynamicValueRole,
  string,
][];

/** What a binding's `path` names, or undefined when it names nothing. */
export const parseDynamicValuePath = (
  path: string,
): ParsedDynamicValuePath | undefined => {
  if (isIntrinsic(path)) return { kind: 'intrinsic', name: path };
  for (const [role, prefix] of ROLE_PREFIX_ENTRIES) {
    if (
      LABELLED_DYNAMIC_VALUE_ROLES.has(role) &&
      path === `${prefix}${LABEL_PATH_SEGMENT}`
    ) {
      return { kind: 'label', role };
    }
  }
  for (const [role, prefix] of ROLE_PREFIX_ENTRIES) {
    if (LABEL_ONLY_ROLES.has(role)) continue;
    if (path.startsWith(prefix) && path.length > prefix.length) {
      return { kind: 'attribute', role, variableId: path.slice(prefix.length) };
    }
  }
  return undefined;
};

/** The `path` naming a role's attribute. */
export const dynamicValuePathFor = (
  role: DynamicValueRole,
  variableId: string,
): string => `${DYNAMIC_VALUE_ROLE_PREFIXES[role]}${variableId}`;

/**
 * The `path` naming a node role's label: the text the interview shows on that
 * node, chosen from its attributes by the same rules (a variable called
 * "name", then one whose name contains "name", then the first text answer)
 * and falling back to its type's name. It is never missing, and unlike any
 * one attribute it names the node however its type records names.
 */
export const dynamicValueLabelPathFor = (role: DynamicValueRole): string =>
  `${DYNAMIC_VALUE_ROLE_PREFIXES[role]}${LABEL_PATH_SEGMENT}`;

const DynamicValuePathSchema = z
  .string()
  .refine((path) => parseDynamicValuePath(path) !== undefined, {
    message: 'This does not name a value the interview can show.',
  })
  .meta({ [DYNAMIC_VALUE_PATH]: true });

/** Whether a schema node is a binding's `path` (for reference collection). */
export const isDynamicValuePathSchema = (schema: z.ZodType): boolean =>
  schema.meta()?.[DYNAMIC_VALUE_PATH] === true;

/**
 * Binds one argument name a stage's text may use to the value it stands for.
 * `cases` exists only for a categorical, ordinal or boolean value: it maps
 * each select case key the text may name to the stored option value it
 * stands for, because option values need not be names.
 *
 * A categorical answer can hold several options at once. A select then takes
 * the first case, in the order `cases` lists them, whose option the answer
 * includes, and `other` when it includes none: a researcher who wants one
 * option to win lists it first.
 */
export const DynamicValueBindingSchema = z.strictObject({
  path: DynamicValuePathSchema,
  cases: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
});

export type DynamicValueBinding = z.infer<typeof DynamicValueBindingSchema>;

/**
 * A stage's dynamic values, by the argument name its messages use. Names are
 * short identifiers so that a translator reads `{partnerName}`, and renaming
 * a variable changes no message.
 */
export const DynamicValuesSchema = z
  .record(z.string(), DynamicValueBindingSchema)
  .superRefine((bindings, ctx) => {
    for (const [name, binding] of Object.entries(bindings)) {
      if (!DYNAMIC_VALUE_NAME.test(name)) {
        ctx.addIssue({
          code: 'custom',
          message: `"${name}" cannot name a value: use ASCII letters and digits, starting with a letter.`,
          path: [name],
        });
      }
      for (const key of Object.keys(binding.cases ?? {})) {
        if (
          !DYNAMIC_VALUE_NAME.test(key) ||
          key === MISSING_CASE ||
          key === 'other'
        ) {
          ctx.addIssue({
            code: 'custom',
            message: `"${key}" cannot name a case: use ASCII letters and digits, starting with a letter, other than "${MISSING_CASE}" and "other".`,
            path: [name, 'cases', key],
          });
        }
      }
    }
  });

export type DynamicValues = z.infer<typeof DynamicValuesSchema>;

/** Stages whose prompts are shown about two nodes at a time. */
const DYAD_STAGE_TYPES: ReadonlySet<string> = new Set([
  'DyadCensus',
  'TieStrengthCensus',
]);

/**
 * What a form field's form describes: its entity, and whether that is the
 * stage's own subject. Only then can text name the entity's attributes: a
 * Network Composer edge type's form describes an edge type of its own, which
 * no stage binding can name unambiguously.
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
 * shows many nodes at once exposes none of theirs.
 */
export const dynamicValueRolesAt = (
  stageType: string,
  site: DynamicValueSite,
  form: DynamicValueForm | undefined,
): ReadonlySet<DynamicValueRole> => {
  const roles = new Set<DynamicValueRole>(['ego']);
  if (site === 'prompt') {
    if (DYAD_STAGE_TYPES.has(stageType)) {
      roles.add('dyadSource');
      roles.add('dyadTarget');
    }
    if (stageType === 'OneToManyDyadCensus') roles.add('focal');
    if (stageType === 'Geospatial') roles.add('node');
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

/** Variable types whose bindings may carry select cases. */
export const CASED_VARIABLE_TYPES: ReadonlySet<VariableType> =
  new Set<VariableType>(['boolean', 'ordinal', 'categorical']);

const NUMERIC_VARIABLE_TYPES: ReadonlySet<VariableType> = new Set<VariableType>(
  ['number', 'scalar'],
);

/** The facts about a variable that decide how a value of it can be used. */
export type DynamicValueVariable = Readonly<{
  type: VariableType;
  name?: string;
  encrypted?: boolean;
  options?: readonly Readonly<{ value: unknown; label?: unknown }>[];
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
  return `${attribute} is a yes/no attribute without labels for both of its answers. Add a label for yes and for no to ${attribute}, or give the text a different wording for each answer.`;
};

/**
 * Whether every answer `variable` can hold is the option of one of
 * `binding`'s cases: both answers of a yes/no attribute, or each option of
 * any other. A present answer then always chooses a case.
 */
const casesCoverEveryAnswer = (
  binding: DynamicValueBinding,
  variable: DynamicValueVariable,
): boolean => {
  const answers =
    variable.type === 'boolean'
      ? [true, false]
      : (variable.options ?? []).map((option) => option.value);
  const chosen = Object.values(binding.cases ?? {});
  return (
    answers.length > 0 &&
    answers.every((answer) => chosen.some((option) => option === answer))
  );
};

/**
 * A binding as one site sees it:
 * - `available`, with its argument for the message checker;
 * - `unavailable`, naming a value that site cannot show;
 * - `unknown`, naming a variable that does not exist, or one of a kind that
 *   cannot be shown.
 */
export type DynamicValueStatus =
  | Readonly<{ status: 'available'; argument: DynamicValueArgument }>
  | Readonly<{ status: 'unavailable' | 'unknown'; reason: string }>;

export type DynamicValueSiteContext = Readonly<{
  roles: ReadonlySet<DynamicValueRole>;
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

/** How a binding reads at a site (see `DynamicValueStatus`). */
export const dynamicValueStatus = (
  binding: DynamicValueBinding,
  context: DynamicValueSiteContext,
): DynamicValueStatus => {
  const parsed = parseDynamicValuePath(binding.path);
  if (parsed === undefined) {
    return {
      status: 'unknown',
      reason: 'it does not name a value the interview can show',
    };
  }
  if (parsed.kind === 'intrinsic') {
    return {
      status: 'available',
      argument: {
        cases: [],
        numeric: false,
        optional: INTRINSIC_DYNAMIC_VALUES[parsed.name].optional,
      },
    };
  }
  if (!context.roles.has(parsed.role)) {
    return {
      status: 'unavailable',
      reason: `values about ${ROLE_NAMES[parsed.role]} cannot be shown here`,
    };
  }
  // A node on screen always shows a label, its type's name at least.
  if (parsed.kind === 'label') {
    return {
      status: 'available',
      argument: { cases: [], numeric: false, optional: false },
    };
  }
  const variables = context.variablesFor(parsed.role);
  const variable = variables?.[parsed.variableId];
  if (variable === undefined) {
    return {
      status: 'unknown',
      reason: 'the attribute it shows does not exist',
    };
  }
  if (!DYNAMIC_VALUE_VARIABLE_TYPES.has(variable.type) || variable.encrypted) {
    return {
      status: 'unknown',
      reason: variable.encrypted
        ? 'the attribute it shows is encrypted'
        : `a ${variable.type} attribute cannot be shown in text`,
    };
  }
  const unshowable = dynamicValueUnshowableReason(variable);
  const cased = CASED_VARIABLE_TYPES.has(variable.type);
  return {
    status: 'available',
    argument: {
      cases: cased ? Object.keys(binding.cases ?? {}) : [],
      numeric: NUMERIC_VARIABLE_TYPES.has(variable.type),
      optional: true,
      ...(cased &&
        casesCoverEveryAnswer(binding, variable) && {
          exhaustive: true,
        }),
      ...(unshowable !== undefined && { unshowable }),
    },
  };
};

/** The arguments a site's messages may use: the bindings available there. */
export const dynamicValueArgumentsAt = (
  bindings: DynamicValues | undefined,
  context: DynamicValueSiteContext,
): DynamicValueArguments =>
  Object.fromEntries(
    Object.entries(bindings ?? {}).flatMap(([name, binding]) => {
      const status = dynamicValueStatus(binding, context);
      return status.status === 'available' ? [[name, status.argument]] : [];
    }),
  );
