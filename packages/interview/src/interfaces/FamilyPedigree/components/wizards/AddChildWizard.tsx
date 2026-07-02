import type useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import {
  entityAttributesProperty,
  type FramingId,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';
import { FamilyPedigreeStoreBridge } from '~/interfaces/FamilyPedigree/FamilyPedigreeContext';
import type {
  CommitBatch,
  FamilyPedigreeStoreApi,
  VariableConfig,
} from '~/interfaces/FamilyPedigree/store';
import { getEdgeRelationshipType } from '~/interfaces/FamilyPedigree/utils/edgeUtils';
import { inferGameteProviders } from '~/interfaces/FamilyPedigree/utils/inferGameteProviders';

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
import { readBiologicalSex } from './transforms/personAttributes';

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
  openDialog: ReturnType<typeof useDialog>['openDialog'],
  store: FamilyPedigreeStoreApi,
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
        content: () => (
          <FamilyPedigreeStoreBridge store={store}>
            <PersonFields namespace="child" />
          </FamilyPedigreeStoreBridge>
        ),
      },
      {
        title: 'Biological parents',
        content: () => (
          <FamilyPedigreeStoreBridge store={store}>
            <BioTriadConfigProvider value={bioTriadConfig}>
              <BioTriadStep />
            </BioTriadConfigProvider>
          </FamilyPedigreeStoreBridge>
        ),
      },
      {
        title: 'Other parents',
        content: () => (
          <FamilyPedigreeStoreBridge store={store}>
            <GenericOtherParentsStep />
          </FamilyPedigreeStoreBridge>
        ),
      },
      {
        title: 'Additional parents',
        content: () => (
          <FamilyPedigreeStoreBridge store={store}>
            <GenericAdditionalParentsStep />
          </FamilyPedigreeStoreBridge>
        ),
        skip: ({ getFieldValue }) => getFieldValue('hasOtherParents') !== true,
      },
      {
        title: 'Parent partnerships',
        content: () => (
          <FamilyPedigreeStoreBridge store={store}>
            <BioTriadConfigProvider value={bioTriadConfig}>
              <NewParentPartnershipsStep />
            </BioTriadConfigProvider>
          </FamilyPedigreeStoreBridge>
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
