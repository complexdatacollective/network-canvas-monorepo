import { z } from 'zod';

import {
  DYNAMIC_VALUE_NAME,
  dynamicValueNamesIn,
  findDynamicMessageSyntaxProblem,
  findDynamicValueProblem,
} from '../../localization/dynamicValueMessages.ts';
import {
  dynamicValueArgumentsAt,
  type DynamicValueRole,
  type DynamicValues,
  type DynamicValueSiteContext,
  DynamicValuesSchema,
  dynamicValueStatus,
  type DynamicValueVariable,
  parseDynamicValuePath,
  TRUE_CASE,
} from './dynamic-values.ts';
import { FilterSchema } from './filters/index.ts';
import { localizedString, nonBlankText } from './localized-string.ts';

/**
 * A named test of one node, which its type's label chooses its wording by:
 * the rules a filter is made of, asked of the node the label is on. A node
 * rule compares one of that node's attributes; an edge rule asks whether an
 * edge of a type, or one with an attribute, joins it to another node.
 */
export const NodeLabelConditionSchema = z.strictObject({
  /** What the researcher calls the condition, shown in Architect only. */
  name: z.string().trim().min(1),
  filter: FilterSchema,
});

export type NodeLabelCondition = z.infer<typeof NodeLabelConditionSchema>;

/**
 * How a node type labels its nodes, in place of the label the interview
 * would otherwise choose for each (an attribute called "name", and so on):
 * - `text`, the label, in each of the protocol's languages, which shows
 *   values as a stage's text does;
 * - `dynamicValues`, the values `text` names, as a stage binds its own: an
 *   attribute of the node (`node.<id>`), the label the interview would
 *   otherwise have chosen for it (`node.$label`), how it is connected
 *   (`node.$connected`, `node.$mostConnected`, `node.$leastConnected`, each
 *   for every edge or, with `.<edge type>`, the edges of one type), or one
 *   of the type's conditions (`node.$condition.<id>`);
 * - `conditions`, the conditions `text` can choose its wording by, by id.
 *
 * The label is one line of plain text, read live: it follows the node's
 * answers and its edges as they change.
 */
export const NodeLabelSchema = z
  .strictObject({
    text: localizedString(
      nonBlankText(),
      { format: 'plain', lines: 'single' },
      { dynamicValues: 'nodeLabel' },
    ),
    dynamicValues: DynamicValuesSchema.optional(),
    conditions: z.record(z.string(), NodeLabelConditionSchema).optional(),
  })
  .superRefine((label, ctx) => {
    for (const id of Object.keys(label.conditions ?? {})) {
      if (!DYNAMIC_VALUE_NAME.test(id)) {
        ctx.addIssue({
          code: 'custom',
          message: `"${id}" cannot identify a condition: use ASCII letters and digits, starting with a letter.`,
          path: ['conditions', id],
        });
      }
    }
  });

export type NodeLabel = z.infer<typeof NodeLabelSchema>;

type Path = (string | number)[];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const variablesOfNodeType = (
  codebook: unknown,
  nodeType: string,
): Readonly<Record<string, DynamicValueVariable>> => {
  const node = isRecord(codebook) ? codebook.node : undefined;
  const definition = isRecord(node) ? node[nodeType] : undefined;
  const variables = isRecord(definition) ? definition.variables : undefined;
  if (!isRecord(variables)) return {};
  return Object.fromEntries(
    Object.entries(variables).flatMap(([id, variable]) =>
      isRecord(variable) && typeof variable.type === 'string'
        ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the codebook is raw here; only a record with a string `type` is kept, and the rest of a variable is read defensively
          [[id, variable as DynamicValueVariable]]
        : [],
    ),
  );
};

const namesById = (record: unknown): ReadonlyMap<string, string | undefined> =>
  new Map(
    Object.entries(isRecord(record) ? record : {}).map(([id, entry]) => [
      id,
      isRecord(entry) && typeof entry.name === 'string'
        ? entry.name
        : undefined,
    ]),
  );

/**
 * What the label of `nodeType` can show: the node it is on, by its
 * attributes and the label the interview would otherwise choose for it, how
 * that node is connected, and the conditions the label declares. Validation
 * and Architect's palette both build their answers from this, as they do
 * for a stage's text from `dynamicValueContextFor`.
 */
export const nodeLabelValueContext = ({
  codebook,
  nodeType,
  conditions,
}: {
  codebook: unknown;
  nodeType: string;
  /** The type's conditions, by id (its `dynamicLabel.conditions`). */
  conditions: unknown;
}): DynamicValueSiteContext => {
  const edges = isRecord(codebook) ? codebook.edge : undefined;
  const variables = variablesOfNodeType(codebook, nodeType);
  return {
    roles: new Set<DynamicValueRole>(['node']),
    nodeLabel: {
      edgeTypes: namesById(edges),
      conditions: namesById(conditions),
    },
    variablesFor: (role) => (role === 'node' ? variables : undefined),
  };
};

type LabelHit = Readonly<{
  path: Path;
  value: Readonly<Record<string, string>>;
  dynamicValues?: string;
}>;

