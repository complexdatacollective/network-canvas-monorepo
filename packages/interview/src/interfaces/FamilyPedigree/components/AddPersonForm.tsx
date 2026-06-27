'use client';

import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldGroup from '@codaco/fresco-ui/form/FieldGroup';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import type { NcEdge, NcNode } from '@codaco/shared-consts';
import { useFamilyPedigreeStore } from '~/interfaces/FamilyPedigree/FamilyPedigreeContext';
import { getNodeLabel } from '~/interfaces/FamilyPedigree/pedigree-layout/utils/getDisplayLabel';
import { getEdgeRelationshipType } from '~/interfaces/FamilyPedigree/utils/edgeUtils';

import type { VariableConfig } from '../store';
import PersonFields from './quickStartWizard/PersonFields';
import { buildNodeOptions } from './wizards/buildNodeOptions';
import { partnerCandidates } from './wizards/parentCandidates';
import { addableParentTypeOptions } from './wizards/parentTypeOptions';

const CURRENT_EX_OPTIONS = [
  { value: 'current', label: 'Current' },
  { value: 'ex', label: 'Ex' },
];

const PARTNER_TYPE_OPTIONS = [
  { value: 'existing', label: 'Yes — already in the family tree' },
  { value: 'new', label: 'No — add a new person' },
];

type AddPersonFieldsProps = {
  anchorNodeId: string;
  nodes: Map<string, NcNode>;
  edges: Map<string, NcEdge>;
  variableConfig: VariableConfig;
};

export default function AddPersonFields({
  anchorNodeId,
  nodes,
  edges,
  variableConfig,
}: AddPersonFieldsProps) {
  const framing = useFamilyPedigreeStore((s) => s.framing);
  const children = [...edges.values()]
    .filter(
      (edge) =>
        getEdgeRelationshipType(
          edge,
          variableConfig.relationshipTypeVariable,
        ) !== 'partner' && edge.from === anchorNodeId,
    )
    .map((edge) => edge.to)
    .filter((id) => nodes.has(id));

  const candidateIds = partnerCandidates(
    anchorNodeId,
    nodes,
    edges,
    variableConfig,
  );

  const existingPartnerOptions = buildNodeOptions(
    nodes,
    edges,
    variableConfig,
    candidateIds,
    framing ?? 'gamete',
  );

  return (
    <>
      <Field
        name="partnerType"
        label="Is this person already in your family tree / related to you?"
        component={RadioGroupField}
        options={PARTNER_TYPE_OPTIONS}
        initialValue="new"
      />

      <FieldGroup
        watch={['partnerType'] as const}
        condition={(v) => v.partnerType === 'existing'}
      >
        {existingPartnerOptions.length > 0 && (
          <Field
            name="existingPartnerId"
            label="Select the person"
            component={RadioGroupField}
            options={existingPartnerOptions}
            required
          />
        )}

        <Field
          name="current"
          label="Are they a current or ex partner?"
          component={RadioGroupField}
          options={CURRENT_EX_OPTIONS}
          initialValue="current"
        />
      </FieldGroup>

      <FieldGroup
        watch={['partnerType'] as const}
        condition={(v) => v.partnerType === 'new'}
      >
        <PersonFields />

        <Field
          name="current"
          label="Are they a current or ex partner?"
          component={RadioGroupField}
          options={CURRENT_EX_OPTIONS}
          initialValue="current"
        />

        {children.map((childId) => (
          <Field
            key={`parentType-${childId}`}
            name={`parentType-${childId}`}
            label={`Is this person also a parent of **${getNodeLabel(childId, nodes, edges, variableConfig, framing ?? 'gamete')}**?`}
            component={RichSelectGroupField}
            options={[
              {
                value: 'none',
                label: 'Not a parent',
                description: 'Select this if not a parent of this child',
              },
              ...addableParentTypeOptions(childId, edges, variableConfig),
            ]}
            initialValue="none"
          />
        ))}
      </FieldGroup>
    </>
  );
}
