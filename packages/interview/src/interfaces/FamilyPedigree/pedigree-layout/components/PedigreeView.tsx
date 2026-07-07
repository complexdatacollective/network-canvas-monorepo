'use client';

import { invariant } from 'es-toolkit';
import { useContext } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Node from '@codaco/fresco-ui/Node';
import type { NcEdge, NcNode, VariableValue } from '@codaco/shared-consts';
import { useNodeMeasurement } from '~/hooks/useNodeMeasurement';
import { useStageSelector } from '~/hooks/useStageSelector';
import AddPersonFields from '~/interfaces/FamilyPedigree/components/AddPersonForm';
import PersonFields from '~/interfaces/FamilyPedigree/components/quickStartWizard/PersonFields';
import { openAddChildWizard } from '~/interfaces/FamilyPedigree/components/wizards/AddChildWizard';
import { openAddParentWizard } from '~/interfaces/FamilyPedigree/components/wizards/AddParentWizard';
import { openAddSiblingWizard } from '~/interfaces/FamilyPedigree/components/wizards/AddSiblingWizard';
import { openDefineParentsWizard } from '~/interfaces/FamilyPedigree/components/wizards/DefineParentsWizard';
import {
  addableParentTypeOptions,
  countGeneticParents,
} from '~/interfaces/FamilyPedigree/components/wizards/parentTypeOptions';
import {
  FamilyPedigreeContext,
  FamilyPedigreeStoreBridge,
  useFamilyPedigreeStore,
} from '~/interfaces/FamilyPedigree/FamilyPedigreeContext';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';
import {
  getEdgeRelationshipType,
  getEdgeTypeKey,
  getGameteRoleVariable,
  getIsActiveVariable,
  getIsGestationalCarrierVariable,
  getRelationshipTypeVariable,
} from '~/interfaces/FamilyPedigree/utils/edgeUtils';
import {
  getBiologicalSexVariable,
  getEgoVariable,
  getNodeLabelVariable,
  getNodeTypeKey,
  getRelationshipVariable,
  getResolvedNodeFormFields,
} from '~/interfaces/FamilyPedigree/utils/nodeUtils';

import NodeContextMenu, { type NodeContextMenuAction } from './NodeContextMenu';
import PedigreeLayout from './PedigreeLayout';
import PedigreeNode, { computeNodeDisplayLabels } from './PedigreeNode';

type PedigreeViewProps = {
  overrideNodes?: Map<string, NcNode>;
  overrideEdges?: Map<string, NcEdge>;
  activeNominationVariable?: string | null;
  onToggleAttribute?: (nodeId: string, variable: string) => void;
  isFinalized?: boolean;
};

