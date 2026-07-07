'use client';

import type { SkipContext } from '@codaco/fresco-ui/dialogs/DialogProvider';
import type useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldGroup from '@codaco/fresco-ui/form/FieldGroup';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import type {
  FramingId,
  NcEdge,
  NcNode,
  RelationshipType,
  VariableValue,
} from '@codaco/shared-consts';
import { FamilyPedigreeStoreBridge } from '~/interfaces/FamilyPedigree/FamilyPedigreeContext';
import { getNodeLabel } from '~/interfaces/FamilyPedigree/pedigree-layout/utils/getDisplayLabel';
import type {
  CommitBatch,
  FamilyPedigreeStoreApi,
  VariableConfig,
} from '~/interfaces/FamilyPedigree/store';
import { getEdgeRelationshipType } from '~/interfaces/FamilyPedigree/utils/edgeUtils';

import type { ParentEdgeTypeOption } from '../quickStartWizard/fieldOptions';
import PersonFields from '../quickStartWizard/PersonFields';
import { socialParentCandidates } from './parentCandidates';
import { extractCustomAttributes } from './transforms/personAttributes';

const partnershipOptions = [
  { value: 'current', label: 'Current partners' },
  { value: 'ex', label: 'Ex-partners' },
  { value: 'none', label: 'Never partners' },
];

function ParentDetailsStep({
  parentTypeOptions,
  candidateOptions,
}: {
  parentTypeOptions: ParentEdgeTypeOption[];
  candidateOptions: { value: string; label: string }[];
}) {
  const selectionOptions = [
    ...candidateOptions,
    { value: 'new', label: 'Create a new person' },
  ];
  const onlyNew =
    selectionOptions.length === 1 && selectionOptions[0]?.value === 'new';
  return (
    <>
      {onlyNew ? (
        <div className="hidden">
          <Field
            name="parent-selection"
            label="Who is this parent?"
            component={RadioGroupField}
            options={[{ value: 'new', label: 'new' }]}
            initialValue="new"
          />
        </div>
      ) : (
        <Field
          name="parent-selection"
          label="Who is this parent?"
          hint="Select an existing person or create a new one."
          component={RadioGroupField}
          options={selectionOptions}
          initialValue="new"
          required
        />
      )}
      <FieldGroup
        watch={['parent-selection']}
        condition={(values) => values['parent-selection'] === 'new'}
      >
        <PersonFields namespace="parent" />
      </FieldGroup>
      <Field
        name="edgeType"
        label="Parent type"
        component={RichSelectGroupField}
        options={parentTypeOptions}
        initialValue={parentTypeOptions[0]?.value ?? 'social'}
        required
      />
    </>
  );
}

function ExistingParentPartnershipsStep({
  existingParents,
}: {
  existingParents: { id: string; label: string }[];
}) {
  if (existingParents.length === 0) return null;

  return (
    <>
      {existingParents.map((parent) => (
        <Field
          key={`partnership-${parent.id}`}
          name={`partnership-${parent.id}`}
          label={`Are the new parent and ${parent.label} partners?`}
          component={RadioGroupField}
          options={partnershipOptions}
          required
        />
      ))}
    </>
  );
}

function getExistingParentIds(
  anchorNodeId: string,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): string[] {
  const parentIds: string[] = [];
  for (const edge of edges.values()) {
    if (
      edge.to === anchorNodeId &&
      getEdgeRelationshipType(edge, variableConfig.relationshipTypeVariable) !==
        'partner'
    ) {
      parentIds.push(edge.from);
    }
  }
  return parentIds;
}

export function transformToCommitBatch(
  formValues: Record<string, unknown>,
  anchorNodeId: string,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): CommitBatch {
  const selection =
    (formValues['parent-selection'] as string | undefined) ?? 'new';
  const edgeType =
    (formValues.edgeType as RelationshipType | undefined) ?? 'biological';

  const edgeAttributes: Record<string, VariableValue> = {
    [variableConfig.relationshipTypeVariable]: [edgeType],
    [variableConfig.isActiveVariable]: true,
  };
  if (edgeType === 'surrogate') {
    edgeAttributes[variableConfig.isGestationalCarrierVariable] = true;
  }

  const batch: CommitBatch = { nodes: [], edges: [] };

  let parentRef: string;
  if (selection === 'new') {
    const parentValues = (formValues.parent ?? {}) as Record<string, unknown>;
    const name = (parentValues.name as string | undefined) ?? '';
    const customAttrs = extractCustomAttributes(parentValues);
    parentRef = '__new-parent__';
    batch.nodes.push({
      tempId: parentRef,
      data: {
        attributes: {
          [variableConfig.nodeLabelVariable]: name,
          [variableConfig.egoVariable]: false,
          ...customAttrs,
        },
      },
    });
  } else {
    parentRef = selection;
  }

  batch.edges.push({
    source: parentRef,
    target: anchorNodeId,
    data: { attributes: edgeAttributes },
  });

  const existingParentIds = getExistingParentIds(
    anchorNodeId,
    edges,
    variableConfig,
  );
  for (const parentId of existingParentIds) {
    const value = formValues[`partnership-${parentId}`] as string | undefined;
    if (value === 'current' || value === 'ex') {
      batch.edges.push({
        source: parentRef,
        target: parentId,
        data: {
          attributes: {
            [variableConfig.relationshipTypeVariable]: ['partner'],
            [variableConfig.isActiveVariable]: value === 'current',
          },
        },
      });
    }
  }

  return batch;
}

export async function openAddParentWizard(
  openDialog: ReturnType<typeof useDialog>['openDialog'],
  store: FamilyPedigreeStoreApi,
  anchorNodeId: string,
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
  parentTypeOptions: ParentEdgeTypeOption[],
  framing: FramingId,
): Promise<CommitBatch | null> {
  const existingParentIds = getExistingParentIds(
    anchorNodeId,
    edges,
    variableConfig,
  );
  const existingParents = existingParentIds
    .map((id) => {
      if (!nodes.has(id)) return null;
      return {
        id,
        label: getNodeLabel(id, nodes, edges, variableConfig, framing),
      };
    })
    .filter((p) => p !== null);

  const candidateOptions = [
    ...socialParentCandidates(anchorNodeId, nodes, edges, variableConfig),
  ]
    .filter((id) => nodes.has(id))
    .map((id) => ({
      value: id,
      label: getNodeLabel(id, nodes, edges, variableConfig, framing),
    }));

  const result = await openDialog({
    type: 'wizard',
    title: 'Add parent',
    progress: null,
    steps: [
      {
        title: 'Parent details',
        content: () => (
          <FamilyPedigreeStoreBridge store={store}>
            <ParentDetailsStep
              parentTypeOptions={parentTypeOptions}
              candidateOptions={candidateOptions}
            />
          </FamilyPedigreeStoreBridge>
        ),
      },
      {
        title: 'Partnerships',
        content: () => (
          <FamilyPedigreeStoreBridge store={store}>
            <ExistingParentPartnershipsStep existingParents={existingParents} />
          </FamilyPedigreeStoreBridge>
        ),
        skip: (_ctx: SkipContext) => existingParentIds.length === 0,
      },
    ],
    onFinish: (formValues: Record<string, unknown>) => {
      return transformToCommitBatch(
        formValues,
        anchorNodeId,
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
