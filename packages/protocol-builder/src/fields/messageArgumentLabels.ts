import { useMemo } from 'react';

import {
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import {
  familyPedigreeWordingIn,
  messageVariants,
  PEDIGREE_WORDING_ARGUMENTS,
} from '@codaco/protocol-validation';

/**
 * What the arguments of a protocol's localized messages are called, said to
 * a researcher. Arguments are named alike wherever a setting declares them
 * (see `localizedMessage`), so one table names them for every editor of a
 * message: the stage editor's field and Architect's translation table.
 *
 * Every argument a schema 9 setting declares is named here: each case of
 * each select argument (and `other`), and each text or plural argument as a
 * placeholder. `messageArgumentLabels.test.tsx` walks the schema and fails
 * for an argument that is not.
 */
const messages = defineMessages({
  aboutParticipant: {
    id: 'protocolBuilder.pedigree.trackerAboutParticipant',
    defaultMessage: 'About the participant',
    description:
      'Heading over the version of a list item or question used when it is about the participant themself.',
  },
  aboutSomeoneElse: {
    id: 'protocolBuilder.pedigree.trackerAboutSomeoneElse',
    defaultMessage: 'About someone else',
    description:
      'Heading over the version of a list item or question used when it is about another member of the participant’s family.',
  },
  name: {
    id: 'protocolBuilder.pedigree.trackerPlaceholderName',
    defaultMessage: 'Name',
    description:
      'Name of the placeholder, inserted into a list item or question, that shows the family member’s name.',
  },
  missing: {
    id: 'protocolBuilder.pedigree.trackerPlaceholderMissing',
    defaultMessage: 'Parents missing',
    description:
      'Name of the placeholder, inserted into the list item asking for parents, that shows how many of the person’s parents are still to be added.',
  },
  caseFirstIsParticipant: {
    id: 'protocolBuilder.localizedMessage.caseFirstIsParticipant',
    defaultMessage: 'When the first person is the participant',
    description:
      'Heading over the version of a message used when the first of the two people it is about is the participant themself.',
  },
  caseFirstIsSomeoneElse: {
    id: 'protocolBuilder.localizedMessage.caseFirstIsSomeoneElse',
    defaultMessage: 'When the first person is someone else',
    description:
      'Heading over the version of a message used when the first of the two people it is about is not the participant.',
  },
  caseParentIsParticipant: {
    id: 'protocolBuilder.localizedMessage.caseParentIsParticipant',
    defaultMessage: 'When the parent is the participant',
    description:
      'Heading over the version of a message used when the parent it is about is the participant themself.',
  },
  caseParentIsSomeoneElse: {
    id: 'protocolBuilder.localizedMessage.caseParentIsSomeoneElse',
    defaultMessage: 'When the parent is someone else',
    description:
      'Heading over the version of a message used when the parent it is about is not the participant.',
  },
  caseChildIsParticipant: {
    id: 'protocolBuilder.localizedMessage.caseChildIsParticipant',
    defaultMessage: 'When the child is the participant',
    description:
      'Heading over the version of a message used when the child it is about is the participant themself.',
  },
  caseChildIsSomeoneElse: {
    id: 'protocolBuilder.localizedMessage.caseChildIsSomeoneElse',
    defaultMessage: 'When the child is someone else',
    description:
      'Heading over the version of a message used when the child it is about is not the participant.',
  },
  casePersonIsParticipant: {
    id: 'protocolBuilder.localizedMessage.casePersonIsParticipant',
    defaultMessage: 'When the person is the participant',
    description:
      'Heading over the version of a message used when the person it is about is the participant themself.',
  },
  casePersonIsSomeoneElse: {
    id: 'protocolBuilder.localizedMessage.casePersonIsSomeoneElse',
    defaultMessage: 'When the person is someone else',
    description:
      'Heading over the version of a message used when the person it is about is not the participant.',
  },
  casePartnerIsParticipant: {
    id: 'protocolBuilder.localizedMessage.casePartnerIsParticipant',
    defaultMessage: 'When the partner is the participant',
    description:
      'Heading over the version of a message used when the partner it is about is the participant themself.',
  },
  casePartnerIsSomeoneElse: {
    id: 'protocolBuilder.localizedMessage.casePartnerIsSomeoneElse',
    defaultMessage: 'When the partner is someone else',
    description:
      'Heading over the version of a message used when the partner it is about is not the participant.',
  },
  caseTwinIsParticipant: {
    id: 'protocolBuilder.localizedMessage.caseTwinIsParticipant',
    defaultMessage: 'When the twin is the participant',
    description:
      'Heading over the version of a message used when the twin it is about is the participant themself.',
  },
  caseCarrierIsParticipant: {
    id: 'protocolBuilder.localizedMessage.caseCarrierIsParticipant',
    defaultMessage:
      'When the person who carried the pregnancy is the participant',
    description:
      'Heading over the version of a message used when the person recorded as having carried a child is the participant themself.',
  },
  caseCoParentIsParticipant: {
    id: 'protocolBuilder.localizedMessage.caseCoParentIsParticipant',
    defaultMessage: 'When the other parent is the participant',
    description:
      'Heading over the version of a message used when the other genetic parent of a child is the participant themself.',
  },
  caseParticipantIsOneOfTwoParents: {
    id: 'protocolBuilder.localizedMessage.caseParticipantIsOneOfTwoParents',
    defaultMessage: 'When the participant is one of the two parents',
    description:
      'Heading over the version of a message used when the participant is one of the two genetic parents recorded for a child.',
  },
  caseAboutParticipant: {
    id: 'protocolBuilder.localizedMessage.caseAboutParticipant',
    defaultMessage: 'When it is about the participant',
    description:
      'Heading over the version of a message used when it is about the participant themself.',
  },
  caseAboutThisPerson: {
    id: 'protocolBuilder.localizedMessage.caseAboutThisPerson',
    defaultMessage: 'When it is about this person',
    description:
      'Heading over the version of a message used when it is about the person whose details are open, shown without their name.',
  },
  caseOtherwise: {
    id: 'protocolBuilder.localizedMessage.caseOtherwise',
    defaultMessage: 'In any other case',
    description:
      'Heading over the version of a message used when none of the other versions apply.',
  },
  caseOnePerson: {
    id: 'protocolBuilder.localizedMessage.caseOnePerson',
    defaultMessage: 'When asking about one person',
    description:
      'Heading over the version of a question used when it asks about a single person.',
  },
  caseSeveralPeople: {
    id: 'protocolBuilder.localizedMessage.caseSeveralPeople',
    defaultMessage: 'When asking about several people',
    description:
      'Heading over the version of a question used when it asks about several people at once.',
  },
  casePartnershipCurrent: {
    id: 'protocolBuilder.localizedMessage.casePartnershipCurrent',
    defaultMessage: 'When the partnership is current',
    description:
      'Heading over the version of a message used when the two people are still partners.',
  },
  casePartnershipEnded: {
    id: 'protocolBuilder.localizedMessage.casePartnershipEnded',
    defaultMessage: 'When the partnership has ended',
    description:
      'Heading over the version of a message used when the two people are no longer partners.',
  },
  casePersonNamed: {
    id: 'protocolBuilder.localizedMessage.casePersonNamed',
    defaultMessage: 'When the person has a name',
    description:
      'Heading over the version of a question used when the person it is about has been given a name.',
  },
  casePersonUnnamed: {
    id: 'protocolBuilder.localizedMessage.casePersonUnnamed',
    defaultMessage: 'When the person has no name',
    description:
      'Heading over the version of a question used when the person it is about has not been given a name.',
  },
  caseOthersRemoved: {
    id: 'protocolBuilder.localizedMessage.caseOthersRemoved',
    defaultMessage: 'When other people would be removed too',
    description:
      'Heading over the version of a message used when removing a person would also remove others who are connected only through them.',
  },
  caseNobodyElseRemoved: {
    id: 'protocolBuilder.localizedMessage.caseNobodyElseRemoved',
    defaultMessage: 'When nobody else would be removed',
    description:
      'Heading over the version of a message used when removing a person would remove nobody else.',
  },
  caseNamesOtherQuestion: {
    id: 'protocolBuilder.localizedMessage.caseNamesOtherQuestion',
    defaultMessage: 'When it names the other question',
    description:
      'Heading over the version of a validation message used when it names the question whose answer it is compared with.',
  },
  caseRefersToPreviousAnswer: {
    id: 'protocolBuilder.localizedMessage.caseRefersToPreviousAnswer',
    defaultMessage: 'When it refers to the previous answer',
    description:
      'Heading over the version of a validation message used when it is compared with the previous answer.',
  },
  caseGameteWording: {
    id: 'protocolBuilder.localizedMessage.caseGameteWording',
    defaultMessage: 'When using egg and sperm parent wording',
    description:
      'Heading over the version of a message used when the family tree names parents by the egg or sperm they gave.',
  },
  caseMotherFatherWording: {
    id: 'protocolBuilder.localizedMessage.caseMotherFatherWording',
    defaultMessage: 'When using mother and father wording',
    description:
      'Heading over the version of a message used when the family tree names biological parents as mother and father.',
  },
  caseEggParent: {
    id: 'protocolBuilder.localizedMessage.caseEggParent',
    defaultMessage: 'When the parent is the egg parent',
    description:
      'Heading over the version of a message used when it is about the parent who gave the egg.',
  },
  caseSpermParent: {
    id: 'protocolBuilder.localizedMessage.caseSpermParent',
    defaultMessage: 'When the parent is the sperm parent',
    description:
      'Heading over the version of a message used when it is about the parent who gave the sperm.',
  },
  caseRelationEdit: {
    id: 'protocolBuilder.localizedMessage.caseRelationEdit',
    defaultMessage: 'When editing the person',
    description:
      'Heading over the version of a message used when the person’s own details are open for editing.',
  },
  caseRelationParent: {
    id: 'protocolBuilder.localizedMessage.caseRelationParent',
    defaultMessage: 'When the relation is a parent',
    description:
      'Heading over the version of a message used when the person is, or is being added as, a parent of someone.',
  },
  caseRelationSibling: {
    id: 'protocolBuilder.localizedMessage.caseRelationSibling',
    defaultMessage: 'When the relation is a sibling',
    description:
      'Heading over the version of a message used when the person is, or is being added as, a sibling of someone.',
  },
  caseRelationPartner: {
    id: 'protocolBuilder.localizedMessage.caseRelationPartner',
    defaultMessage: 'When the relation is a partner',
    description:
      'Heading over the version of a message used when the person is, or is being added as, a partner of someone.',
  },
  caseRelationFormerPartner: {
    id: 'protocolBuilder.localizedMessage.caseRelationFormerPartner',
    defaultMessage: 'When the relation is a former partner',
    description:
      'Heading over the version of a message used when the person is a former partner of someone.',
  },
  caseRelationOwner: {
    id: 'protocolBuilder.localizedMessage.caseRelationOwner',
    defaultMessage: 'When the person belongs to a named person',
    description:
      'Heading over the version of a message used when the person is described by whose relative they are.',
  },
  caseRelationChild: {
    id: 'protocolBuilder.localizedMessage.caseRelationChild',
    defaultMessage: 'When the relation is a child',
    description:
      'Heading over the version of a message used when the person is, or is being added as, a child of someone.',
  },
  caseRelativeCase: {
    id: 'protocolBuilder.localizedMessage.caseRelativeCase',
    defaultMessage: 'Relative: {term}',
    description:
      'Heading over the version of a message used for one kind of relative. term is the word Network Canvas supplies for that relative, such as “Mother” or “Maternal grandmother”.',
  },
  caseRelativeOther: {
    id: 'protocolBuilder.localizedMessage.caseRelativeOther',
    defaultMessage: 'Any other relative',
    description:
      'Heading over the version of a message used for a relative none of the other versions name.',
  },
  placeholderCount: {
    id: 'protocolBuilder.localizedMessage.placeholderCount',
    defaultMessage: 'Number',
    description:
      'Name of the placeholder, inserted into a message, that shows a number, such as how many people or answers it is about.',
  },
  placeholderMin: {
    id: 'protocolBuilder.localizedMessage.placeholderMin',
    defaultMessage: 'Minimum',
    description:
      'Name of the placeholder, inserted into a validation message, that shows the smallest length, number, date or count allowed.',
  },
  placeholderMax: {
    id: 'protocolBuilder.localizedMessage.placeholderMax',
    defaultMessage: 'Maximum',
    description:
      'Name of the placeholder, inserted into a validation message, that shows the largest length, number, date or count allowed.',
  },
  placeholderFirst: {
    id: 'protocolBuilder.localizedMessage.placeholderFirst',
    defaultMessage: 'First person’s name',
    description:
      'Name of the placeholder, inserted into a message about two people, that shows the first person’s name.',
  },
  placeholderSecond: {
    id: 'protocolBuilder.localizedMessage.placeholderSecond',
    defaultMessage: 'Second person’s name',
    description:
      'Name of the placeholder, inserted into a message about two people, that shows the second person’s name.',
  },
  placeholderNames: {
    id: 'protocolBuilder.localizedMessage.placeholderNames',
    defaultMessage: 'Names of the people',
    description:
      'Name of the placeholder, inserted into a message, that shows the names of several people.',
  },
  placeholderParent: {
    id: 'protocolBuilder.localizedMessage.placeholderParent',
    defaultMessage: 'Parent’s name',
    description:
      'Name of the placeholder, inserted into a message, that shows a parent’s name.',
  },
  placeholderChild: {
    id: 'protocolBuilder.localizedMessage.placeholderChild',
    defaultMessage: 'Child’s name',
    description:
      'Name of the placeholder, inserted into a message, that shows a child’s name.',
  },
  placeholderPartner: {
    id: 'protocolBuilder.localizedMessage.placeholderPartner',
    defaultMessage: 'Partner’s name',
    description:
      'Name of the placeholder, inserted into a message, that shows a partner’s name.',
  },
  placeholderTwin: {
    id: 'protocolBuilder.localizedMessage.placeholderTwin',
    defaultMessage: 'Twin’s name',
    description:
      'Name of the placeholder, inserted into a message, that shows a twin’s name.',
  },
  placeholderCarrier: {
    id: 'protocolBuilder.localizedMessage.placeholderCarrier',
    defaultMessage: 'Name of the person who carried the pregnancy',
    description:
      'Name of the placeholder, inserted into a message, that shows the name of the person recorded as having carried the pregnancy.',
  },
  placeholderCoParent: {
    id: 'protocolBuilder.localizedMessage.placeholderCoParent',
    defaultMessage: 'Other parent’s name',
    description:
      'Name of the placeholder, inserted into a message, that shows the name of the child’s other genetic parent.',
  },
  placeholderOwner: {
    id: 'protocolBuilder.localizedMessage.placeholderOwner',
    defaultMessage: 'Name of the person they belong to',
    description:
      'Name of the placeholder, inserted into a message, that shows the name of the person a relative belongs to, as in “Sam’s aunt”.',
  },
  placeholderTerm: {
    id: 'protocolBuilder.localizedMessage.placeholderTerm',
    defaultMessage: 'Relationship word',
    description:
      'Name of the placeholder, inserted into a message, that shows the word for a relative, such as “Aunt”.',
  },
  placeholderDetails: {
    id: 'protocolBuilder.localizedMessage.placeholderDetails',
    defaultMessage: 'Missing details',
    description:
      'Name of the placeholder, inserted into a message, that lists the details still to be filled in.',
  },
  placeholderParentKind: {
    id: 'protocolBuilder.localizedMessage.placeholderParentKind',
    defaultMessage: 'Kind of parent',
    description:
      'Name of the placeholder, inserted into a message, that shows the kind of parent, such as “Biological mother”.',
  },
  placeholderSex: {
    id: 'protocolBuilder.localizedMessage.placeholderSex',
    defaultMessage: 'Sex assigned at birth',
    description:
      'Name of the placeholder, inserted into a message, that shows the sex a person is recorded as having at birth.',
  },
  placeholderTitle: {
    id: 'protocolBuilder.localizedMessage.placeholderTitle',
    defaultMessage: 'Stage title',
    description:
      'Name of the placeholder, inserted into a heading, that shows the title of the stage.',
  },
  placeholderCondition: {
    id: 'protocolBuilder.localizedMessage.placeholderCondition',
    defaultMessage: 'Condition name',
    description:
      'Name of the placeholder, inserted into a heading, that shows the name of the condition being shown.',
  },
  placeholderLabel: {
    id: 'protocolBuilder.localizedMessage.placeholderLabel',
    defaultMessage: 'Question label',
    description:
      'Name of the placeholder, inserted into a validation message, that shows the label of the question whose answer it is compared with.',
  },
});

export type MessageArgumentLabels = Readonly<{
  /** Each case of each select argument, and `other`. */
  caseLabels: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Each placeholder: a text argument, and a plural argument's number. */
  placeholderLabels: Readonly<Record<string, string>>;
}>;

/**
 * The words Network Canvas supplies for each kind of relative, in the
 * language of the interface (or English where none is supplied), by the case
 * of `relativeTerm`'s `term` argument that chooses them. These head the
 * versions of the relative-term message, which has a case for every kind of
 * relative.
 */
const relativeTermWords = (
  locale: string,
): Readonly<Record<string, string>> => {
  const supplied = familyPedigreeWordingIn([locale, 'en']).relativeTerm;
  const language = [locale, locale.split('-')[0] ?? locale, 'en'].find(
    (candidate) => supplied?.[candidate] !== undefined,
  );
  const message = language === undefined ? undefined : supplied?.[language];
  if (language === undefined || message === undefined) return {};
  return Object.fromEntries(
    messageVariants(
      message,
      PEDIGREE_WORDING_ARGUMENTS.relativeTerm,
      language,
    ).flatMap(({ when, parts }) => {
      const term = when.term;
      // The supplied words carry soft hyphens for the interview's narrow
      // columns, which a heading does not need.
      const word = parts
        .filter((part) => typeof part === 'string')
        .join('')
        .replaceAll('\u00AD', '');
      return term === undefined ? [] : [[term, word] as const];
    }),
  );
};

export function useMessageArgumentLabels(): MessageArgumentLabels {
  const intl = useAppIntl();
  return useMemo(() => {
    const text = (message: MessageDescriptor) => intl.formatMessage(message);
    const words = relativeTermWords(intl.locale);
    return {
      caseLabels: {
        isYou: {
          true: text(messages.aboutParticipant),
          other: text(messages.aboutSomeoneElse),
        },
        firstIsYou: {
          true: text(messages.caseFirstIsParticipant),
          other: text(messages.caseFirstIsSomeoneElse),
        },
        parentIsYou: {
          true: text(messages.caseParentIsParticipant),
          other: text(messages.caseParentIsSomeoneElse),
        },
        childIsYou: {
          true: text(messages.caseChildIsParticipant),
          other: text(messages.caseChildIsSomeoneElse),
        },
        personIsYou: {
          true: text(messages.casePersonIsParticipant),
          other: text(messages.casePersonIsSomeoneElse),
        },
        partnerIsYou: {
          true: text(messages.casePartnerIsParticipant),
          other: text(messages.casePartnerIsSomeoneElse),
        },
        single: {
          true: text(messages.caseOnePerson),
          other: text(messages.caseSeveralPeople),
        },
        current: {
          true: text(messages.casePartnershipCurrent),
          other: text(messages.casePartnershipEnded),
        },
        named: {
          true: text(messages.casePersonNamed),
          other: text(messages.casePersonUnnamed),
        },
        hasOthers: {
          true: text(messages.caseOthersRemoved),
          other: text(messages.caseNobodyElseRemoved),
        },
        hasLabel: {
          true: text(messages.caseNamesOtherQuestion),
          other: text(messages.caseRefersToPreviousAnswer),
        },
        framing: {
          gamete: text(messages.caseGameteWording),
          other: text(messages.caseMotherFatherWording),
        },
        parent: {
          egg: text(messages.caseEggParent),
          other: text(messages.caseSpermParent),
        },
        relation: {
          edit: text(messages.caseRelationEdit),
          parent: text(messages.caseRelationParent),
          sibling: text(messages.caseRelationSibling),
          partner: text(messages.caseRelationPartner),
          formerPartner: text(messages.caseRelationFormerPartner),
          owner: text(messages.caseRelationOwner),
          other: text(messages.caseRelationChild),
        },
        who: {
          personIsYou: text(messages.casePersonIsParticipant),
          twinIsYou: text(messages.caseTwinIsParticipant),
          parentIsYou: text(messages.caseParentIsParticipant),
          childIsYou: text(messages.caseChildIsParticipant),
          carrierIsYou: text(messages.caseCarrierIsParticipant),
          coParentIsYou: text(messages.caseCoParentIsParticipant),
          includesYou: text(messages.caseParticipantIsOneOfTwoParents),
          you: text(messages.caseAboutParticipant),
          this: text(messages.caseAboutThisPerson),
          other: text(messages.caseOtherwise),
        },
        term: {
          ...Object.fromEntries(
            Object.entries(words).map(([term, word]) => [
              term,
              intl.formatMessage(messages.caseRelativeCase, { term: word }),
            ]),
          ),
          other: text(messages.caseRelativeOther),
        },
      },
      placeholderLabels: {
        name: text(messages.name),
        missing: text(messages.missing),
        count: text(messages.placeholderCount),
        min: text(messages.placeholderMin),
        max: text(messages.placeholderMax),
        first: text(messages.placeholderFirst),
        second: text(messages.placeholderSecond),
        names: text(messages.placeholderNames),
        parent: text(messages.placeholderParent),
        child: text(messages.placeholderChild),
        partner: text(messages.placeholderPartner),
        twin: text(messages.placeholderTwin),
        carrier: text(messages.placeholderCarrier),
        coParent: text(messages.placeholderCoParent),
        owner: text(messages.placeholderOwner),
        term: text(messages.placeholderTerm),
        details: text(messages.placeholderDetails),
        parentKind: text(messages.placeholderParentKind),
        sex: text(messages.placeholderSex),
        title: text(messages.placeholderTitle),
        condition: text(messages.placeholderCondition),
        label: text(messages.placeholderLabel),
      },
    };
  }, [intl]);
}
