import type useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { NcEdge, NcNode } from '@codaco/shared-consts';
import type {
  CommitBatch,
  VariableConfig,
} from '~/interfaces/FamilyPedigree/store';

import PersonFields from '../quickStartWizard/PersonFields';
import { buildNodeOptions } from './buildNodeOptions';
import { derivePreselection } from './derivePreselection';
import {
  geneticParentCandidates,
  nominatedGameteRoles,
} from './parentCandidates';
import BioTriadStep, { BioTriadConfigProvider } from './steps/BioTriadStep';
import GenericAdditionalParentsStep from './steps/GenericAdditionalParentsStep';
import GenericOtherParentsStep from './steps/GenericOtherParentsStep';
import NewParentPartnershipsStep, {
  shouldSkipNewParentPartnerships,
} from './steps/NewParentPartnershipsStep';
import { siblingCellTransform } from './transforms/siblingCellTransform';

function PersonDetailsStep() {
  return <PersonFields namespace="sibling" />;
}

export async function openAddSiblingWizard(
  openDialog: ReturnType<typeof useDialog>['openDialog'],
  anchorNodeId: string,
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): Promise<CommitBatch | null> {
  const preselection = derivePreselection(anchorNodeId, edges, variableConfig);
  const candidateIds = geneticParentCandidates(
    anchorNodeId,
    'sibling',
    edges,
    variableConfig,
  );
  const existingNodes = buildNodeOptions(
    nodes,
    edges,
    variableConfig,
    candidateIds,
  );

  const bioTriadConfig = {
    existingNodes,
    preselection,
    gameteRoles: nominatedGameteRoles(edges),
  };

  function WrappedBioTriadStep() {
    return (
      <BioTriadConfigProvider value={bioTriadConfig}>
        <BioTriadStep />
      </BioTriadConfigProvider>
    );
  }

  function WrappedPartnershipsStep() {
    return (
      <BioTriadConfigProvider value={bioTriadConfig}>
        <NewParentPartnershipsStep />
      </BioTriadConfigProvider>
    );
  }

  const result = await openDialog({
    type: 'wizard',
    title: 'Add sibling',
    progress: null,
    steps: [
      {
        title: 'Sibling details',
        content: PersonDetailsStep,
      },
      {
        title: 'Biological parents',
        content: WrappedBioTriadStep,
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
        content: WrappedPartnershipsStep,
        skip: shouldSkipNewParentPartnerships,
      },
    ],
    onFinish: (formValues: Record<string, unknown>) => {
      return siblingCellTransform(
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
