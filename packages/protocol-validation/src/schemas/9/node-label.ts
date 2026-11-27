import { z } from 'zod';

import { findContentDocumentTextProblem } from '../../localization/contentDocumentProblems.ts';
import { findDynamicMessageSyntaxProblem } from '../../localization/dynamicValueMessages.ts';
import { ConditionsSchema } from './conditions.ts';
import { DynamicAttributesSchema } from './dynamic-attributes.ts';
import {
  conditionsContextOf,
  dynamicAttributesContextOf,
  findSiteMessageProblem,
} from './dynamic-value-validation.ts';
import type {
  DynamicValueRole,
  DynamicValueSiteContext,
  DynamicValueVariable,
} from './dynamic-values.ts';
import { localizedString, nonBlankText } from './localized-string.ts';

/**
 * How a node type labels its nodes, in place of the label the interview
 * would otherwise choose for each (an attribute called "name", and so on):
 * - `text`, the label, in each of the protocol's languages, which shows
 *   values as a stage's text does, by name (see `dynamic-values.ts`): an
 *   attribute of the node (`node_<variable id>`), the label the interview
 *   would otherwise have chosen for it (`node_label`), or one of the label's
 *   conditions (`condition_<id>`);
 * - `conditions`, the conditions `text` can choose its wording by, by id,
 *   each asked of the node the label is on (see `conditions.ts`);
 * - `dynamicAttributes`, the dynamic attributes `text` shows, by id (see
 *   `dynamic-attributes.ts`), whose logic reads the node the label is on.
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
  conditions: ConditionsSchema.optional(),
  dynamicAttributes: DynamicAttributesSchema.optional(),
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
  dynamicAttributes,
}: {
  codebook: unknown;
  nodeType: string;
  /** The label's conditions, by id (its `dynamicLabel.conditions`). */
  conditions: unknown;
  /**
   * The label's dynamic attributes, by id (its
   * `dynamicLabel.dynamicAttributes`).
   */
  dynamicAttributes?: unknown;
}): DynamicValueSiteContext => {
  const variables = variablesOfNodeType(codebook, nodeType);
  return {
    roles: new Set<DynamicValueRole>(['node']),
    nodeLabel: true,
    conditions: conditionsContextOf(conditions),
    dynamicAttributes: dynamicAttributesContextOf(dynamicAttributes),
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
 * `findDynamicValueProblems` finds a stage's: a name that refers to nothing,
 * a value that cannot be shown on a node, a version for a case the value
 * does not have, and any misuse `findDynamicValueProblem` finds. Each
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
      dynamicAttributes: label.dynamicAttributes,
    });
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
        if (
          findDynamicMessageSyntaxProblem(message) !== undefined ||
          findContentDocumentTextProblem(message, {
            format: 'plain',
            lines: 'single',
          }) !== undefined
        ) {
          continue;
        }
        const problem = findSiteMessageProblem(
          message,
          context,
          locale,
          'This label',
        );
        if (problem !== undefined) {
          problems.push({ path: [...hit.path, locale], message: problem });
        }
      }
    }
  }
  return problems;
};
