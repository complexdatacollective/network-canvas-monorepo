import type useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { FramingId, NcEdge, NcNode } from '@codaco/shared-consts';
import type {
  CommitBatch,
  VariableConfig,
} from '~/interfaces/FamilyPedigree/store';
import { getEdgeRelationshipType } from '~/interfaces/FamilyPedigree/utils/edgeUtils';

import PersonFields from '../quickStartWizard/PersonFields';
import { buildNodeOptions } from './buildNodeOptions';
import {
  geneticParentCandidates,
  nominatedGameteRoles,
} from './parentCandidates';
import BioTriadStep, {
  type BioTriadConfig,
  BioTriadConfigProvider,
} from './steps/BioTriadStep';
import GenericAdditionalParentsStep from './steps/GenericAdditionalParentsStep';
import GenericOtherParentsStep from './steps/GenericOtherParentsStep';
import NewParentPartnershipsStep, {
  shouldSkipNewParentPartnerships,
} from './steps/NewParentPartnershipsStep';
import { childCellTransform } from './transforms/childCellTransform';

function getPreselection(
  anchorNodeId: string,
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): BioTriadConfig['preselection'] {
  const partnerIds: string[] = [];
  for (const edge of edges.values()) {
    if (
      getEdgeRelationshipType(edge, variableConfig.relationshipTypeVariable) !==
      'partner'
    )
      continue;
    if (edge.from === anchorNodeId) partnerIds.push(edge.to);
    else if (edge.to === anchorNodeId) partnerIds.push(edge.from);
  }

  const preselection: BioTriadConfig['preselection'] = {};
  const candidates = [anchorNodeId, ...partnerIds];

  // Assign the first two candidates as egg source and sperm source.
  // Default the egg source as the carrier.
  if (candidates[0]) {
    preselection.eggSource = candidates[0];
    preselection.carrier = 'egg-source';
  }
  if (candidates[1]) {
    preselection.spermSource = candidates[1];
  }

  return preselection;
}

export async function openAddChildWizard(
  openDialog: ReturnType<typeof useDialog>['openDialog'],
  anchorNodeId: string,
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
  framing: FramingId,
): Promise<CommitBatch | null> {
  const preselection = getPreselection(
    anchorNodeId,
    nodes,
    edges,
    variableConfig,
  );
  const candidateIds = geneticParentCandidates(
    anchorNodeId,
    'child',
    edges,
    variableConfig,
  );
  const existingNodes = buildNodeOptions(
    nodes,
    edges,
    variableConfig,
    candidateIds,
    framing,
  );
  const bioTriadConfig = {
    existingNodes,
    preselection,
    gameteRoles: nominatedGameteRoles(edges),
  };

  const result = await openDialog({
    type: 'wizard',
    title: 'Add child',
    progress: null,
    steps: [
      {
        title: 'Child details',
        content: () => <PersonFields namespace="child" />,
      },
      {
        title: 'Biological parents',
        content: () => (
          <BioTriadConfigProvider value={bioTriadConfig}>
            <BioTriadStep />
          </BioTriadConfigProvider>
        ),
      },
      {
        title: 'Other parents',
        content: GenericOtherParentsStep,
      },
      {
        title: 'Additional parents',
        content: GenericAdditionalParentsStep,
        skip: ({ getFieldValue }) => getFieldValue('hasOtherParents') !== true,
      },
      {
        title: 'Parent partnerships',
        content: () => (
          <BioTriadConfigProvider value={bioTriadConfig}>
            <NewParentPartnershipsStep />
          </BioTriadConfigProvider>
        ),
        skip: shouldSkipNewParentPartnerships,
      },
    ],
    onFinish: (formValues: Record<string, unknown>) => {
      return childCellTransform(
        formValues,
        anchorNodeId,
        nodes,
        edges,
        variableConfig,
      );
    },
  });

  if (
    result &&
    typeof result === 'object' &&
    'nodes' in result &&
    'edges' in result
  ) {
    return result as CommitBatch;
  }

  return null;
}
