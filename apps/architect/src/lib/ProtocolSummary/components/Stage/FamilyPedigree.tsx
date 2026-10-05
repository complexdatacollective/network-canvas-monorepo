import type { ReactNode } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Markdown from '~/components/Markdown';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import EntityBadge from '../EntityBadge';
import MiniTable from '../MiniTable';
import Variable from '../Variable';
import SectionFrame from './SectionFrame';

const messages = defineMessages({
  title: {
    id: 'architect.protocolSummary.stage.familyPedigree.title',
    defaultMessage: 'Family Pedigree',
    description:
      'Heading of the printable protocol summary section describing how a Family Pedigree stage records each family member and each relationship.',
  },
  name: {
    id: 'architect.protocolSummary.stage.familyPedigree.name',
    defaultMessage: 'Name',
    description:
      'Label for the text attribute that holds each family member’s name, in the printable protocol summary.',
  },
  genderIdentity: {
    id: 'architect.protocolSummary.stage.familyPedigree.genderIdentity',
    defaultMessage: 'Gender identity',
    description:
      'Label for the attribute that holds each family member’s gender identity, in the printable protocol summary.',
  },
  sexAssignedAtBirth: {
    id: 'architect.protocolSummary.stage.familyPedigree.sexAssignedAtBirth',
    defaultMessage: 'Sex assigned at birth',
    description:
      'Label for the attribute that holds each family member’s sex assigned at birth, in the printable protocol summary.',
  },
  participantMarker: {
    id: 'architect.protocolSummary.stage.familyPedigree.participantMarker',
    defaultMessage: 'Participant marker',
    description:
      'Label for the true/false attribute that marks which family member is the participant, in the printable protocol summary.',
  },
  relationshipEdgeType: {
    id: 'architect.protocolSummary.stage.familyPedigree.relationshipEdgeType',
    defaultMessage: 'Relationship edge type',
    description:
      'Label for the kind of connection family relationships are recorded as, in the printable protocol summary.',
  },
  relationshipKind: {
    id: 'architect.protocolSummary.stage.familyPedigree.relationshipKind',
    defaultMessage: 'Relationship kind',
    description:
      'Label for the attribute recording whether a relationship is a partnership or a kind of parenthood, in the printable protocol summary.',
  },
  gestationalCarrier: {
    id: 'architect.protocolSummary.stage.familyPedigree.gestationalCarrier',
    defaultMessage: 'Gestational carrier',
    description:
      'Label for the true/false attribute marking the parent who carried a pregnancy, in the printable protocol summary.',
  },
  currentPartner: {
    id: 'architect.protocolSummary.stage.familyPedigree.currentPartner',
    defaultMessage: 'Current partner',
    description:
      'Label for the true/false attribute marking a partnership as current, in the printable protocol summary.',
  },
});

type PersonAttributes = {
  nameVariable?: string;
  genderIdentityVariable?: string;
  sexAssignedAtBirthVariable?: string;
  egoVariable?: string;
};

type RelationshipConfig = {
  type?: string;
  kindVariable?: string;
  gestationalCarrierVariable?: string;
  currentPartnerVariable?: string;
};

type FamilyPedigreeProps = {
  prompt: string | null;
  personAttributes: PersonAttributes | null;
  relationship: RelationshipConfig | null;
};

/** One row naming a bound attribute, or none while the slot is unbound. */
const variableRow = (
  label: string,
  key: string,
  variableId: string | undefined,
): [string, ReactNode][] =>
  variableId ? [[label, <Variable key={key} id={variableId} />]] : [];

/**
 * What a Family Pedigree stage shows the participant, and the attributes it
 * records about each person and each relationship. The person type itself is
 * the stage's subject, shown in the stage heading.
 */
const FamilyPedigree = ({
  prompt,
  personAttributes,
  relationship,
}: FamilyPedigreeProps) => {
  const intl = useAppIntl();
  if (prompt === null && personAttributes === null && relationship === null) {
    return null;
  }

  const rows: [string, ReactNode][] = [
    ...(prompt
      ? ([
          [
            intl.formatMessage(summaryMessages.prompt),
            <Markdown key="prompt" label={prompt} />,
          ],
        ] as [string, ReactNode][])
      : []),
    ...variableRow(
      intl.formatMessage(messages.name),
      'name',
      personAttributes?.nameVariable,
    ),
    ...variableRow(
      intl.formatMessage(messages.genderIdentity),
      'gender-identity',
      personAttributes?.genderIdentityVariable,
    ),
    ...variableRow(
      intl.formatMessage(messages.sexAssignedAtBirth),
      'sex-assigned-at-birth',
      personAttributes?.sexAssignedAtBirthVariable,
    ),
    ...variableRow(
      intl.formatMessage(messages.participantMarker),
      'participant-marker',
      personAttributes?.egoVariable,
    ),
    ...(relationship?.type
      ? ([
          [
            intl.formatMessage(messages.relationshipEdgeType),
            <EntityBadge
              key="relationship-type"
              small
              iconSize="tiny"
              type={relationship.type}
              entity="edge"
              link
            />,
          ],
        ] as [string, ReactNode][])
      : []),
    ...variableRow(
      intl.formatMessage(messages.relationshipKind),
      'relationship-kind',
      relationship?.kindVariable,
    ),
    ...variableRow(
      intl.formatMessage(messages.gestationalCarrier),
      'gestational-carrier',
      relationship?.gestationalCarrierVariable,
    ),
    ...variableRow(
      intl.formatMessage(messages.currentPartner),
      'current-partner',
      relationship?.currentPartnerVariable,
    ),
  ];

  return (
    <SectionFrame title={intl.formatMessage(messages.title)}>
      <MiniTable rotated wide rows={rows} />
    </SectionFrame>
  );
};

export default FamilyPedigree;
