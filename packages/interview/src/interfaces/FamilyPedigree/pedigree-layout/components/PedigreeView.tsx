'use client';

import { invariant } from 'es-toolkit';
import { useContext } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import RadioMatrixField from '@codaco/fresco-ui/form/fields/RadioMatrixField';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import Node from '@codaco/fresco-ui/Node';
import { entityAttributesProperty } from '@codaco/shared-consts';
import type { NcEdge, NcNode, VariableValue } from '@codaco/shared-consts';

import { formValuesToAttributePatch } from '../../../../forms/formValuesToAttributePatch';
import { useNodeMeasurement } from '../../../../hooks/useNodeMeasurement';
import { useStageSelector } from '../../../../hooks/useStageSelector';
import AddPersonFields from '../../components/AddPersonForm';
import PersonFields from '../../components/quickStartWizard/PersonFields';
import { openAddChildWizard } from '../../components/wizards/AddChildWizard';
import { openAddParentWizard } from '../../components/wizards/AddParentWizard';
import { openAddSiblingWizard } from '../../components/wizards/AddSiblingWizard';
import { openDefineParentsWizard } from '../../components/wizards/DefineParentsWizard';
import {
  addableParentTypeOptions,
  countGeneticParents,
} from '../../components/wizards/parentTypeOptions';
import { readBiologicalSex } from '../../components/wizards/transforms/personAttributes';
import {
  FamilyPedigreeContext,
  FamilyPedigreeStoreBridge,
  useFamilyPedigreeStore,
} from '../../FamilyPedigreeContext';
import type { VariableConfig } from '../../store';
import {
  getEdgeRelationshipType,
  getEdgeTypeKey,
  getGameteRoleVariable,
  getIsActiveVariable,
  getIsGestationalCarrierVariable,
  getRelationshipTypeVariable,
} from '../../utils/edgeUtils';
import {
  getBiologicalSexVariable,
  getEgoVariable,
  getNodeLabelVariable,
  getNodeTypeKey,
  getRelationshipVariable,
  getResolvedNodeFormFields,
} from '../../utils/nodeUtils';
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

