'use client';

import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl, AppMessage } from '@codaco/app-i18n/react';
import type { SkipContext } from '@codaco/fresco-ui/dialogs/DialogProvider';
import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldGroup from '@codaco/fresco-ui/form/FieldGroup';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import type { FramingId, RelationshipType } from '@codaco/protocol-validation';
import type { NcEdge, NcNode, VariableValue } from '@codaco/shared-consts';

import type { OpenPedigreeDialog } from '../../familyPedigreeDialog';
import { messages } from '../../messages';
import { getNodeLabel } from '../../pedigree-layout/utils/getDisplayLabel';
import type { CommitBatch, VariableConfig } from '../../store';
import { getEdgeRelationshipType } from '../../utils/edgeUtils';
import { writeOwnAttribute } from '../../utils/writeOwnAttributes';
import {
  parentEdgeTypeOptions,
  type ParentEdgeTypeOption,
} from '../quickStartWizard/fieldOptions';
import PersonFields from '../quickStartWizard/PersonFields';
import { socialParentCandidates } from './parentCandidates';
import type { BioTriadOption } from './steps/bioTriadOptions';
import {
  extractCustomAttributes,
  runFamilyPedigreeTransform,
} from './transforms/personAttributes';

function ParentDetailsStep({
  parentTypeOptions,
  candidateOptions,
}: {
  parentTypeOptions: ParentEdgeTypeOption[];
  candidateOptions: BioTriadOption[];
}) {
  const intl = useAppIntl();
  const selectionOptions = [
    ...candidateOptions.map((option) => ({
      ...option,
      label: option.getLabel?.(intl) ?? option.label,
    })),
    { value: 'new', label: intl.formatMessage(messages.createNewPerson) },
  ];
  const onlyNew =
    selectionOptions.length === 1 && selectionOptions[0]?.value === 'new';
  return (
    <>
      {onlyNew ? (
        <div className="hidden">
          <Field
            name="parent-selection"
            label={intl.formatMessage(messages.whoParent)}
            component={RadioGroupField}
            options={[{ value: 'new', label: 'new' }]}
            initialValue="new"
          />
        </div>
      ) : (
        <Field
          name="parent-selection"
          label={intl.formatMessage(messages.whoParent)}
          hint={intl.formatMessage(messages.selectExistingPerson)}
          component={RadioGroupField}
          options={selectionOptions.map(({ label, ...option }) => ({
            ...option,
            label: <>{label}</>,
          }))}
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
        label={intl.formatMessage(messages.parentType)}
        component={RichSelectGroupField}
        options={parentEdgeTypeOptions(intl).filter((option) =>
          parentTypeOptions.some(({ value }) => value === option.value),
        )}
        initialValue={parentTypeOptions[0]?.value ?? 'social'}
        required
      />
    </>
  );
}

function ExistingParentPartnershipsStep({
  existingParents,
}: {
  existingParents: { id: string; getLabel: (intl: IntlShape) => string }[];
}) {
  const intl = useAppIntl();
  const partnershipOptions = [
    { value: 'current', label: intl.formatMessage(messages.currentPartners) },
    { value: 'ex', label: intl.formatMessage(messages.exPartners) },
    { value: 'none', label: intl.formatMessage(messages.neverPartners) },
  ];

  if (existingParents.length === 0) return null;

  return (
    <>
      {existingParents.map((parent) => (
        <Field
          key={`partnership-${parent.id}`}
          name={`partnership-${parent.id}`}
          label={
            <AppMessage
              message={messages.newParentAndPartner}
              values={{ name: parent.getLabel(intl) }}
            />
          }
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
    writeOwnAttribute(
      edgeAttributes,
      variableConfig.isGestationalCarrierVariable,
      true,
    );
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
  openDialog: OpenPedigreeDialog,
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
        getLabel: (intl: IntlShape) =>
          getNodeLabel(id, nodes, edges, variableConfig, framing, intl),
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
      getLabel: (intl: IntlShape) =>
        getNodeLabel(id, nodes, edges, variableConfig, framing, intl),
    }));

  const result = await openDialog({
    type: 'wizard',
    title: <AppMessage message={messages.addParent} />,
    progress: null,
    steps: [
      {
        title: <AppMessage message={messages.parentDetails} />,
        content: () => (
          <ParentDetailsStep
            parentTypeOptions={parentTypeOptions}
            candidateOptions={candidateOptions}
          />
        ),
      },
      {
        title: <AppMessage message={messages.partnerships} />,
        content: () => (
          <ExistingParentPartnershipsStep existingParents={existingParents} />
        ),
        skip: (_ctx: SkipContext) => existingParentIds.length === 0,
      },
    ],
    onFinish: (formValues: Record<string, unknown>) => {
      return runFamilyPedigreeTransform(() =>
        transformToCommitBatch(formValues, anchorNodeId, edges, variableConfig),
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
