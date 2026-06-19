'use client';

import Field from '@codaco/fresco-ui/form/Field/Field';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import type { NcEdge, NcNode } from '@codaco/shared-consts';
import { getNodeLabel } from '~/interfaces/FamilyPedigree/pedigree-layout/utils/getDisplayLabel';
import { getEdgeRelationshipType } from '~/interfaces/FamilyPedigree/utils/edgeUtils';

import type { VariableConfig } from '../store';
import PersonFields from './quickStartWizard/PersonFields';
import { addableParentTypeOptions } from './wizards/parentTypeOptions';

const CURRENT_EX_OPTIONS = [
  { value: 'current', label: 'Current' },
  { value: 'ex', label: 'Ex' },
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

  return (
    <>
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
          label={`Is this person also a parent of **${getNodeLabel(childId, nodes, edges, variableConfig)}**?`}
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
    </>
  );
}
