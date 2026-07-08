import type useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { entityAttributesProperty } from '@codaco/shared-consts';
import type { FramingId, NcEdge, NcNode } from '@codaco/shared-consts';
import { FamilyPedigreeStoreBridge } from '~/interfaces/FamilyPedigree/FamilyPedigreeContext';
import type {
  CommitBatch,
  FamilyPedigreeStoreApi,
  VariableConfig,
} from '~/interfaces/FamilyPedigree/store';

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
import { defineParentsTransform } from './transforms/defineParentsTransform';

function getNodeDisplayName(
  nodeId: string,
  nodes: Map<string, NcNode>,
  variableConfig: VariableConfig,
): string {
  const node = nodes.get(nodeId);
  if (!node) return "This Person's";
  if (node[entityAttributesProperty][variableConfig.egoVariable] === true)
    return 'Your';
  const name = node[entityAttributesProperty][variableConfig.nodeLabelVariable];
  return typeof name === 'string' && name.length > 0
    ? `${name}'s`
    : "This Person's";
}

export async function openDefineParentsWizard(
  openDialog: ReturnType<typeof useDialog>['openDialog'],
  store: FamilyPedigreeStoreApi,
  focalNodeId: string,
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
  framing: FramingId,
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
    framing,
  );

  const bioTriadConfig = {
    existingNodes,
    preselection,
    gameteRoles: nominatedGameteRoles(edges, variableConfig),
  };

  function WrappedBioTriadStep() {
    return (
      <FamilyPedigreeStoreBridge store={store}>
        <BioTriadConfigProvider value={bioTriadConfig}>
          <BioTriadStep />
        </BioTriadConfigProvider>
      </FamilyPedigreeStoreBridge>
    );
  }

  function WrappedPartnershipsStep() {
    return (
      <FamilyPedigreeStoreBridge store={store}>
        <BioTriadConfigProvider value={bioTriadConfig}>
          <NewParentPartnershipsStep />
        </BioTriadConfigProvider>
      </FamilyPedigreeStoreBridge>
    );
  }

  function WrappedGenericOtherParentsStep() {
    return (
      <FamilyPedigreeStoreBridge store={store}>
        <GenericOtherParentsStep />
      </FamilyPedigreeStoreBridge>
    );
  }

  function WrappedGenericAdditionalParentsStep() {
    return (
      <FamilyPedigreeStoreBridge store={store}>
        <GenericAdditionalParentsStep />
      </FamilyPedigreeStoreBridge>
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
        content: WrappedGenericOtherParentsStep,
      },
      {
        title: 'Additional parents',
        content: WrappedGenericAdditionalParentsStep,
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
