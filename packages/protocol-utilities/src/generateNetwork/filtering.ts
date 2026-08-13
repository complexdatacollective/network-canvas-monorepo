import { filter as getFilter } from '@codaco/network-query';
import type { Filter, Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
  type NcNode,
} from '@codaco/shared-consts';

import type { GenerationContext, NetworkDraft } from './context';
import { getNodesOfType } from './edges';

export function buildCurrentNetwork(draft: NetworkDraft): NcNetwork {
  return {
    ego: {
      [entityPrimaryKeyProperty]: draft.egoUid,
      [entityAttributesProperty]: draft.egoAttributes,
    },
    nodes: draft.nodes,
    edges: draft.edges,
  };
}

function getStageFilter(stage: Stage): Filter | undefined {
  return 'filter' in stage ? stage.filter : undefined;
}

export function getStageFilteredNodes(
  ctx: GenerationContext,
  draft: NetworkDraft,
  stage: Stage,
  nodeType: string,
): NcNode[] {
  if (!ctx.respectSkipLogicAndFiltering) {
    return getNodesOfType(draft.nodes, nodeType);
  }

  const stageFilter = getStageFilter(stage);
  if (!stageFilter) return getNodesOfType(draft.nodes, nodeType);

  const filtered = getFilter(stageFilter)(buildCurrentNetwork(draft));
  return getNodesOfType(filtered.nodes, nodeType);
}
