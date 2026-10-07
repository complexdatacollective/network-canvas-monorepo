'use client';

import { useCallback, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import type { SortRule, Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import {
  type DecryptOutcome,
  type EncryptedValue,
  readCachedOutcome,
  readEncryptedAttribute,
} from '../interfaces/Anonymisation/decryptionScope';
import {
  useDecryptedScope,
  useDecryptionScope,
} from '../interfaces/Anonymisation/useDecryptionScope';
import {
  getAllVariableUUIDsByEntity,
  makeGetCodebookVariablesForNodeType,
} from '../selectors/protocol';
import createSorter, {
  type ProcessedSortRule,
  processProtocolSortRule,
} from '../utils/createSorter';

type VariablesForType = (type: string) => Record<string, Variable>;
type OutcomeOf = (value: EncryptedValue) => DecryptOutcome | undefined;

// Where a node sat in the list it was sorted from. A symbol, so no sort rule's
// property can read it.
const POSITION = Symbol('position');

const ruleAttribute = ({ property }: ProcessedSortRule) =>
  Array.isArray(property) &&
  property.length === 2 &&
  property[0] === entityAttributesProperty
    ? property[1]
    : undefined;

/**
 * The plaintext of `attribute` on each node that stores it encrypted, by the
 * node's position, or `undefined` while any of them cannot be read.
 */
function readablePlaintext(
  nodes: readonly NcNode[],
  attribute: string,
  variablesForType: VariablesForType,
  outcomeOf: OutcomeOf,
): Map<number, string> | undefined {
  const plaintext = new Map<number, string>();
  for (const [index, node] of nodes.entries()) {
    const stored = readEncryptedAttribute(
      node,
      attribute,
      variablesForType(node.type),
    );
    if (stored === undefined) continue;
    if (stored.status === 'unreadable') return undefined;
    const outcome = outcomeOf(stored.value);
    if (!outcome?.readable) return undefined;
    plaintext.set(index, outcome.plaintext);
  }
  return plaintext;
}

/** Every encrypted value that `rules` compare on `nodes`. */
function comparedEncryptedValues(
  nodes: readonly NcNode[],
  rules: readonly ProcessedSortRule[],
  variablesForType: VariablesForType,
): EncryptedValue[] {
  const attributes = new Set(
    rules.flatMap((rule) => ruleAttribute(rule) ?? []),
  );
  return nodes.flatMap((node) =>
    [...attributes].flatMap((attribute) => {
      const stored = readEncryptedAttribute(
        node,
        attribute,
        variablesForType(node.type),
      );
      return stored?.status === 'encrypted' ? [stored.value] : [];
    }),
  );
}

/**
 * The nodes in the order `rules` put them, comparing an encrypted attribute by
 * its plaintext.
 *
 * A rule on an attribute that any of the nodes stores encrypted applies only
 * once every such value has decrypted readable. Until then (while the
 * interview is locked or the values decrypt), and for good when one can never
 * be read, the rule is left out, so the nodes keep the order the other rules
 * give them and that order says nothing about the hidden answers. The nodes
 * are returned as stored; their plaintext is only read for the comparison.
 */
function sortNodes<T extends NcNode>(
  nodes: T[],
  rules: readonly ProcessedSortRule[],
  variablesForType: VariablesForType,
  outcomeOf: OutcomeOf,
): T[] {
  if (rules.length === 0) return nodes;

  const attributes = nodes.map((node): Record<string, VariableValue> => ({
    ...node[entityAttributesProperty],
  }));
  const applied = rules.filter((rule) => {
    const attribute = ruleAttribute(rule);
    if (attribute === undefined) return true;
    const plaintext = readablePlaintext(
      nodes,
      attribute,
      variablesForType,
      outcomeOf,
    );
    if (!plaintext) return false;
    for (const [index, value] of plaintext) {
      const nodeAttributes = attributes[index];
      if (nodeAttributes) nodeAttributes[attribute] = value;
    }
    return true;
  });

  const comparable = nodes.map((node, position) => ({
    ...node,
    [entityAttributesProperty]: attributes[position] ?? {},
    [POSITION]: position,
  }));
  return createSorter<(typeof comparable)[number]>(applied)(comparable).flatMap(
    ({ [POSITION]: position }) => {
      const node = nodes[position];
      return node ? [node] : [];
    },
  );
}

type NodeSorter = <T extends NcNode>(subset: T[]) => T[];

/**
 * A function sorting any of `nodes` by the protocol's `sortRules`, and
 * whether the order it gives is about to change on its own.
 *
 * While the interview's key is in force, the encrypted values the rules
 * compare are decrypted and the sorter is replaced once they are, so a list
 * sorted with it re-sorts by their plaintext; until then it is `settling`. It
 * never asks for the passphrase: an interview that has not been unlocked
 * sorts as though those rules were not there (see `sortNodes`).
 */
function useSorter(
  nodes: NcNode[],
  sortRules: SortRule[] | undefined,
): { sort: NodeSorter; settling: boolean } {
  const codebookVariables = useSelector(getAllVariableUUIDsByEntity);
  const variablesForType = useSelector(makeGetCodebookVariablesForNodeType);

  const rules = useMemo(
    () => (sortRules ?? []).map(processProtocolSortRule(codebookVariables)),
    [sortRules, codebookVariables],
  );
  const values = useMemo(
    () => comparedEncryptedValues(nodes, rules, variablesForType),
    [nodes, rules, variablesForType],
  );
  const keyInForce = useDecryptionScope() !== undefined;
  const scope = useDecryptedScope(values);

  // Plaintext is read from the key's decryption scope on every sort rather
  // than kept here, so the order stops reflecting it as soon as the key goes.
  const sort = useCallback(
    <T extends NcNode>(subset: T[]) =>
      sortNodes(subset, rules, variablesForType, (value) =>
        scope ? readCachedOutcome(scope, value) : undefined,
      ),
    [rules, variablesForType, scope],
  );
  return { sort, settling: keyInForce && scope === undefined };
}

/** A function sorting any of `nodes` by the protocol's `sortRules`. */
export function useNodeSorter(
  nodes: NcNode[],
  sortRules: SortRule[] | undefined,
): NodeSorter {
  return useSorter(nodes, sortRules).sort;
}

export default function useSortedNodeList<T extends NcNode>(
  nodes: T[],
  sortRules?: SortRule[],
): T[] {
  const sort = useNodeSorter(nodes, sortRules);
  return useMemo(() => sort(nodes), [sort, nodes]);
}

const idsOf = (nodes: readonly NcNode[]) =>
  nodes.map((node) => node[entityPrimaryKeyProperty]);

/** `order`, followed by the ids in `sorted` that it does not hold yet. */
function withArrivals(
  order: readonly string[],
  sorted: readonly NcNode[],
): readonly string[] {
  const known = new Set(order);
  const arrived = idsOf(sorted).filter((id) => !known.has(id));
  return arrived.length === 0 ? order : [...order, ...arrived];
}

/**
 * The nodes a stage steps through one at a time on its `pass` (such as a
 * prompt), in the order `sortRules` give them when the pass begins.
 *
 * A pass keeps that order for as long as the stage is shown, so a stage that
 * tracks where it is by position never skips or repeats anyone when the list
 * re-sorts meanwhile, as it does when the passphrase is entered and a rule on
 * an encrypted attribute starts to apply. Nodes that arrive later are added
 * at the end. `undefined` while the order a pass would begin with is still
 * settling, so that nothing is shown in an order that is about to change.
 */
export function useStepOrder<T extends NcNode>(
  nodes: T[],
  sortRules: SortRule[] | undefined,
  pass: number,
): T[] | undefined {
  const { sort, settling } = useSorter(nodes, sortRules);
  const sorted = useMemo(() => sort(nodes), [sort, nodes]);

  const [orders, setOrders] = useState<ReadonlyMap<number, readonly string[]>>(
    () => new Map(),
  );
  const kept = orders.get(pass);
  const order = kept
    ? withArrivals(kept, sorted)
    : settling
      ? undefined
      : idsOf(sorted);
  // Recorded during render, so the pass's first committed render already
  // shows the order it keeps.
  if (order && order !== kept) setOrders(new Map(orders).set(pass, order));

  return useMemo(() => {
    if (!order) return undefined;
    const byId = new Map(
      nodes.map((node) => [node[entityPrimaryKeyProperty], node]),
    );
    return order.flatMap((id) => byId.get(id) ?? []);
  }, [order, nodes]);
}
