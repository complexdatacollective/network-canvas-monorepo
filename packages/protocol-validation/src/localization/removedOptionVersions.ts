import {
  optionIdFromCaseKey,
  parseDynamicValueName,
} from '../schemas/9/dynamic-values.ts';
// The protocol's structure, imported from its own module rather than through
// the schema index, which imports this package's validators.
import { ProtocolStructureSchema } from '../schemas/9/protocol-structure.ts';
import { setValueAt, valueAt } from '../utils/protocolObjectIdRewrite.ts';
import {
  isAttributeHit,
  walkSchemaReferences,
} from '../utils/schemaReferenceWalk.ts';
import {
  type MessageNode,
  messageStructure,
  printMessageStructure,
} from './messageStructure.ts';

/**
 * `nodes` without the versions that a select on `variableId` (shown for any
 * role) gives an option in `optionIds`, at any depth.
 */
const withoutOptionVersions = (
  nodes: readonly MessageNode[],
  variableId: string,
  optionIds: ReadonlySet<string>,
): MessageNode[] =>
  nodes.map((node): MessageNode => {
    if (node.kind !== 'switch') return node;
    const parsed = parseDynamicValueName(node.argument);
    const onVariable =
      node.type === 'select' &&
      parsed?.kind === 'attribute' &&
      parsed.variableId === variableId;
    return {
      ...node,
      versions: node.versions
        .filter((version) => {
          if (!onVariable) return true;
          const optionId = optionIdFromCaseKey(version.key);
          return optionId === undefined || !optionIds.has(optionId);
        })
        .map((version) => ({
          key: version.key,
          nodes: withoutOptionVersions(version.nodes, variableId, optionIds),
        })),
    };
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The ids of each variable's options, by variable id, across `owners`: the
 * records that hold variables (the participant's, a node or edge type's),
 * read loosely. Variable ids are unique across a codebook. Option rows
 * without an id (a yes/no variable's) are left out: text chooses those by
 * `true` and `false`, never by an option id.
 */
const optionIdsByVariable = (
  owners: Iterable<unknown>,
): Map<string, Set<string>> => {
  const byVariable = new Map<string, Set<string>>();
  for (const owner of owners) {
    const variables = isRecord(owner) ? owner.variables : undefined;
    if (!isRecord(variables)) continue;
    for (const [variableId, variable] of Object.entries(variables)) {
      const options =
        isRecord(variable) && Array.isArray(variable.options)
          ? variable.options
          : [];
      byVariable.set(
        variableId,
        new Set(
          options.flatMap((option: unknown) =>
            isRecord(option) && typeof option.id === 'string'
              ? [option.id]
              : [],
          ),
        ),
      );
    }
  }
  return byVariable;
};

/**
 * The options that each variable had in `before` and no longer has in
 * `after`, by variable id, where both are lists of the records that hold
 * variables (the participant's, a node or edge type's). A variable with no
 * option removed is left out, and so is a variable that `after` no longer
 * has at all: a variable that text uses cannot be deleted.
 */
export const removedOptionIds = (
  before: Iterable<unknown>,
  after: Iterable<unknown>,
): Map<string, string[]> => {
  const kept = optionIdsByVariable(after);
  const removed = new Map<string, string[]>();
  for (const [variableId, options] of optionIdsByVariable(before)) {
    const now = kept.get(variableId);
    if (now === undefined) continue;
    const gone = [...options].filter((optionId) => !now.has(optionId));
    if (gone.length > 0) removed.set(variableId, gone);
  }
  return removed;
};

/**
 * `protocol` without the versions that its text writes for options that the
 * variable `variableId` no longer has (`optionIds`): in every translation of
 * every string that can show values, wherever it is (a stage's text, a form
 * field's question, a panel's title, a node type's label), including the
 * versions of its logic blocks; and without the versions that its dynamic
 * attributes write for those options.
 *
 * A version is written for an option by its id (`optionCaseKey`), so once
 * the option is deleted nothing could ever choose it, and validation refuses
 * text that names an option the variable does not have. Removing those
 * versions keeps the protocol valid when an option is deleted.
 *
 * The rest of the text is kept as it is. A select left with only its
 * `missing` and `other` versions is kept too: it is still valid, and its
 * `other` version is what the participant reads for every answer. The
 * researcher decides whether to keep it.
 *
 * Returns `protocol` itself when no text or dynamic attribute has a version
 * for any of these options, and otherwise a copy with those rewritten.
 */
export const withoutRemovedOptionVersions = <T>(
  protocol: T,
  variableId: string,
  optionIds: Iterable<string>,
): T => {
  const removed = new Set(optionIds);
  if (removed.size === 0) return protocol;
  // One rewrite for each translation, however many hits name the variable.
  const paths = new Map<string, (string | number)[]>();
  // The dynamic attributes whose answers give a version for one of them.
  const dynamicAttributes = new Map<string, (string | number)[]>();
  for (const hit of walkSchemaReferences(ProtocolStructureSchema, protocol, {
    readAssetBlocks: false,
  })) {
    if (
      isAttributeHit(hit) &&
      hit.variableId === variableId &&
      hit.inMessage?.optionIds.some((optionId) => removed.has(optionId)) ===
        true
    ) {
      if (hit.asName) {
        // The name is the dynamic attribute's `value`.
        const dynamicAttribute = hit.path.slice(0, -1);
        dynamicAttributes.set(
          JSON.stringify(dynamicAttribute),
          dynamicAttribute,
        );
      } else {
        paths.set(JSON.stringify(hit.path), hit.path);
      }
    }
  }
  if (paths.size === 0 && dynamicAttributes.size === 0) return protocol;

  const copy = structuredClone(protocol);
  for (const path of dynamicAttributes.values()) {
    const dynamicAttribute = valueAt(copy, path);
    if (
      !isRecord(dynamicAttribute) ||
      !Array.isArray(dynamicAttribute.answers)
    ) {
      continue;
    }
    dynamicAttribute.answers = dynamicAttribute.answers.filter(
      (entry: unknown) => {
        const optionId =
          isRecord(entry) && typeof entry.answer === 'string'
            ? optionIdFromCaseKey(entry.answer)
            : undefined;
        return optionId === undefined || !removed.has(optionId);
      },
    );
  }
  for (const path of paths.values()) {
    const message = valueAt(copy, path);
    if (typeof message !== 'string') continue;
    const structure = messageStructure(message);
    if (!('nodes' in structure)) continue;
    setValueAt(
      copy,
      path,
      printMessageStructure(
        withoutOptionVersions(structure.nodes, variableId, removed),
      ),
    );
  }
  return copy;
};
