import { type ReactNode, useContext } from 'react';

import {
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { getMarkdownLabelText } from '@codaco/fresco-ui/RenderMarkdown';
import { UnorderedList } from '@codaco/fresco-ui/typography/UnorderedList';
import type {
  FramingSetting,
  PedigreeCompletenessScope,
  PedigreeGenderWords,
} from '@codaco/protocol-validation';
import Markdown from '~/components/Markdown';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import EntityBadge from '../EntityBadge';
import MiniTable from '../MiniTable';
import SummaryContext from '../SummaryContext';
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
  genderIdentityNotAsked: {
    id: 'architect.protocolSummary.stage.familyPedigree.genderIdentityNotAsked',
    defaultMessage:
      'Not asked. Relatives are described by their sex assigned at birth.',
    description:
      'Value shown beside the gender identity label in the printable protocol summary when the Family Pedigree stage does not ask about gender identity, saying what the kinship words follow instead.',
  },
  genderIdentityTerms: {
    id: 'architect.protocolSummary.stage.familyPedigree.genderIdentityTerms',
    defaultMessage: 'Gender identity words',
    description:
      'Label for the list saying which kinship words each gender identity option takes, in the printable protocol summary.',
  },
  genderIdentityTerm: {
    id: 'architect.protocolSummary.stage.familyPedigree.genderIdentityTerm',
    defaultMessage: '{option}: {words}',
    description:
      'One line of the printable protocol summary’s list of gender identity words. option is a gender identity option’s own label, as the researcher wrote it, and words is the name of the kinship words it takes.',
  },
  genderWordsFeminine: {
    id: 'architect.protocolSummary.stage.familyPedigree.genderWordsFeminine',
    defaultMessage: 'Feminine words (mother, sister)',
    description:
      'Printable protocol summary name of the kinship words used for women, with examples.',
  },
  genderWordsMasculine: {
    id: 'architect.protocolSummary.stage.familyPedigree.genderWordsMasculine',
    defaultMessage: 'Masculine words (father, brother)',
    description:
      'Printable protocol summary name of the kinship words used for men, with examples.',
  },
  genderWordsNeutral: {
    id: 'architect.protocolSummary.stage.familyPedigree.genderWordsNeutral',
    defaultMessage: 'Neutral words (parent, sibling)',
    description:
      'Printable protocol summary name of the kinship words that do not depend on gender, with examples.',
  },
  genderWordsUnknown: {
    id: 'architect.protocolSummary.stage.familyPedigree.genderWordsUnknown',
    defaultMessage: 'Not known (named from sex assigned at birth)',
    description:
      'Printable protocol summary name of the kinship words for an option meaning the person’s gender is not known: a biological parent is named from their sex assigned at birth, such as biological mother.',
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
  framing: {
    id: 'architect.protocolSummary.stage.familyPedigree.framing',
    defaultMessage: 'Words for family members',
    description:
      'Label for the setting choosing the words used to describe family members, in the printable protocol summary.',
  },
  framingGendered: {
    id: 'architect.protocolSummary.stage.familyPedigree.framingGendered',
    defaultMessage: 'Everyday kinship words (mother, father, sister, brother)',
    description:
      'Printable protocol summary text for the wording setting that uses the usual kinship words. It is what the stage uses when no wording is chosen.',
  },
  framingGamete: {
    id: 'architect.protocolSummary.stage.familyPedigree.framingGamete',
    defaultMessage: 'Egg parent and sperm parent',
    description:
      'Printable protocol summary text for the wording setting that describes biological parents by the egg or sperm they gave, without gendered words.',
  },
  framingParticipantPreference: {
    id: 'architect.protocolSummary.stage.familyPedigree.framingParticipantPreference',
    defaultMessage: 'The participant chooses between the two',
    description:
      'Printable protocol summary text for the wording setting that lets the participant choose between everyday kinship words and egg parent and sperm parent words.',
  },
  nominationPrompts: {
    id: 'architect.protocolSummary.stage.familyPedigree.nominationPrompts',
    defaultMessage: 'Nomination prompts',
    description:
      'Heading of the list, in the printable protocol summary, of the questions a Family Pedigree asks about the whole family once it is drawn.',
  },
  nominationLimit: {
    id: 'architect.protocolSummary.stage.familyPedigree.nominationLimit',
    defaultMessage: 'Who can be selected',
    description:
      'Label, in the printable protocol summary, for the limit a nomination prompt places on who can be selected by sex assigned at birth.',
  },
  nominationLimitFemale: {
    id: 'architect.protocolSummary.stage.familyPedigree.nominationLimitFemale',
    defaultMessage: 'Only people assigned female at birth',
    description:
      'Printable protocol summary text for a nomination prompt that only people whose sex assigned at birth is female can be selected for.',
  },
  nominationLimitMale: {
    id: 'architect.protocolSummary.stage.familyPedigree.nominationLimitMale',
    defaultMessage: 'Only people assigned male at birth',
    description:
      'Printable protocol summary text for a nomination prompt that only people whose sex assigned at birth is male can be selected for.',
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

const FRAMING_MESSAGES: Record<FramingSetting, MessageDescriptor> = {
  gendered: messages.framingGendered,
  gamete: messages.framingGamete,
  participantPreference: messages.framingParticipantPreference,
};

const NOMINATION_LIMIT_MESSAGES: Record<
  NonNullable<NominationPrompt['onlyForSexAssignedAtBirth']>,
  MessageDescriptor
> = {
  female: messages.nominationLimitFemale,
  male: messages.nominationLimitMale,
};

const GENDER_WORDS_MESSAGES: Record<PedigreeGenderWords, MessageDescriptor> = {
  feminine: messages.genderWordsFeminine,
  masculine: messages.genderWordsMasculine,
  neutral: messages.genderWordsNeutral,
  unknown: messages.genderWordsUnknown,
};

const isGenderWords = (value: string): value is PedigreeGenderWords =>
  Object.hasOwn(GENDER_WORDS_MESSAGES, value);

type NodeConfiguration = {
  nameAttribute?: string;
  /** Absent when the stage does not ask about gender identity. */
  genderIdentity?: {
    attribute?: string;
    terms?: { value: string | number; words: string }[];
  };
  sexAssignedAtBirthAttribute?: string;
  egoAttribute?: string;
};

type EdgeConfiguration = {
  type?: string;
  kindAttribute?: string;
  gestationalCarrierAttribute?: string;
  currentPartnerAttribute?: string;
};

type Completeness = {
  scope?: PedigreeCompletenessScope;
  enforcement?: 'required' | 'recommended';
  relativesNotRecordedAttribute?: string;
};

type NominationPrompt = {
  id: string;
  text: string;
  attribute: string;
  onlyForSexAssignedAtBirth?: 'female' | 'male';
};

type FamilyPedigreeProps = {
  /** The node type of the people, whose attribute holds gender identity. */
  personType: string | null;
  prompt: string | null;
  nodeConfiguration: NodeConfiguration | null;
  edgeConfiguration: EdgeConfiguration | null;
  completeness: Completeness | null;
  /** Absent when the stage stores no wording, which means everyday words. */
  framing: FramingSetting | null;
  nominationPrompts: NominationPrompt[] | null;
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
  personType,
  prompt,
  nodeConfiguration,
  edgeConfiguration,
  completeness,
  framing,
  nominationPrompts,
}: FamilyPedigreeProps) => {
  const intl = useAppIntl();
  const { protocol } = useContext(SummaryContext);
  if (
    prompt === null &&
    nodeConfiguration === null &&
    edgeConfiguration === null &&
    completeness === null &&
    framing === null &&
    nominationPrompts === null
  ) {
    return null;
  }

  // Every option of the gender identity attribute with the words it takes, so
  // an option the stage does not list reads as the neutral words it gets.
  const genderIdentity = nodeConfiguration?.genderIdentity;
  const genderVariable =
    personType === null || !genderIdentity?.attribute
      ? undefined
      : protocol.codebook?.node?.[personType]?.variables?.[
          genderIdentity.attribute
        ];
  const genderOptions =
    genderVariable?.type === 'categorical' ? genderVariable.options : undefined;
  const genderTerms = genderIdentity?.terms;
  const genderWordsFor = (value: string | number): PedigreeGenderWords => {
    const words = genderTerms?.find((term) => term.value === value)?.words;
    return words !== undefined && isGenderWords(words) ? words : 'neutral';
  };
  const genderTermLines: { value: string | number; label: string }[] =
    genderOptions !== undefined
      ? genderOptions.map(({ value, label }) => ({
          value,
          label: getMarkdownLabelText(label),
        }))
      : (genderTerms ?? []).map(({ value }) => ({
          value,
          label: String(value),
        }));

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
      nodeConfiguration?.nameAttribute,
    ),
    ...(nodeConfiguration !== null && genderIdentity === undefined
      ? ([
          [
            intl.formatMessage(messages.genderIdentity),
            intl.formatMessage(messages.genderIdentityNotAsked),
          ],
        ] as [string, ReactNode][])
      : variableRow(
          intl.formatMessage(messages.genderIdentity),
          'gender-identity',
          genderIdentity?.attribute,
        )),
    ...(genderTermLines.length > 0
      ? ([
          [
            intl.formatMessage(messages.genderIdentityTerms),
            <ul key="gender-identity-terms" className="m-0 list-none p-0">
              {genderTermLines.map(({ value, label }) => (
                <li key={String(value)}>
                  {intl.formatMessage(messages.genderIdentityTerm, {
                    option: label,
                    words: intl.formatMessage(
                      GENDER_WORDS_MESSAGES[genderWordsFor(value)],
                    ),
                  })}
                </li>
              ))}
            </ul>,
          ],
        ] as [string, ReactNode][])
      : []),
    ...variableRow(
      intl.formatMessage(messages.sexAssignedAtBirth),
      'sex-assigned-at-birth',
      nodeConfiguration?.sexAssignedAtBirthAttribute,
    ),
    ...variableRow(
      intl.formatMessage(messages.participantMarker),
      'participant-marker',
      nodeConfiguration?.egoAttribute,
    ),
    ...(edgeConfiguration?.type
      ? ([
          [
            intl.formatMessage(messages.relationshipEdgeType),
            <EntityBadge
              key="relationship-type"
              small
              iconSize="tiny"
              type={edgeConfiguration.type}
              entity="edge"
              link
            />,
          ],
        ] as [string, ReactNode][])
      : []),
    ...variableRow(
      intl.formatMessage(messages.relationshipKind),
      'relationship-kind',
      edgeConfiguration?.kindAttribute,
    ),
    ...variableRow(
      intl.formatMessage(messages.gestationalCarrier),
      'gestational-carrier',
      edgeConfiguration?.gestationalCarrierAttribute,
    ),
    ...variableRow(
      intl.formatMessage(messages.currentPartner),
      'current-partner',
      edgeConfiguration?.currentPartnerAttribute,
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
      completeness?.relativesNotRecordedAttribute,
    ),
    // Always said, because a stage that stores no wording uses the everyday
    // words: the summary states what participants will read, not only what
    // the researcher chose.
    [
      intl.formatMessage(messages.framing),
      intl.formatMessage(FRAMING_MESSAGES[framing ?? 'gendered']),
    ],
  ];

  return (
    <>
      <SectionFrame title={intl.formatMessage(messages.title)}>
        <MiniTable rotated wide rows={rows} />
      </SectionFrame>
      {nominationPrompts !== null && nominationPrompts.length > 0 && (
        <SectionFrame title={intl.formatMessage(messages.nominationPrompts)}>
          <UnorderedList>
            {nominationPrompts.map(
              ({ id, text, attribute, onlyForSexAssignedAtBirth }) => (
                <li className="my-5" key={id}>
                  <div className="break-inside-avoid">
                    <Markdown label={text} />
                    <MiniTable
                      rotated
                      rows={[
                        [
                          intl.formatMessage(summaryMessages.attribute),
                          <Variable key="attribute" id={attribute} />,
                        ],
                        ...(onlyForSexAssignedAtBirth
                          ? [
                              [
                                intl.formatMessage(messages.nominationLimit),
                                intl.formatMessage(
                                  NOMINATION_LIMIT_MESSAGES[
                                    onlyForSexAssignedAtBirth
                                  ],
                                ),
                              ],
                            ]
                          : []),
                      ]}
                    />
                  </div>
                </li>
              ),
            )}
          </UnorderedList>
        </SectionFrame>
      )}
    </>
  );
};

export default FamilyPedigree;