export default function PedigreeView({
  overrideNodes,
  overrideEdges,
  activeNominationVariable: activeNominationVariableProp,
  onToggleAttribute,
  isFinalized = false,
}: PedigreeViewProps = {}) {
  const familyPedigreeStore = useContext(FamilyPedigreeContext);
  invariant(
    familyPedigreeStore,
    'PedigreeView must be used within a FamilyPedigreeProvider',
  );

  const storeNodes = useFamilyPedigreeStore((s) => s.network.nodes);
  const storeEdges = useFamilyPedigreeStore((s) => s.network.edges);
  const storeActiveNominationVariable = useFamilyPedigreeStore(
    (s) => s.activeNominationVariable,
  );
  const storeFraming = useFamilyPedigreeStore((s) => s.framing);

  const nodes = overrideNodes ?? storeNodes;
  const edges = overrideEdges ?? storeEdges;
  const activeNominationVariable =
    activeNominationVariableProp ?? storeActiveNominationVariable;

  const addNode = useFamilyPedigreeStore((s) => s.addNode);
  const addEdge = useFamilyPedigreeStore((s) => s.addEdge);
  const updateNode = useFamilyPedigreeStore((s) => s.updateNode);
  const removeNode = useFamilyPedigreeStore((s) => s.removeNode);
  const commitBatch = useFamilyPedigreeStore((s) => s.commitBatch);

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
  const gameteRoleVariable = useStageSelector(getGameteRoleVariable);
  const biologicalSexVariable = useStageSelector(getBiologicalSexVariable);
  const resolvedFormFields = useStageSelector(getResolvedNodeFormFields);

  const variableConfig: VariableConfig = {
    nodeType,
    edgeType,
    nodeLabelVariable,
    egoVariable,
    relationshipVariable,
    relationshipTypeVariable,
    isActiveVariable,
    isGestationalCarrierVariable,
    gameteRoleVariable,
    biologicalSexVariable,
  };

  const { openDialog } = useDialog();

  const { nodeWidth, nodeHeight, measurementContainer } = useNodeMeasurement({
    component: <Node size="sm" />,
  });

  const handleAddPerson = async (nodeId: string) => {
    const result = await openDialog({
      type: 'form',
      title: 'Add partner',
      submitLabel: 'Add',
      cancelLabel: 'Cancel',
      children: (
        <FamilyPedigreeStoreBridge store={familyPedigreeStore}>
          <AddPersonFields
            anchorNodeId={nodeId}
            nodes={nodes}
            edges={edges}
            variableConfig={variableConfig}
          />
        </FamilyPedigreeStoreBridge>
      ),
    });

    if (!result) return;

    if (
      result.partnerType === 'existing' &&
      typeof result.existingPartnerId === 'string'
    ) {
      addEdge({
        from: nodeId,
        to: result.existingPartnerId,
        attributes: {
          [relationshipTypeVariable]: ['partner'],
          [isActiveVariable]: result.current !== 'ex',
        },
      });
      return;
    }

    const name = typeof result.name === 'string' ? result.name : '';

    const formAttrs: Record<string, VariableValue> = {};
    for (const field of resolvedFormFields) {
      if (result[field.variableId] !== undefined) {
        formAttrs[field.variableId] = result[field.variableId] as VariableValue;
      }
    }

    const newNodeId = addNode({
      attributes: {
        [nodeLabelVariable]: name,
        [egoVariable]: false,
        ...formAttrs,
      },
    });

    addEdge({
      from: nodeId,
      to: newNodeId,
      attributes: {
        [relationshipTypeVariable]: ['partner'],
        [isActiveVariable]: result.current !== 'ex',
      },
    });

    for (const [key, value] of Object.entries(result)) {
      if (!key.startsWith('parentType-')) continue;
      const childId = key.replace('parentType-', '');
      if (
        value === 'biological' ||
        value === 'social' ||
        value === 'donor' ||
        value === 'surrogate'
      ) {
        addEdge({
          from: newNodeId,
          to: childId,
          attributes: {
            [relationshipTypeVariable]: [value],
            [isActiveVariable]: true,
          },
        });
      }
    }
  };

  const handleEdit = async (nodeId: string) => {
    const currentNode = nodes.get(nodeId);
    if (!currentNode) return;

    const currentName =
      typeof currentNode.attributes[nodeLabelVariable] === 'string'
        ? currentNode.attributes[nodeLabelVariable]
        : '';

    const result = await openDialog({
      type: 'form',
      title: 'Edit',
      submitLabel: 'Done',
      cancelLabel: 'Cancel',
      children: (
        <PersonFields
          initial={{ name: currentName, attributes: currentNode.attributes }}
        />
      ),
    });

    if (!result) return;

    const name = typeof result.name === 'string' ? result.name : '';

    const formAttrs: Record<string, VariableValue> = {};
    for (const field of resolvedFormFields) {
      if (result[field.variableId] !== undefined) {
        formAttrs[field.variableId] = result[field.variableId] as VariableValue;
      }
    }

    updateNode(nodeId, {
      ...currentNode.attributes,
      [nodeLabelVariable]: name,
      ...formAttrs,
    });
  };

  const handleAddChild = async (nodeId: string) => {
    const result = await openAddChildWizard(
      openDialog,
      familyPedigreeStore,
      nodeId,
      nodes,
      edges,
      variableConfig,
      // framing ?? 'gamete': safe fallback — per spec §4.1, when framing is null
      // only the intro/chooser steps render and no gamete-parent labels exist yet.
      storeFraming ?? 'gamete',
    );
    if (result) {
      commitBatch(result);
    }
  };

  const handleAddSibling = async (nodeId: string) => {
    const result = await openAddSiblingWizard(
      openDialog,
      familyPedigreeStore,
      nodeId,
      nodes,
      edges,
      variableConfig,
      storeFraming ?? 'gamete',
    );
    if (result) {
      commitBatch(result);
    }
  };

  const handleAddParent = async (nodeId: string) => {
    const geneticCount = countGeneticParents(nodeId, edges, variableConfig);

    const result =
      geneticCount >= 2
        ? await openAddParentWizard(
            openDialog,
            familyPedigreeStore,
            nodeId,
            nodes,
            edges,
            variableConfig,
            addableParentTypeOptions(nodeId, edges, variableConfig),
            storeFraming ?? 'gamete',
          )
        : await openDefineParentsWizard(
            openDialog,
            familyPedigreeStore,
            nodeId,
            nodes,
            edges,
            variableConfig,
            storeFraming ?? 'gamete',
          );

    if (result) {
      commitBatch(result);
    }
  };

  const handleDeleteNode = (nodeId: string) => {
    removeNode(nodeId);
  };

  const handleMenuAction = (nodeId: string, action: NodeContextMenuAction) => {
    if (action === 'edit') {
      void handleEdit(nodeId);
    } else if (action === 'child') {
      void handleAddChild(nodeId);
    } else if (action === 'sibling') {
      void handleAddSibling(nodeId);
    } else if (action === 'parent') {
      void handleAddParent(nodeId);
    } else if (action === 'delete') {
      handleDeleteNode(nodeId);
    } else {
      void handleAddPerson(nodeId);
    }
  };

  // framing ?? 'gamete': safe fallback — per spec §4.1, when framing is null
  // only the intro/chooser steps render and no gamete-parent labels exist yet.
  const displayLabels = computeNodeDisplayLabels(
    nodes,
    edges,
    variableConfig,
    storeFraming ?? 'gamete',
  );

  return (
    <div className="absolute inset-0 overflow-x-auto pt-6">
      {measurementContainer}
      <div className="relative flex min-h-full min-w-fit justify-center">
        <PedigreeLayout
          nodes={nodes}
          edges={edges}
          variableConfig={variableConfig}
          nodeWidth={nodeWidth}
          nodeHeight={nodeHeight}
          renderNode={(node) => {
            const isEgo = node.attributes[egoVariable] === true;
            const isAdopted = [...edges.values()].some(
              (e) =>
                e.to === node.id &&
                getEdgeRelationshipType(e, relationshipTypeVariable) ===
                  'adoptive',
            );

            return activeNominationVariable ? (
              <PedigreeNode
                node={node}
                isEgo={isEgo}
                displayLabel={displayLabels.get(node.id) ?? ''}
                allowDrag={false}
                isAdopted={isAdopted}
                selected={node.attributes[activeNominationVariable] === true}
                onClick={() =>
                  onToggleAttribute?.(node.id, activeNominationVariable)
                }
              />
            ) : (
              <NodeContextMenu
                canAddSibling={
                  isEgo ||
                  [...edges.values()].some(
                    (e) =>
                      e.to === node.id &&
                      getEdgeRelationshipType(e, relationshipTypeVariable) !==
                        'partner' &&
                      getEdgeRelationshipType(e, relationshipTypeVariable) !==
                        'social',
                  )
                }
                isEgo={isEgo}
                isFinalized={isFinalized}
                onAction={(action) => handleMenuAction(node.id, action)}
              >
                <PedigreeNode
                  node={node}
                  isEgo={isEgo}
                  displayLabel={displayLabels.get(node.id) ?? ''}
                  allowDrag={false}
                  isAdopted={isAdopted}
                />
              </NodeContextMenu>
            );
          }}
        />
      </div>
    </div>
  );
}
