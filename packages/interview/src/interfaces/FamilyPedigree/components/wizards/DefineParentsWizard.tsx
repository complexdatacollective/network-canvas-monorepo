import type useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { NcEdge, NcNode } from '@codaco/shared-consts';
import type {
  CommitBatch,
  VariableConfig,
} from '~/interfaces/FamilyPedigree/store';

import { buildNodeOptions } from './buildNodeOptions';
import { derivePreselection } from './derivePreselection';
import { geneticParentCandidates } from './parentCandidates';
import BioTriadStep, { BioTriadConfigProvider } from './steps/BioTriadStep';
import GenericAdditionalParentsStep from './steps/GenericAdditionalParentsStep';
import GenericOtherParentsStep from './steps/GenericOtherParentsStep';
import NewParentPartnershipsStep, {
  shouldSkipNewParentPartnerships,
} from './steps/NewParentPartnershipsStep';
import { defineParentsTransform } from './transforms/defineParentsTransform';

function getNodeDisplayName(
  nodeId: string,
  nodes: Map<string, NcNode>,
  variableConfig: VariableConfig,
): string {
  const node = nodes.get(nodeId);
  if (!node) return "This Person's";
  if (node.attributes[variableConfig.egoVariable] === true) return 'Your';
  const name = node.attributes[variableConfig.nodeLabelVariable];
  return typeof name === 'string' && name.length > 0
    ? `${name}'s`
    : "This Person's";
}

export async function openDefineParentsWizard(
  openDialog: ReturnType<typeof useDialog>['openDialog'],
  focalNodeId: string,
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): Promise<CommitBatch | null> {
  const displayName = getNodeDisplayName(focalNodeId, nodes, variableConfig);
  const title = `${displayName} Biological Parents`;

  const preselection = derivePreselection(focalNodeId, edges, variableConfig);
  const candidateIds = geneticParentCandidates(
    focalNodeId,
    'define-parents',
    edges,
    variableConfig,
  );
  const existingNodes = buildNodeOptions(
    nodes,
    edges,
    variableConfig,
    candidateIds,
  );

  const bioTriadConfig = { existingNodes, preselection };

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
    title,
    progress: null,
    steps: [
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
      return defineParentsTransform(formValues, focalNodeId, variableConfig);
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
