'use client';

import { isNil } from 'es-toolkit';
import { get } from 'es-toolkit/compat';

import type { Stage } from '@codaco/protocol-validation';
import { entityAttributesProperty, type NcNode } from '@codaco/shared-consts';

import { usePrompts } from '../../components/Prompts/usePrompts';
import useSortedNodeList, {
  useNodeSorter,
} from '../../hooks/useSortedNodeList';
import { useStageSelector } from '../../hooks/useStageSelector';
import { useResolveLocalizedString } from '../../localization/ProtocolLocalizationProvider';
import { makeGetCodebookVariableById } from '../../selectors/protocol';
import { getNetworkNodesForType } from '../../selectors/session';

const matchVariableValue = (
  node: NcNode,
  variable: string,
  value: string | number | boolean,
) => {
  const variableValue = node[entityAttributesProperty][variable];

  // Categorical attributes are stored as arrays of selected option values.
  return Array.isArray(variableValue) && variableValue.some((v) => v === value);
};

type CategoricalBinPrompts = Extract<
  Stage,
  { type: 'CategoricalBin' }
>['prompts'][number];

// An empty array is treated as unset: a CheckboxGroup stage may leave `[]`
// behind when all options are deselected, and such a node would otherwise
// match no bin (matchVariableValue's some() returns false for []) *and*
// be filtered out of the drawer, making it invisible.
function hasValue(value: unknown): boolean {
  if (isNil(value)) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

export function isUncategorised(
  attributes: NcNode[typeof entityAttributesProperty],
  activePromptVariable: string | undefined,
  otherVariable: string | undefined,
) {
  const activeVarExists = activePromptVariable
    ? hasValue(attributes[activePromptVariable])
    : false;
  const otherVarExists = otherVariable
    ? hasValue(attributes[otherVariable])
    : false;

  return !activeVarExists && !otherVarExists;
}

export function useCategoricalBins() {
  const stageNodes = useStageSelector(getNetworkNodesForType);
  const { prompt } = usePrompts<CategoricalBinPrompts>();
  const {
    variable: activePromptVariable,
    bucketSortOrder,
    binSortOrder,
  } = prompt;

  const resolve = useResolveLocalizedString();
  const getVariableDefinition = useStageSelector(makeGetCodebookVariableById);
  const variableDefinition = getVariableDefinition(activePromptVariable);

  const categoricalOptions =
    variableDefinition && 'options' in variableDefinition
      ? variableDefinition.options!
      : [];

  // Calculate uncategorised nodes by filtering stageNodes to those that
  // don't have a value for either the active prompt variable or the other variable
  const uncategorisedNodes = stageNodes.filter((node) =>
    isUncategorised(
      node[entityAttributesProperty],
      activePromptVariable,
      prompt.otherVariable,
    ),
  );

  const sortedUncategorisedNodes = useSortedNodeList(
    uncategorisedNodes,
    bucketSortOrder,
  );
  // Within-bin node order is governed by binSortOrder (mirroring OrdinalBin);
  // bucketSortOrder is reserved for the drawer (uncategorised nodes).
  const sortBinNodes = useNodeSorter(stageNodes, binSortOrder);

  type Bin = {
    label: string;
    nodes: NcNode[];
    value: string | number | boolean | null;
    isOther: boolean;
  };

  const bins: Bin[] = categoricalOptions.map((option) => {
    // Filter nodes
    const nodes = stageNodes.filter((node) => {
      return matchVariableValue(node, activePromptVariable, option.value);
    });

    return {
      label: resolve(option.label).text,
      nodes: sortBinNodes(nodes),
      value: option.value,
      isOther: false,
    };
  });

  // Handle 'other' bin: the schema's prompt union proves otherOptionLabel
  // exists whenever otherVariable is set.
  if (prompt.otherVariable !== undefined) {
    const { otherVariable, otherOptionLabel } = prompt;
    const otherNodes = stageNodes.filter(
      (node) => !isNil(get(node, [entityAttributesProperty, otherVariable])),
    );

    bins.push({
      label: resolve(otherOptionLabel).text,
      nodes: sortBinNodes(otherNodes),
      value: null,
      isOther: true,
    });
  }

  return {
    bins,
    uncategorisedNodes: sortedUncategorisedNodes,
  };
}
