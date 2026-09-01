import type { FramingId } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import type { OpenPedigreeDialog } from '../../familyPedigreeDialog';
import type { CommitBatch, VariableConfig } from '../../store';
import { getEdgeRelationshipType } from '../../utils/edgeUtils';
import { inferGameteProviders } from '../../utils/inferGameteProviders';
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
import {
  readBiologicalSex,
  runFamilyPedigreeTransform,
} from './transforms/personAttributes';

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

  const candidates = [anchorNodeId, ...partnerIds];
  const [a, b] = candidates;

  // Positional default (today's behaviour): first candidate → egg, second →
  // sperm, egg parent carries.
  const fallback: BioTriadConfig['preselection'] = {};
  if (a) {
    fallback.eggSource = a;
  }
  if (b) {
    fallback.spermSource = b;
  }

  // With two candidates, refine the assignment from their biological sex; the
  // helper defers to the positional default when it cannot infer.
  if (a && b) {
    const sexOf = (id: string) =>
      readBiologicalSex(
        nodes.get(id)?.[entityAttributesProperty][
          variableConfig.biologicalSexVariable
        ],
      );
    return inferGameteProviders(
      { value: a, sex: sexOf(a) },
      { value: b, sex: sexOf(b) },
      fallback,
    );
  }

  return fallback;
}

export async function openAddChildWizard(
  openDialog: OpenPedigreeDialog,
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
    gameteRoles: nominatedGameteRoles(edges, variableConfig),
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
      return runFamilyPedigreeTransform(() =>
        childCellTransform(
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