const checkLabelBindings = (
  bindings: Record<string, unknown>,
  base: Path,
  context: DynamicValueSiteContext,
): { path: Path; message: string }[] =>
  Object.entries(bindings).flatMap(([name, binding]) => {
    if (!isRecord(binding) || typeof binding.path !== 'string') return [];
    const parsed = parseDynamicValuePath(binding.path);
    const status = dynamicValueStatus({ path: binding.path }, context);
    const problems: { path: Path; message: string }[] = [];
    if (status.status !== 'available') {
      problems.push({
        path: [...base, name, 'path'],
        message: `"${name}" cannot be shown on a node of this type: ${status.reason}.`,
      });
    }
    const cases = binding.cases;
    if (!isRecord(cases)) return problems;
    const casesPath: Path = [...base, name, 'cases'];
    // How a node is connected, and a condition, are true or false: the one
    // case is for true, and everything else reads `other`.
    if (parsed?.kind === 'connectivity' || parsed?.kind === 'condition') {
      for (const [key, value] of Object.entries(cases)) {
        if (key !== TRUE_CASE || value !== true) {
          problems.push({
            path: [...casesPath, key],
            message: `This value has one case, "${TRUE_CASE}", standing for true; when it is not true the label takes its "other" version.`,
          });
        }
      }
      return problems;
    }
    if (parsed?.kind !== 'attribute') {
      problems.push({
        path: casesPath,
        message: 'Only an attribute with options can have cases.',
      });
      return problems;
    }
    const variable = context.variablesFor('node')?.[parsed.variableId];
    // A missing variable is reported where the binding names it.
    if (variable === undefined) return problems;
    if (
      variable.type !== 'boolean' &&
      variable.type !== 'ordinal' &&
      variable.type !== 'categorical'
    ) {
      problems.push({
        path: casesPath,
        message: 'Only an attribute with options can have cases.',
      });
      return problems;
    }
    const optionValues =
      variable.type === 'boolean'
        ? [true, false]
        : (variable.options ?? []).map((option) => option.value);
    const caseFor = new Map<unknown, string>();
    for (const [key, optionValue] of Object.entries(cases)) {
      if (!optionValues.includes(optionValue)) {
        problems.push({
          path: [...casesPath, key],
          message: `Case "${key}" stands for ${JSON.stringify(optionValue)}, which is not one of the attribute's options.`,
        });
        continue;
      }
      const earlier = caseFor.get(optionValue);
      if (earlier !== undefined) {
        problems.push({
          path: [...casesPath, key],
          message: `Case "${key}" stands for ${JSON.stringify(optionValue)}, as case "${earlier}" already does, so it would never be chosen. Give each option at most one case.`,
        });
        continue;
      }
      caseFor.set(optionValue, key);
    }
    return problems;
  });

/**
 * Every problem with the values node types' labels show, as
 * `findDynamicValueProblems` finds a stage's: a value the label names that
 * is not bound, cannot be shown on a node, or names an attribute, edge type
 * or condition that does not exist; a binding case that stands for nothing;
 * and any misuse `findDynamicValueProblem` finds in a translation. Each
 * language is checked on its own.
 *
 * `hits` are the protocol's localized strings (`collectLocalizedStrings`).
 */
export const findNodeLabelProblems = (
  protocol: Readonly<{ codebook: unknown }>,
  hits: readonly LabelHit[],
): { path: Path; message: string }[] => {
  const problems: { path: Path; message: string }[] = [];
  const nodeTypes = isRecord(protocol.codebook)
    ? protocol.codebook.node
    : undefined;
  if (!isRecord(nodeTypes)) return problems;

  for (const [nodeType, definition] of Object.entries(nodeTypes)) {
    const label = isRecord(definition) ? definition.dynamicLabel : undefined;
    if (!isRecord(label)) continue;
    const base: Path = ['codebook', 'node', nodeType, 'dynamicLabel'];
    const context = nodeLabelValueContext({
      codebook: protocol.codebook,
      nodeType,
      conditions: label.conditions,
    });
    const rawBindings = isRecord(label.dynamicValues)
      ? label.dynamicValues
      : {};
    problems.push(
      ...checkLabelBindings(rawBindings, [...base, 'dynamicValues'], context),
    );
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the label is raw here; its dynamicValues are shaped by DynamicValuesSchema and each binding is checked before use
    const bindings = rawBindings as DynamicValues;
    const values = dynamicValueArgumentsAt(bindings, context);

    for (const hit of hits) {
      if (
        hit.dynamicValues !== 'nodeLabel' ||
        hit.path.length !== base.length + 1 ||
        !base.every((step, index) => hit.path[index] === step) ||
        hit.path[base.length] !== 'text'
      ) {
        continue;
      }
      for (const [locale, message] of Object.entries(hit.value)) {
        // The field's own check reports what needs no codebook.
        if (findDynamicMessageSyntaxProblem(message) !== undefined) continue;
        // A binding that cannot be shown is reported on the binding.
        const unusable = dynamicValueNamesIn(message).some((name) => {
          const binding = Object.hasOwn(bindings, name)
            ? bindings[name]
            : undefined;
          return (
            binding !== undefined &&
            dynamicValueStatus(binding, context).status !== 'available'
          );
        });
        if (unusable) continue;
        const problem = findDynamicValueProblem(message, values, locale);
        if (problem !== undefined) {
          problems.push({ path: [...hit.path, locale], message: problem });
        }
      }
    }
  }
  return problems;
};
