import { z } from 'zod';

import {
  dynamicValueNamesIn,
  findDynamicMessageSyntaxProblem,
  findDynamicValueProblem,
} from '../../localization/dynamicValueMessages.ts';
import { ConditionsSchema } from './conditions.ts';
import {
  conditionsContextOf,
  findBindingCaseProblems,
} from './dynamic-value-validation.ts';
import {
  dynamicValueArgumentsAt,
  type DynamicValueRole,
  type DynamicValues,
  type DynamicValueSiteContext,
  DynamicValuesSchema,
  dynamicValueStatus,
  type DynamicValueVariable,
} from './dynamic-values.ts';
import { localizedString, nonBlankText } from './localized-string.ts';

/**
 * How a node type labels its nodes, in place of the label the interview
 * would otherwise choose for each (an attribute called "name", and so on):
 * - `text`, the label, in each of the protocol's languages, which shows
 *   values as a stage's text does;
 * - `dynamicValues`, the values `text` names, as a stage binds its own: an
 *   attribute of the node (`node.<id>`), the label the interview would
 *   otherwise have chosen for it (`node.$label`), or one of the label's
 *   conditions (`$condition.<id>`);
 * - `conditions`, the conditions `text` can choose its wording by, by id,
 *   each asked of the node the label is on (see `conditions.ts`).
 *
 * The label is one line of plain text, read live: it follows the node's
 * answers and its edges as they change.
 */
export const NodeLabelSchema = z.strictObject({
  text: localizedString(
    nonBlankText(),
    { format: 'plain', lines: 'single' },
    { dynamicValues: 'nodeLabel' },
  ),
  dynamicValues: DynamicValuesSchema.optional(),
  conditions: ConditionsSchema.optional(),
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

/**
 * What the label of `nodeType` can show: the node it is on, by its
 * attributes and the label the interview would otherwise choose for it, and
 * the conditions the label declares. Validation and Architect's palette
 * both build their answers from this, as they do for a stage's text from
 * `dynamicValueContextFor`.
 */
export const nodeLabelValueContext = ({
  codebook,
  nodeType,
  conditions,
}: {
  codebook: unknown;
  nodeType: string;
  /** The label's conditions, by id (its `dynamicLabel.conditions`). */
  conditions: unknown;
}): DynamicValueSiteContext => {
  const variables = variablesOfNodeType(codebook, nodeType);
  return {
    roles: new Set<DynamicValueRole>(['node']),
    nodeLabel: true,
    conditions: conditionsContextOf(conditions),
    variablesFor: (role) => (role === 'node' ? variables : undefined),
  };
};

type LabelHit = Readonly<{
  path: Path;
  value: Readonly<Record<string, string>>;
  dynamicValues?: string;
}>;

/**
 * Every problem with the values node types' labels show, as
 * `findDynamicValueProblems` finds a stage's: a value the label names that
 * is not bound, cannot be shown on a node, or names an attribute or a
 * condition that does not exist; a binding case that stands for nothing;
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
    for (const [name, binding] of Object.entries(rawBindings)) {
      if (!isRecord(binding) || typeof binding.path !== 'string') continue;
      const status = dynamicValueStatus({ path: binding.path }, context);
      if (status.status !== 'available') {
        problems.push({
          path: [...base, 'dynamicValues', name, 'path'],
          message: `"${name}" cannot be shown on a node of this type: ${status.reason}.`,
        });
      }
    }
    problems.push(
      ...findBindingCaseProblems(
        rawBindings,
        [...base, 'dynamicValues'],
        context.variablesFor,
      ),
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
