import { useRef } from 'react';

import type { FramingId, NcEdge, NcNode } from '@codaco/shared-consts';
import { useCurrentStep } from '~/contexts/CurrentStepContext';
import { useStageSelector } from '~/hooks/useStageSelector';
import { useAppDispatch } from '~/store/store';

import { FamilyPedigreeContext } from './FamilyPedigreeContext';
import {
  createFamilyPedigreeStore,
  type FamilyPedigreeStoreApi,
  type NodeMetadata,
  type VariableConfig,
} from './store';
import {
  getEdgeTypeKey,
  getIsActiveVariable,
  getIsGestationalCarrierVariable,
  getRelationshipTypeVariable,
} from './utils/edgeUtils';
import {
  getEgoVariable,
  getNodeLabelVariable,
  getNodeTypeKey,
  getRelationshipVariable,
} from './utils/nodeUtils';
import { getFramingConfig } from './utils/stageConfig';

export const FamilyPedigreeProvider = ({
  nodes,
  edges,
  children,
}: {
  nodes: NcNode[];
  edges: NcEdge[];
  children: React.ReactNode;
}) => {
  const storeRef = useRef<FamilyPedigreeStoreApi>(undefined);
  const dispatch = useAppDispatch();
  const { currentStep } = useCurrentStep();

  const nodeType = useStageSelector(getNodeTypeKey);
  const edgeType = useStageSelector(getEdgeTypeKey);
  const nodeLabelVariable = useStageSelector(getNodeLabelVariable);
  const egoVariable = useStageSelector(getEgoVariable);
  const relationshipVariable = useStageSelector(getRelationshipVariable);
  const relationshipTypeVariable = useStageSelector(
    getRelationshipTypeVariable,
  );
  const isActiveVariable = useStageSelector(getIsActiveVariable);
  const isGestationalCarrierVariable = useStageSelector(
    getIsGestationalCarrierVariable,
  );
  const framingConfig = useStageSelector(getFramingConfig);
  const initialFraming: FramingId | null =
    framingConfig.mode === 'fixed' ? framingConfig.value : null;

  const variableConfig: VariableConfig = {
    nodeType,
    edgeType,
    nodeLabelVariable,
    egoVariable,
    relationshipVariable,
    relationshipTypeVariable,
    isActiveVariable,
    isGestationalCarrierVariable,
  };

  // The interview network is a single shared graph. Seed only the pedigree's
  // own node/edge types so the store works against the same entities it owns,
  // and remember which were already in Redux so finalize doesn't duplicate
  // them.
  const seededNodes = nodes.filter((node) => node.type === nodeType);
  const seededEdges = edges.filter((edge) => edge.type === edgeType);

  const initialNodes = new Map<string, NcNode>(
    seededNodes.map((node) => [node._uid, node]),
  );

  const initialEdges = new Map<string, NcEdge>(
    seededEdges.map((edge) => [edge._uid, edge]),
  );

  const initialNodeMetadata = new Map<string, NodeMetadata>(
    seededNodes.map((node) => [
      node._uid,
      { readOnly: node.attributes[egoVariable] === true },
    ]),
  );

  const preexistingReduxNodeIds = new Set(seededNodes.map((node) => node._uid));
  const preexistingReduxEdgeIds = new Set(seededEdges.map((edge) => edge._uid));

  storeRef.current ??= createFamilyPedigreeStore(
    initialNodes,
    initialEdges,
    initialNodeMetadata,
    variableConfig,
    dispatch,
    currentStep,
    preexistingReduxNodeIds,
    preexistingReduxEdgeIds,
    initialFraming,
  );

  return (
    <FamilyPedigreeContext.Provider value={storeRef.current}>
      {children}
    </FamilyPedigreeContext.Provider>
  );
};
