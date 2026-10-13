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
 *   person of a one-to-many census);
 * - `formField`, a form field's caption, shown while the form describes one
 *   entity, whose values earlier fields in the form have already written.
 */
export type DynamicValueSite = 'stageText' | 'prompt' | 'formField';

/**
 * Values the interview itself knows. `optional` ones are host-supplied and
 * not guaranteed in every host, so text needs a version for when they are
 * missing.
 */
export const INTRINSIC_DYNAMIC_VALUES = {
  'interview.id': { type: 'text', optional: false },
  'interview.startedAt': { type: 'datetime', optional: true },
  'protocol.name': { type: 'text', optional: false },
  'protocol.hash': { type: 'text', optional: true },
  'stage.id': { type: 'text', optional: false },
  'now': { type: 'datetime', optional: false },
} as const satisfies Record<string, { type: VariableType; optional: boolean }>;

export type IntrinsicDynamicValue = keyof typeof INTRINSIC_DYNAMIC_VALUES;

const isIntrinsic = (path: string): path is IntrinsicDynamicValue =>
  Object.hasOwn(INTRINSIC_DYNAMIC_VALUES, path);

/**
 * Whose attribute a value is: the participant (`ego`), the one entity a form
 * or interface is on (`node`, `edge`), the two people a Dyad Census asks
 * about (`dyadSource`, `dyadTarget`, called "first person" and "second
 * person" to researchers and participants), or the focal person of a
 * one-to-many census.
 */
export type DynamicValueRole =
  | 'ego'
  | 'node'
  | 'edge'
  | 'dyadSource'
  | 'dyadTarget'
  | 'focal';

export const DYNAMIC_VALUE_ROLE_PREFIXES: Readonly<
  Record<DynamicValueRole, string>
> = {
  ego: 'ego.',
  node: 'node.',
  edge: 'edge.',
  dyadSource: 'dyad.source.',
  dyadTarget: 'dyad.target.',
  focal: 'one_to_many.focal.',
};

export type ParsedDynamicValuePath =
  | Readonly<{ kind: 'intrinsic'; name: IntrinsicDynamicValue }>
  | Readonly<{ kind: 'attribute'; role: DynamicValueRole; variableId: string }>;

/** What a binding's `path` names, or undefined when it names nothing. */
export const parseDynamicValuePath = (
  path: string,
): ParsedDynamicValuePath | undefined => {
  if (isIntrinsic(path)) return { kind: 'intrinsic', name: path };
  for (const [role, prefix] of Object.entries(DYNAMIC_VALUE_ROLE_PREFIXES)) {
    if (path.startsWith(prefix) && path.length > prefix.length) {
      return {
        kind: 'attribute',
        role: role as DynamicValueRole,
        variableId: path.slice(prefix.length),
      };
    }
  }
  return undefined;
};

/** The `path` naming a role's attribute. */
export const dynamicValuePathFor = (
  role: DynamicValueRole,
  variableId: string,
): string => `${DYNAMIC_VALUE_ROLE_PREFIXES[role]}${variableId}`;

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

/** Stages whose prompts are shown about two people at a time. */
const DYAD_STAGE_TYPES: ReadonlySet<string> = new Set([
  'DyadCensus',
  'TieStrengthCensus',
]);

/**
 * The roles whose attributes a site can show, from the stage it is on and
 * where on it it sits. This is the one table of what is available where: the
 * protocol's validation and Architect's palette both read it.
 *
 * Ego values are available everywhere, because every stage runs inside an
 * interview's network. A stage's prompts add the entities its interface is
 * on while the prompt shows: a Dyad Census's pair, a one-to-many census's
 * focal person. A form field adds the entity the form describes, when that is
 * the stage's own subject (`formSubject`). An interface that shows many
 * people at once exposes none of theirs.
 */
export const dynamicValueRolesAt = (
  stageType: string,
  site: DynamicValueSite,
  formSubject: StageSubject | undefined,
): ReadonlySet<DynamicValueRole> => {
  const roles = new Set<DynamicValueRole>(['ego']);
  if (site === 'prompt') {
    if (DYAD_STAGE_TYPES.has(stageType)) {
      roles.add('dyadSource');
      roles.add('dyadTarget');
    }
    if (stageType === 'OneToManyDyadCensus') roles.add('focal');
  }
  if (site === 'formField' && formSubject !== undefined) {
    if (formSubject.entity === 'node') roles.add('node');
    if (formSubject.entity === 'edge') roles.add('edge');
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
  encrypted?: boolean;
  options?: readonly Readonly<{ value: unknown }>[];
}>;

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
  /**
   * Variables of the form's subject the site may not show: its own field's
   * and every later field's, which the participant has not answered yet.
   */
  notYetWritten:
    | Readonly<{ role: DynamicValueRole; variables: ReadonlySet<string> }>
    | undefined;
}>;

const ROLE_NAMES: Readonly<Record<DynamicValueRole, string>> = {
  ego: 'the participant',
  node: 'this person',
  edge: 'this relationship',
  dyadSource: 'the first person',
  dyadTarget: 'the second person',
  focal: 'the person being asked about',
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
  const variables = context.variablesFor(parsed.role);
  const variable = variables?.[parsed.variableId];
  if (!context.roles.has(parsed.role)) {
    return {
      status: 'unavailable',
      reason: `values about ${ROLE_NAMES[parsed.role]} cannot be shown here`,
    };
  }
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
  if (
    context.notYetWritten?.role === parsed.role &&
    context.notYetWritten.variables.has(parsed.variableId)
  ) {
    return {
      status: 'unavailable',
      reason:
        'this form asks for it here or later, so it has no value yet where this text is shown',
    };
  }
  return {
    status: 'available',
    argument: {
      cases: CASED_VARIABLE_TYPES.has(variable.type)
        ? Object.keys(binding.cases ?? {})
        : [],
      numeric: NUMERIC_VARIABLE_TYPES.has(variable.type),
      optional: true,
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
