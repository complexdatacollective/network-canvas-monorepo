'use client';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Node from '@codaco/fresco-ui/Node';
import type { NcEdge, NcNode, VariableValue } from '@codaco/shared-consts';
import { useNodeMeasurement } from '~/hooks/useNodeMeasurement';
import { useStageSelector } from '~/hooks/useStageSelector';
import AddPersonFields from '~/interfaces/FamilyPedigree/components/AddPersonForm';
import { openAddChildWizard } from '~/interfaces/FamilyPedigree/components/wizards/AddChildWizard';
import { openAddParentWizard } from '~/interfaces/FamilyPedigree/components/wizards/AddParentWizard';
import { openAddSiblingWizard } from '~/interfaces/FamilyPedigree/components/wizards/AddSiblingWizard';
import { openDefineParentsWizard } from '~/interfaces/FamilyPedigree/components/wizards/DefineParentsWizard';
import {
  addableParentTypeOptions,
  countGeneticParents,
} from '~/interfaces/FamilyPedigree/components/wizards/parentTypeOptions';
import { useFamilyPedigreeStore } from '~/interfaces/FamilyPedigree/FamilyPedigreeProvider';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';
import {
  getEdgeTypeKey,
  getIsActiveVariable,
  getIsGestationalCarrierVariable,
  getRelationshipTypeVariable,
} from '~/interfaces/FamilyPedigree/utils/edgeUtils';
import {
  getEgoVariable,
  getNodeLabelVariable,
  getNodeTypeKey,
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
  const storeNodes = useFamilyPedigreeStore((s) => s.network.nodes);
  const storeEdges = useFamilyPedigreeStore((s) => s.network.edges);
  const storeActiveNominationVariable = useFamilyPedigreeStore(
    (s) => s.activeNominationVariable,
  );

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
  const relationshipTypeVariable = useStageSelector(
    getRelationshipTypeVariable,
  );
  const isActiveVariable = useStageSelector(getIsActiveVariable);
  const isGestationalCarrierVariable = useStageSelector(
    getIsGestationalCarrierVariable,
  );
  const resolvedFormFields = useStageSelector(getResolvedNodeFormFields);

  const variableConfig: VariableConfig = {
    nodeType,
    edgeType,
    nodeLabelVariable,
    egoVariable,
    relationshipTypeVariable,
    isActiveVariable,
    isGestationalCarrierVariable,
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
        <AddPersonFields
          anchorNodeId={nodeId}
          nodes={nodes}
          edges={edges}
          variableConfig={variableConfig}
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
        [relationshipTypeVariable]: 'partner',
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
            [relationshipTypeVariable]: value,
            [isActiveVariable]: true,
          },
        });
      }
    }
  };

  const handleEditName = async (nodeId: string) => {
    const currentNode = nodes.get(nodeId);
    const currentName =
      typeof currentNode?.attributes[nodeLabelVariable] === 'string'
        ? currentNode.attributes[nodeLabelVariable]
        : '';

    const result = await openDialog({
      type: 'form',
      title: 'Edit name',
      submitLabel: 'Done',
      cancelLabel: 'Cancel',
      children: (
        <Field
          name="name"
          label="Name"
          component={InputField}
          initialValue={currentName}
          hint="Leave blank if the name is not known"
          autoFocus
        />
      ),
    });

    if (!result) return;

    const name = typeof result.name === 'string' ? result.name : '';
    if (!currentNode) return;
    updateNode(nodeId, {
      ...currentNode.attributes,
      [nodeLabelVariable]: name,
    });
  };

  const handleAddChild = async (nodeId: string) => {
    const result = await openAddChildWizard(
      openDialog,
      nodeId,
      nodes,
      edges,
      variableConfig,
    );
    if (result) {
      commitBatch(result);
    }
  };

  const handleAddSibling = async (nodeId: string) => {
    const result = await openAddSiblingWizard(
      openDialog,
      nodeId,
      nodes,
      edges,
      variableConfig,
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
            nodeId,
            nodes,
            edges,
            variableConfig,
            addableParentTypeOptions(geneticCount),
          )
        : await openDefineParentsWizard(
            openDialog,
            nodeId,
            nodes,
            edges,
            variableConfig,
          );

    if (result) {
      commitBatch(result);
    }
  };

  const handleDeleteNode = (nodeId: string) => {
    removeNode(nodeId);
  };

  const handleMenuAction = (nodeId: string, action: NodeContextMenuAction) => {
    if (action === 'editName') {
      void handleEditName(nodeId);
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

  const displayLabels = computeNodeDisplayLabels(nodes, edges, variableConfig);

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
                e.attributes[relationshipTypeVariable] === 'adoptive',
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
                      e.attributes[relationshipTypeVariable] !== 'partner' &&
                      e.attributes[relationshipTypeVariable] !== 'social',
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
