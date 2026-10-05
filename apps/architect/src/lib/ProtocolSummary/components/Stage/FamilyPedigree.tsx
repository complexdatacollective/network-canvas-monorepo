import type { ReactNode } from 'react';

import {
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { PedigreeCompletenessScope } from '@codaco/protocol-validation';
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
  completenessScope: {
    id: 'architect.protocolSummary.stage.familyPedigree.completenessScope',
    defaultMessage: 'Relatives to record',
    description:
      'Label for how much of the family a participant must record before continuing, in the printable protocol summary.',
  },
  completenessEnforcement: {
    id: 'architect.protocolSummary.stage.familyPedigree.completenessEnforcement',
    defaultMessage: 'When the family is incomplete',
    description:
      'Label for whether a participant may continue while the required relatives are not all recorded, in the printable protocol summary.',
  },
  completenessEnforcementRequired: {
    id: 'architect.protocolSummary.stage.familyPedigree.completenessEnforcementRequired',
    defaultMessage: 'Participants cannot continue until it is complete.',
    description:
      'Printable protocol summary text for a completeness requirement that stops the participant continuing until the required relatives are recorded.',
  },
  completenessEnforcementRecommended: {
    id: 'architect.protocolSummary.stage.familyPedigree.completenessEnforcementRecommended',
    defaultMessage: 'Participants are shown what is missing but may continue.',
    description:
      'Printable protocol summary text for a completeness requirement that shows the participant what is missing but lets them continue.',
  },
  relativesNotRecorded: {
    id: 'architect.protocolSummary.stage.familyPedigree.relativesNotRecorded',
    defaultMessage: 'Relatives not recorded',
    description:
      'Label for the attribute recording that a family member has no siblings or children, or that the participant does not know, in the printable protocol summary.',
  },
  scopeParents: {
    id: 'architect.protocolSummary.stage.familyPedigree.scopeParents',
    defaultMessage: 'Both biological parents',
    description:
      'Printable protocol summary name of the completeness choice requiring the participant’s two biological parents.',
  },
  scopeFirstDegree: {
    id: 'architect.protocolSummary.stage.familyPedigree.scopeFirstDegree',
    defaultMessage: 'Parents, siblings and children',
    description:
      'Printable protocol summary name of the completeness choice requiring the participant’s parents, siblings and children.',
  },
  scopeGrandparents: {
    id: 'architect.protocolSummary.stage.familyPedigree.scopeGrandparents',
    defaultMessage: 'Three generations',
    description:
      'Printable protocol summary name of the completeness choice requiring three generations: the participant, their parents and grandparents, with aunts and uncles on both sides.',
  },
  scopeSecondDegree: {
    id: 'architect.protocolSummary.stage.familyPedigree.scopeSecondDegree',
    defaultMessage: 'All second-degree relatives',
    description:
      'Printable protocol summary name of the completeness choice requiring every second-degree relative, adding nieces, nephews and grandchildren.',
  },
  scopeThirdDegree: {
    id: 'architect.protocolSummary.stage.familyPedigree.scopeThirdDegree',
    defaultMessage: 'Three generations, to first cousins',
    description:
      'Printable protocol summary name of the completeness choice requiring three generations including first cousins.',
  },
});

const SCOPE_MESSAGES: Record<PedigreeCompletenessScope, MessageDescriptor> = {
  parents: messages.scopeParents,
  firstDegree: messages.scopeFirstDegree,
  grandparents: messages.scopeGrandparents,
  secondDegree: messages.scopeSecondDegree,
  thirdDegree: messages.scopeThirdDegree,
};

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

type Completeness = {
  scope?: PedigreeCompletenessScope;
  enforcement?: 'required' | 'recommended';
  relativesNotRecordedVariable?: string;
};

type FamilyPedigreeProps = {
  prompt: string | null;
  personAttributes: PersonAttributes | null;
  relationship: RelationshipConfig | null;
  completeness: Completeness | null;
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
  completeness,
}: FamilyPedigreeProps) => {
  const intl = useAppIntl();
  if (
    prompt === null &&
    personAttributes === null &&
    relationship === null &&
    completeness === null
  ) {
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
    ...(completeness?.scope
      ? ([
          [
            intl.formatMessage(messages.completenessScope),
            intl.formatMessage(SCOPE_MESSAGES[completeness.scope]),
          ],
        ] as [string, ReactNode][])
      : []),
    ...(completeness?.enforcement
      ? ([
          [
            intl.formatMessage(messages.completenessEnforcement),
            intl.formatMessage(
              completeness.enforcement === 'required'
                ? messages.completenessEnforcementRequired
                : messages.completenessEnforcementRecommended,
            ),
          ],
        ] as [string, ReactNode][])
      : []),
    ...variableRow(
      intl.formatMessage(messages.relativesNotRecorded),
      'relatives-not-recorded',
      completeness?.relativesNotRecordedVariable,
    ),
  ];

  return (
    <SectionFrame title={intl.formatMessage(messages.title)}>
      <MiniTable rotated wide rows={rows} />
    </SectionFrame>
  );
};

export default FamilyPedigree;