const INTERNAL_EDIT_NAMESPACE = '__familyPedigreeEdit';

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
  const updateEdge = useFamilyPedigreeStore((s) => s.updateEdge);
  const syncMetadata = useFamilyPedigreeStore((s) => s.syncMetadata);
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

  const { confirm, openDialog } = useDialog();

  const { nodeWidth, nodeHeight, measurementContainer } = useNodeMeasurement({
    component: <Node size="sm" />,
  });

  // framing ?? 'gamete': safe fallback — per spec §4.1, when framing is null
  // only the intro/chooser steps render and no gamete-parent labels exist yet.
  const displayLabels = computeNodeDisplayLabels(
    nodes,
    edges,
    variableConfig,
    storeFraming ?? 'gamete',
  );

  const handleAddPerson = async (
    nodeId: string,
  ): Promise<FormSubmissionResult | undefined> => {
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
      return { success: true };
    }

    const name = typeof result.name === 'string' ? result.name : '';

    const formPatchResult = formValuesToAttributePatch(
      result,
      resolvedFormFields.map((field) => field.variableId),
    );
    if (!formPatchResult.success) {
      return {
        success: false,
        formErrors: ['An error occurred while submitting the form.'],
      };
    }

    const formAttrs: Record<string, VariableValue> = {
      ...formPatchResult.patch.set,
    };
    const biologicalSex = readBiologicalSex(result.biologicalSex);
    if (biologicalSex) {
      formAttrs[biologicalSexVariable] = [biologicalSex];
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

    return { success: true };
  };

  const handleEdit = async (
    nodeId: string,
  ): Promise<FormSubmissionResult | undefined> => {
    const currentNode = nodes.get(nodeId);
    if (!currentNode) return;

    const currentName =
      typeof currentNode[entityAttributesProperty][nodeLabelVariable] ===
      'string'
        ? currentNode[entityAttributesProperty][nodeLabelVariable]
        : '';
    const partnerships = [...edges.entries()].flatMap(([edgeId, edge]) => {
      if (
        getEdgeRelationshipType(edge, relationshipTypeVariable) !== 'partner'
      ) {
        return [];
      }

      const partnerId =
        edge.from === nodeId ? edge.to : edge.to === nodeId ? edge.from : null;
      if (!partnerId) return [];

      return [
        {
          edgeId,
          partnerLabel: displayLabels.get(partnerId) ?? 'Unnamed person',
          status:
            edge[entityAttributesProperty][isActiveVariable] === false
              ? 'ex'
              : 'current',
        },
      ];
    });
    const displayName =
      currentName || displayLabels.get(nodeId) || 'this person';

    const result = await openDialog({
      type: 'form',
      title: 'Edit',
      submitLabel: 'Done',
      cancelLabel: 'Cancel',
      children: (
        <>
          <PersonFields
            currentEntityId={nodeId}
            initial={{
              name: currentName,
              biologicalSex: readBiologicalSex(
                currentNode[entityAttributesProperty][biologicalSexVariable],
              ),
              attributes: currentNode[entityAttributesProperty],
            }}
          />
          {partnerships.length > 0 && (
            <FieldNamespace prefix={INTERNAL_EDIT_NAMESPACE}>
              <Field
                name="partnerships"
                label={`Are these people current or ex-partners of **${displayName}**?`}
                component={RadioMatrixField}
                rows={partnerships.map(({ edgeId, partnerLabel }) => ({
                  id: edgeId,
                  label: partnerLabel,
                }))}
                options={[
                  { value: 'current', label: 'Current partner' },
                  { value: 'ex', label: 'Ex-partner' },
                ]}
                initialValue={partnerships.map(({ edgeId, status }) => ({
                  id: edgeId,
                  value: status,
                }))}
              />
            </FieldNamespace>
          )}
        </>
      ),
    });

    if (!result) return;

    const name = typeof result.name === 'string' ? result.name : '';

    const formPatchResult = formValuesToAttributePatch(
      result,
      resolvedFormFields.map((field) => field.variableId),
    );
    if (!formPatchResult.success) {
      return {
        success: false,
        formErrors: ['An error occurred while submitting the form.'],
      };
    }

    const set: Record<string, VariableValue> = {
      ...formPatchResult.patch.set,
      [nodeLabelVariable]: name,
    };
    const biologicalSex = readBiologicalSex(result.biologicalSex);
    if (biologicalSex) {
      set[biologicalSexVariable] = [biologicalSex];
    }

    const unset = biologicalSex
      ? formPatchResult.patch.unset
      : [...formPatchResult.patch.unset, biologicalSexVariable];

    updateNode(nodeId, {
      set,
      unset: unset.filter((fieldName) => !(fieldName in set)),
    });

    const internalResult = result[INTERNAL_EDIT_NAMESPACE];
    const partnershipUpdates =
      typeof internalResult === 'object' && internalResult !== null
        ? (internalResult as Record<string, unknown>).partnerships
        : undefined;
    let partnershipChanged = false;
    if (Array.isArray(partnershipUpdates)) {
      const editableEdgeIds = new Set(partnerships.map(({ edgeId }) => edgeId));
      for (const update of partnershipUpdates) {
        if (typeof update !== 'object' || update === null) continue;
        const { id, value } = update as Record<string, unknown>;
        if (
          typeof id !== 'string' ||
          !editableEdgeIds.has(id) ||
          (value !== 'current' && value !== 'ex')
        ) {
          continue;
        }
        await updateEdge(id, {
          [isActiveVariable]: value === 'current',
        });
        partnershipChanged = true;
      }
    }
    if (partnershipChanged && isFinalized) syncMetadata();
    return { success: true };
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

  const handleDeleteNode = async (nodeId: string) => {
    const node = nodes.get(nodeId);
    if (!node) return;
    const rawName = node[entityAttributesProperty][nodeLabelVariable];
    const name =
      typeof rawName === 'string' && rawName.length > 0
        ? rawName
        : displayLabels.get(nodeId) || 'this person';

    await confirm({
      title: `Delete ${name}?`,
      description:
        'This will delete this person and all of their relationships from the family pedigree. This action cannot be undone.',
      confirmLabel: 'Delete person',
      cancelLabel: 'Cancel',
      intent: 'destructive',
      onConfirm: () => {
        removeNode(nodeId);
      },
    });
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
      void handleDeleteNode(nodeId);
    } else {
      void handleAddPerson(nodeId);
    }
  };

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
            const isEgo = node[entityAttributesProperty][egoVariable] === true;
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
                selected={
                  node[entityAttributesProperty][activeNominationVariable] ===
                  true
                }
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
