'use client';

import type { ReactNode } from 'react';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldGroup from '@codaco/fresco-ui/form/FieldGroup';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import type { NcEdge, NcNode } from '@codaco/shared-consts';

import { useFamilyPedigreeStore } from '../FamilyPedigreeContext';
import { messages } from '../messages';
import { getNodeLabel } from '../pedigree-layout/utils/getDisplayLabel';
import type { VariableConfig } from '../store';
import { getEdgeRelationshipType } from '../utils/edgeUtils';
import PersonFields from './quickStartWizard/PersonFields';
import { buildNodeOptions } from './wizards/buildNodeOptions';
import { partnerCandidates } from './wizards/parentCandidates';
import { addableParentTypeOptions } from './wizards/parentTypeOptions';

function emphasize(chunks: ReactNode) {
  return <strong>{chunks}</strong>;
}

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
  const intl = useAppIntl();
  const CURRENT_EX_OPTIONS = [
    { value: 'current', label: intl.formatMessage(messages.current) },
    { value: 'ex', label: intl.formatMessage(messages.ex) },
  ];
  const EXISTING_OPTION = {
    value: 'existing',
    label: intl.formatMessage(messages.alreadyInTree),
  };
  const NEW_OPTION = {
    value: 'new',
    label: intl.formatMessage(messages.addNewPersonOption),
  };

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
    intl,
  );

  const hasCandidates = existingPartnerOptions.length > 0;
  const partnerTypeOptions = hasCandidates
    ? [EXISTING_OPTION, NEW_OPTION]
    : [NEW_OPTION];

  return (
    <>
      <Field
        name="partnerType"
        label={intl.formatMessage(messages.personAlreadyRelated)}
        component={RadioGroupField}
        options={partnerTypeOptions}
        initialValue="new"
      />

      <FieldGroup
        watch={['partnerType'] as const}
        condition={(v) => v.partnerType === 'existing'}
      >
        <Field
          name="existingPartnerId"
          label={intl.formatMessage(messages.selectPerson)}
          component={RadioGroupField}
          options={existingPartnerOptions.map(({ label, ...option }) => ({
            ...option,
            label: <>{label}</>,
          }))}
          required
        />
      </FieldGroup>

      <FieldGroup
        watch={['partnerType'] as const}
        condition={(v) => v.partnerType === 'new'}
      >
        <PersonFields />
      </FieldGroup>

      {/*
        Hoisted out of the two mutually-exclusive branches above so exactly
        one "current" Field is always mounted. Both branches asked this
        question identically; keeping a single always-mounted instance means
        the answer survives a partnerType switch as live form state, rather
        than depending on dormant-field remount-restore.
      */}
      <Field
        name="current"
        label={intl.formatMessage(messages.currentOrExPartner)}
        component={RadioGroupField}
        options={CURRENT_EX_OPTIONS}
        initialValue="current"
      />

      <FieldGroup
        watch={['partnerType'] as const}
        condition={(v) => v.partnerType === 'new'}
      >
        {children.map((childId) => (
          <Field
            key={`parentType-${childId}`}
            name={`parentType-${childId}`}
            label={
              <AppMessage
                message={messages.alsoParentOf}
                values={{
                  name: getNodeLabel(
                    childId,
                    nodes,
                    edges,
                    variableConfig,
                    framing ?? 'gamete',
                    intl,
                  ),
                  strong: emphasize,
                }}
              />
            }
            component={RichSelectGroupField}
            options={[
              {
                value: 'none',
                label: intl.formatMessage(messages.notParent),
                description: intl.formatMessage(messages.notParentDescription),
              },
              ...addableParentTypeOptions(childId, edges, variableConfig, intl),
            ]}
            initialValue="none"
          />
        ))}
      </FieldGroup>
    </>
  );
}
