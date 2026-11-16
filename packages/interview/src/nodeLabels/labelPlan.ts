import { predicate } from '@codaco/network-query';
import {
  type ConnectivityMeasure,
  type FilterRule,
  type NodeLabel,
  parseDynamicValuePath,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import type { ConnectivityIndex } from './connectivity';

/** Something true or false of one node, which its label chooses wording by. */
type NodeFact = Readonly<{
  /** The binding path that names it (`node.$connected`, and so on). */
  path: string;
  read: (node: NcNode, connectivity: ConnectivityIndex) => boolean;
}>;

/**
 * What reading a node type's label takes besides the node's own answers: the
 * facts it chooses its wording by, and whether any of them reads the
 * network's edges. Worked out once for a label and kept.
 */
export type NodeLabelPlan = Readonly<{
  facts: readonly NodeFact[];
  /** Whether any fact depends on the edges, or on the other nodes. */
  readsNetwork: boolean;
}>;

const connectivityFact =
  (measure: ConnectivityMeasure, edgeType: string | undefined) =>
  (node: NcNode, connectivity: ConnectivityIndex): boolean => {
    const own = connectivity.degree(node[entityPrimaryKeyProperty], edgeType);
    if (measure === 'connected') return own > 0;
    // A node has the most, or the fewest, only where the nodes of its type
    // differ: when each has as many edges as the next, none stands out.
    const { min, max } = connectivity.extremes(node.type, edgeType);
    if (min === max) return false;
    return measure === 'mostConnected' ? own === max : own === min;
  };

/**
 * One rule of a condition, asked of one node. A node rule compares one of
 * its attributes (or asks whether it is of the type at all); an edge rule
 * asks whether an edge of a type joins it to another node, and, with an
 * attribute, whether such an edge's attribute matches. The comparison is the
 * one skip logic and filters make (`predicate`).
 */
const ruleFact = (
  rule: FilterRule,
): ((node: NcNode, connectivity: ConnectivityIndex) => boolean) => {
  const { options } = rule;
  const { type, operator, value: other } = options;
  const attribute =
    'attribute' in options && options.attribute ? options.attribute : undefined;
  if (rule.type === 'node') {
    if (attribute === undefined) {
      return (node) =>
        operator === 'EXISTS' ? node.type === type : node.type !== type;
    }
    const matches = predicate(operator);
    return (node) =>
      node.type === type &&
      matches({ value: node[entityAttributesProperty][attribute], other });
  }
  if (rule.type === 'edge') {
    if (attribute === undefined) {
      return (node, connectivity) => {
        const has =
          connectivity.degree(node[entityPrimaryKeyProperty], type) > 0;
        return operator === 'EXISTS' ? has : !has;
      };
    }
    const matches = predicate(operator);
    return (node, connectivity) =>
      connectivity.edgesOf(node[entityPrimaryKeyProperty]).some(
        (edge) =>
          edge.type === type &&
          matches({
            value: edge[entityAttributesProperty][attribute],
            other,
          }),
      );
  }
  // A valid protocol holds no rule about the participant here.
  return () => false;
};

const plans = new WeakMap<NodeLabel, NodeLabelPlan>();

/** The plan for reading `label`, built the first time it is asked for. */
export const nodeLabelPlanFor = (label: NodeLabel): NodeLabelPlan => {
  const known = plans.get(label);
  if (known !== undefined) return known;

  const facts: NodeFact[] = [];
  let readsNetwork = false;
  const seen = new Set<string>();
  for (const binding of Object.values(label.dynamicValues ?? {})) {
    if (seen.has(binding.path)) continue;
    seen.add(binding.path);
    const parsed = parseDynamicValuePath(binding.path);
    if (parsed?.kind === 'connectivity') {
      readsNetwork = true;
      facts.push({
        path: binding.path,
        read: connectivityFact(parsed.measure, parsed.edgeType),
      });
    } else if (parsed?.kind === 'condition') {
      const conditions = label.conditions ?? {};
      const condition = Object.hasOwn(conditions, parsed.conditionId)
        ? conditions[parsed.conditionId]
        : undefined;
      // A condition the label does not declare is never met.
      if (condition === undefined) {
        facts.push({ path: binding.path, read: () => false });
        continue;
      }
      const { join, rules } = condition.filter;
      if (rules.some((rule) => rule.type === 'edge')) readsNetwork = true;
      const tests = rules.map(ruleFact);
      facts.push({
        path: binding.path,
        read:
          join === 'AND'
            ? (node, connectivity) =>
                tests.every((test) => test(node, connectivity))
            : (node, connectivity) =>
                tests.some((test) => test(node, connectivity)),
      });
    }
  }

  const plan: NodeLabelPlan = { facts, readsNetwork };
  plans.set(label, plan);
  return plan;
};

/**
 * A node's facts as one short text, a `1` or a `0` for each in the plan's
 * order: equal texts are equal facts, so a subscriber that compares them
 * hears about a change in the network only when it changes this node's
 * label.
 */
export const nodeFactSignature = (
  plan: NodeLabelPlan,
  node: NcNode,
  connectivity: ConnectivityIndex,
): string => {
  let signature = '';
  for (const fact of plan.facts) {
    signature += fact.read(node, connectivity) ? '1' : '0';
  }
  return signature;
};

/** The facts a signature records, by the path that names each. */
export const nodeFactsOf = (
  plan: NodeLabelPlan,
  signature: string,
): Readonly<Record<string, boolean>> =>
  Object.fromEntries(
    plan.facts.map((fact, index) => [fact.path, signature[index] === '1']),
  );
