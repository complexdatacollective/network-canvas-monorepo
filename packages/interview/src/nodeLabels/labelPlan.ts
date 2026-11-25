import {
  dynamicValueReferencesIn,
  type NodeLabel,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import {
  conditionHolds,
  conditionReadsNetwork,
} from '../dynamicValues/conditions';
import type { ConnectivityIndex } from './connectivity';

/** One of a label's conditions, asked of one node. */
type NodeFact = Readonly<{
  conditionId: string;
  read: (node: NcNode, connectivity: ConnectivityIndex) => boolean;
}>;

/**
 * What reading a node type's label takes besides the node's own answers: the
 * conditions it chooses its wording by, and whether any of them reads the
 * network's edges. Worked out once for a label and kept.
 */
export type NodeLabelPlan = Readonly<{
  facts: readonly NodeFact[];
  /** Whether any condition depends on the edges, or on the other nodes. */
  readsNetwork: boolean;
}>;

const plans = new WeakMap<NodeLabel, NodeLabelPlan>();

/** The plan for reading `label`, built the first time it is asked for. */
export const nodeLabelPlanFor = (label: NodeLabel): NodeLabelPlan => {
  const known = plans.get(label);
  if (known !== undefined) return known;

  const facts: NodeFact[] = [];
  let readsNetwork = false;
  const seen = new Set<string>();
  const conditions = label.conditions ?? {};
  // The conditions the label's text chooses its wording by, in any of its
  // languages.
  const parsedNames = Object.values(label.text).flatMap((message) =>
    dynamicValueReferencesIn(message).map(({ parsed }) => parsed),
  );
  for (const parsed of parsedNames) {
    if (parsed?.kind !== 'condition' || seen.has(parsed.conditionId)) continue;
    const { conditionId } = parsed;
    seen.add(conditionId);
    const condition = Object.hasOwn(conditions, conditionId)
      ? conditions[conditionId]
      : undefined;
    // A condition the label does not declare is never met.
    if (condition === undefined) {
      facts.push({ conditionId, read: () => false });
      continue;
    }
    if (conditionReadsNetwork(condition)) readsNetwork = true;
    facts.push({
      conditionId,
      read: (node, connectivity) =>
        conditionHolds(condition, {
          attributes: { node: node[entityAttributesProperty] },
          entityIds: { node: node[entityPrimaryKeyProperty] },
          nodeType: node.type,
          connectivity,
        }),
    });
  }

  const plan: NodeLabelPlan = { facts, readsNetwork };
  plans.set(label, plan);
  return plan;
};

/**
 * A node's conditions as one short text, a `1` or a `0` for each in the
 * plan's order: equal texts are equal answers, so a subscriber that compares
 * them hears about a change in the network only when it changes this node's
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

/** The answers a signature records, by condition id. */
export const nodeFactsOf = (
  plan: NodeLabelPlan,
  signature: string,
): Readonly<Record<string, boolean>> =>
  Object.fromEntries(
    plan.facts.map((fact, index) => [
      fact.conditionId,
      signature[index] === '1',
    ]),
  );
