import { AppMessage } from '@codaco/app-i18n/react';
import type { FramingId } from '@codaco/protocol-validation';
import type { NcEdge, NcNode } from '@codaco/shared-consts';

import type { OpenPedigreeDialog } from '../../familyPedigreeDialog';
import { messages } from '../../messages';
import type { CommitBatch, VariableConfig } from '../../store';
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
import { runFamilyPedigreeTransform } from './transforms/personAttributes';
import { siblingCellTransform } from './transforms/siblingCellTransform';

function PersonDetailsStep() {
  return <PersonFields namespace="sibling" />;
}

export async function openAddSiblingWizard(
  openDialog: OpenPedigreeDialog,
  anchorNodeId: string,
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
  framing: FramingId,
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
    framing,
  );

  const bioTriadConfig = {
    existingNodes,
    preselection,
    gameteRoles: nominatedGameteRoles(edges, variableConfig),
  };

  function BioTriadConfigStep() {
    return (
      <BioTriadConfigProvider value={bioTriadConfig}>
        <BioTriadStep />
      </BioTriadConfigProvider>
    );
  }

  function PartnershipsStep() {
    return (
      <BioTriadConfigProvider value={bioTriadConfig}>
        <NewParentPartnershipsStep />
      </BioTriadConfigProvider>
    );
  }

  const result = await openDialog({
    type: 'wizard',
    title: <AppMessage message={messages.addSibling} />,
    progress: null,
    steps: [
      {
        title: <AppMessage message={messages.siblingDetails} />,
        content: PersonDetailsStep,
      },
      {
        title: <AppMessage message={messages.biologicalParents} />,
        content: BioTriadConfigStep,
      },
      {
        title: <AppMessage message={messages.otherParents} />,
        content: GenericOtherParentsStep,
      },
      {
        title: <AppMessage message={messages.additionalParents} />,
        content: GenericAdditionalParentsStep,
        skip: ({ getFieldValue }) => getFieldValue('hasOtherParents') !== true,
      },
      {
        title: <AppMessage message={messages.parentPartnerships} />,
        content: PartnershipsStep,
        skip: shouldSkipNewParentPartnerships,
      },
    ],
    onFinish: (formValues: Record<string, unknown>) => {
      return runFamilyPedigreeTransform(() =>
        siblingCellTransform(
          formValues,
          anchorNodeId,
          nodes,
          edges,
          variableConfig,
        ),
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
