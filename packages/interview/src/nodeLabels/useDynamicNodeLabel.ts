'use client';

import { createSelector } from '@reduxjs/toolkit';
import { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';

import type {
  LocalizedString,
  NodeLabel,
  Variable,
} from '@codaco/protocol-validation';
import { entityAttributesProperty, type NcNode } from '@codaco/shared-consts';

import type { DynamicValueSources } from '../dynamicValues/resolveDynamicText';
import { useResolveLocalizedStringWhereLocalized } from '../localization/ProtocolLocalizationProvider';
import { makeGetCodebookForNodeType } from '../selectors/protocol';
import { getCodebook } from '../store/modules/protocol';
import type { RootState } from '../store/store';
import {
  type ConnectivityIndex,
  EMPTY_CONNECTIVITY,
  getConnectivityIndex,
} from './connectivity';
import {
  nodeFactSignature,
  nodeFactsOf,
  type NodeLabelPlan,
  nodeLabelPlanFor,
} from './labelPlan';

const NO_VARIABLES: Readonly<Record<string, Variable>> = {};

/** Whether any node type's label reads the network's edges. */
const getAnyLabelReadsNetwork = createSelector(getCodebook, (codebook) =>
  Object.values(codebook?.node ?? {}).some(
    (definition) =>
      definition.dynamicLabel !== undefined &&
      nodeLabelPlanFor(definition.dynamicLabel).readsNetwork,
  ),
);

type ResolveText = (
  value: LocalizedString,
  sources: DynamicValueSources | null,
) => Readonly<{ text: string }>;

/**
 * The label a node type gives one of its nodes: the version of its text that
 * the node's answers, its `facts` and the label the interview would otherwise
 * have chosen (`defaultLabel`) read. The label is one line, so the spaces
 * left around a version that shows nothing are closed up. A label that comes
 * out empty, or cannot be read, leaves the node with `defaultLabel`: a node
 * is never drawn without one.
 */
const resolveNodeLabel = ({
  label,
  plan,
  signature,
  attributes,
  variables,
  defaultLabel,
  resolve,
}: {
  label: NodeLabel;
  plan: NodeLabelPlan;
  signature: string;
  attributes: Readonly<Record<string, unknown>>;
  variables: Readonly<Record<string, Variable>>;
  defaultLabel: string;
  resolve: ResolveText;
}): string => {
  const sources: DynamicValueSources = {
    intrinsics: { now: undefined },
    attributes: { node: attributes },
    labels: { node: defaultLabel },
    conditionFacts: nodeFactsOf(plan, signature),
    variablesFor: (role) => (role === 'node' ? variables : undefined),
  };
  let text: string;
  try {
    text = resolve(label.text, sources).text;
  } catch {
    return defaultLabel;
  }
  const line = text.replace(/\s+/g, ' ').trim();
  return line === '' ? defaultLabel : line;
};

/**
 * The label `node` shows: the one its type gives it, where the type has a
 * label of its own, and `defaultLabel` otherwise. It follows the node's
 * answers as they change, and its edges: the component hears of a change to
 * the network only when it changes one of the facts this node's label reads,
 * so adding an edge elsewhere redraws nothing here.
 */
export function useDynamicNodeLabel(
  node: NcNode | undefined,
  defaultLabel: string | undefined,
): string | undefined {
  const getCodebookForNodeType = useSelector(makeGetCodebookForNodeType);
  const definition = node ? getCodebookForNodeType(node.type) : undefined;
  const label = definition?.dynamicLabel;
  const variables = definition?.variables ?? NO_VARIABLES;
  const resolve = useResolveLocalizedStringWhereLocalized();
  const plan =
    label === undefined || resolve === null
      ? undefined
      : nodeLabelPlanFor(label);

  const signature = useSelector((state: RootState) =>
    node === undefined || plan === undefined || plan.facts.length === 0
      ? ''
      : nodeFactSignature(
          plan,
          node,
          plan.readsNetwork ? getConnectivityIndex(state) : EMPTY_CONNECTIVITY,
        ),
  );

  const attributes = node?.[entityAttributesProperty];
  return useMemo(() => {
    if (
      defaultLabel === undefined ||
      attributes === undefined ||
      label === undefined ||
      plan === undefined ||
      resolve === null
    ) {
      return defaultLabel;
    }
    return resolveNodeLabel({
      label,
      plan,
      signature,
      attributes,
      variables,
      defaultLabel,
      resolve,
    });
  }, [defaultLabel, attributes, label, plan, signature, variables, resolve]);
}

/**
 * `useDynamicNodeLabel` as a function, for something that labels many nodes
 * at once (a list's typeahead, an announcement): given a node and the label
 * the interview would otherwise have chosen for it, the label it shows. Each
 * node's label is kept until the node, its facts or its default label
 * change, so labelling a list again after one edge is added reads only the
 * nodes that edge changed.
 */
export function useDynamicNodeLabeller(): (
  node: NcNode,
  defaultLabel: string,
) => string {
  const getCodebookForNodeType = useSelector(makeGetCodebookForNodeType);
  const resolve = useResolveLocalizedStringWhereLocalized();
  const readsNetwork = useSelector(getAnyLabelReadsNetwork);
  const connectivity: ConnectivityIndex = useSelector((state: RootState) =>
    readsNetwork ? getConnectivityIndex(state) : EMPTY_CONNECTIVITY,
  );

  // A node is a new object whenever its answers change, so a kept label is
  // found only for the node as it still is.
  const kept = useMemo(
    () => new WeakMap<NcNode, { key: string; label: string }>(),
    // The labels kept are those of this codebook, in this language.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [getCodebookForNodeType, resolve],
  );

  return useCallback(
    (node: NcNode, defaultLabel: string) => {
      const definition = getCodebookForNodeType(node.type);
      const label = definition?.dynamicLabel;
      if (label === undefined || resolve === null) return defaultLabel;
      const plan = nodeLabelPlanFor(label);
      const signature =
        plan.facts.length === 0
          ? ''
          : nodeFactSignature(plan, node, connectivity);
      const key = `${signature} ${defaultLabel}`;
      const known = kept.get(node);
      if (known?.key === key) return known.label;
      const resolved = resolveNodeLabel({
        label,
        plan,
        signature,
        attributes: node[entityAttributesProperty],
        variables: definition?.variables ?? NO_VARIABLES,
        defaultLabel,
        resolve,
      });
      kept.set(node, { key, label: resolved });
      return resolved;
    },
    [getCodebookForNodeType, resolve, connectivity, kept],
  );
}
