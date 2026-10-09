import { useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

/**
 * What the arguments of a protocol's localized messages are called, said to
 * a researcher. Arguments are named alike wherever a setting declares them
 * (see `localizedMessage`), so one table names them for every editor of a
 * message: the stage editor's field and Architect's translation table.
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
});

export type MessageArgumentLabels = Readonly<{
  /** Each case of each select argument, and `other`. */
  caseLabels: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Each placeholder: a text argument, and a plural argument's number. */
  placeholderLabels: Readonly<Record<string, string>>;
}>;

export function useMessageArgumentLabels(): MessageArgumentLabels {
  const intl = useAppIntl();
  return useMemo(
    () => ({
      caseLabels: {
        isYou: {
          true: intl.formatMessage(messages.aboutParticipant),
          other: intl.formatMessage(messages.aboutSomeoneElse),
        },
      },
      placeholderLabels: {
        name: intl.formatMessage(messages.name),
        missing: intl.formatMessage(messages.missing),
      },
    }),
    [intl],
  );
}
