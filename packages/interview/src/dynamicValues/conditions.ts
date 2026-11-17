import { predicate } from '@codaco/network-query';
import {
  type Condition,
  type ConditionRule,
  type DynamicValueRole,
  type EdgeCountRule,
  isEdgeCountRule,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import {
  type ConnectivityIndex,
  EMPTY_CONNECTIVITY,
} from '../nodeLabels/connectivity';
import { readOwnProperty } from '../utils/ownProperty';

/**
 * What a condition is asked of, where its text is shown: the attributes of
 * each entity on screen by role (the participant's under `ego`), the id of
 * each one that is saved in the network, the node type the node roles are
 * of, and how the network's nodes are connected.
 */
export type ConditionSubjects = Readonly<{
  attributes: Readonly<
    Partial<Record<DynamicValueRole, Readonly<Record<string, unknown>>>>
  >;
  entityIds?: Readonly<Partial<Record<DynamicValueRole, string>>> | undefined;
  nodeType?: string | undefined;
  connectivity?: ConnectivityIndex | undefined;
}>;

const compareCount = (
  rule: EdgeCountRule,
  own: number,
  extremes: () => Readonly<{ min: number; max: number }>,
): boolean => {
  const { count, value = 0 } = rule.options;
  switch (count) {
    case 'EXACTLY':
      return own === value;
    case 'NOT':
      return own !== value;
    case 'GREATER_THAN':
      return own > value;
    case 'GREATER_THAN_OR_EQUAL':
      return own >= value;
    case 'LESS_THAN':
      return own < value;
    case 'LESS_THAN_OR_EQUAL':
      return own <= value;
    // A node has the most, or the fewest, only where the nodes of its type
    // differ: when each has as many edges as the next, none stands out.
    case 'MOST': {
      const { min, max } = extremes();
      return min !== max && own === max;
    }
    case 'FEWEST': {
      const { min, max } = extremes();
      return min !== max && own === min;
    }
    default: {
      const unhandled: never = count;
      throw new Error('Unhandled edge count comparison', { cause: unhandled });
    }
  }
};

const ruleHolds = (
  rule: ConditionRule,
  about: DynamicValueRole | undefined,
  subjects: ConditionSubjects,
): boolean => {
  const connectivity = subjects.connectivity ?? EMPTY_CONNECTIVITY;
  if (rule.type === 'ego') {
    if (isEdgeCountRule(rule) || !('attribute' in rule.options)) return false;
    const ego = subjects.attributes.ego;
    return predicate(rule.options.operator)({
      value:
        ego === undefined
          ? undefined
          : readOwnProperty(ego, rule.options.attribute),
      other: rule.options.value,
    });
  }
  if (about === undefined) return false;
  const attributes = subjects.attributes[about];
  // Nothing of this role is on screen, so nothing is true of it.
  if (attributes === undefined) return false;
  const id = subjects.entityIds?.[about];

  if (isEdgeCountRule(rule)) {
    if (about === 'edge') return false;
    const edgeType = rule.options.type;
    // A node not saved yet has no edges.
    const own = id === undefined ? 0 : connectivity.degree(id, edgeType);
    return compareCount(rule, own, () =>
      subjects.nodeType === undefined
        ? { min: 0, max: 0 }
        : connectivity.extremes(subjects.nodeType, edgeType),
    );
  }

  const { options } = rule;
  const attribute =
    'attribute' in options && options.attribute ? options.attribute : undefined;
  const matches = predicate(options.operator);

  if (rule.type === 'node') {
    // The node is of the type the rule names: the protocol's validation
    // holds a node rule to the type its text is shown with.
    if (about === 'edge') return false;
    if (attribute === undefined) return options.operator === 'EXISTS';
    return matches({
      value: readOwnProperty(attributes, attribute),
      other: options.value,
    });
  }

  // An edge rule about the edge a form describes compares that edge.
  if (about === 'edge') {
    if (attribute === undefined) return options.operator === 'EXISTS';
    return matches({
      value: readOwnProperty(attributes, attribute),
      other: options.value,
    });
  }
  // About a node, it asks of the edges that join the node to others.
  if (attribute === undefined) {
    const has = id !== undefined && connectivity.degree(id, options.type) > 0;
    return options.operator === 'EXISTS' ? has : !has;
  }
  return (
    id !== undefined &&
    connectivity.edgesOf(id).some(
      (edge) =>
        edge.type === options.type &&
        matches({
          value: readOwnProperty(edge[entityAttributesProperty], attribute),
          other: options.value,
        }),
    )
  );
};

/**
 * Whether `condition` is met by what its text is shown with. Each comparison
 * is the one skip logic and filters make (`predicate`).
 */
export const conditionHolds = (
  condition: Condition,
  subjects: ConditionSubjects,
): boolean => {
  const holds = (rule: ConditionRule) =>
    ruleHolds(rule, condition.about, subjects);
  return condition.join === 'AND'
    ? condition.rules.every(holds)
    : condition.rules.some(holds);
};

/** Whether a condition asks about edges, and so follows the network. */
export const conditionReadsNetwork = (condition: Condition): boolean =>
  condition.about !== 'edge' &&
  condition.rules.some((rule) => rule.type === 'edge');
