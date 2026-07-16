import { invariant, isNil } from 'es-toolkit';

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { usePrompts } from '../../components/Prompts/usePrompts';
import useSortedNodeList from '../../hooks/useSortedNodeList';
import { useStageSelector } from '../../hooks/useStageSelector';
import { makeGetCodebookVariableById } from '../../selectors/protocol';
import { getNetworkNodesForType } from '../../selectors/session';

export type OrdinalBinItem = {
  label: string;
  value: string | number | boolean;
  nodes: NcNode[];
};

type OrdinalBinPrompts = Extract<
  Stage,
  { type: 'OrdinalBin' }
>['prompts'][number];

// A node is unplaced when its value is nil OR when its non-null value does not
// match any current option (e.g. value 5 while options define 1-4, arising from
// option-set reduction across a migration or imported roster data). Without the
// latter case such a node would render in no bin yet be excluded from the
// unplaced set, silently disappearing while the stage falsely reads complete.
export function isUnplaced(
  value: VariableValue | undefined,
  optionValues: OrdinalBinItem['value'][],
): boolean {
  if (isNil(value)) return true;
  return !optionValues.some((optionValue) => optionValue === value);
}

export function useOrdinalBins() {
  const stageNodes = useStageSelector(getNetworkNodesForType);
  const {
    prompt: { variable: activePromptVariable, bucketSortOrder },
  } = usePrompts<OrdinalBinPrompts>();

  const getVariableDefinition = useStageSelector(makeGetCodebookVariableById);
  const variableDefinition = getVariableDefinition(activePromptVariable);

  invariant(
    variableDefinition?.type === 'ordinal',
    `Variable with ID ${activePromptVariable} is not an ordinal variable`,
  );

  const ordinalOptions = variableDefinition.options;

  const bins: OrdinalBinItem[] = ordinalOptions.map((option) => {
    const nodes = stageNodes.filter((node) => {
      const attrValue = node[entityAttributesProperty][activePromptVariable];
      return (
        attrValue !== undefined &&
        attrValue !== null &&
        attrValue === option.value
      );
    });

    return {
      label: option.label,
      value: option.value,
      nodes,
    };
  });

  const optionValues = ordinalOptions.map((option) => option.value);

  const unplacedNodes = stageNodes.filter((node) =>
    isUnplaced(
      node[entityAttributesProperty][activePromptVariable],
      optionValues,
    ),
  );

  const sortedUnplacedNodes = useSortedNodeList(unplacedNodes, bucketSortOrder);

  return {
    bins,
    unplacedNodes: sortedUnplacedNodes,
  };
}
