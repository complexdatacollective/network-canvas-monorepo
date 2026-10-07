import type { ReactNode } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from '@codaco/fresco-ui/Accordion';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { OrderedList } from '@codaco/fresco-ui/typography/UnorderedList';
import ExternalLink from '~/components/ExternalLink';
import { documentationLinks } from '~/utils/documentationLinks';

const messages = defineMessages({
  title: {
    id: 'architect.localization.translationFallback.title',
    defaultMessage: 'Which translation participants see',
    description:
      'Button that shows or hides the explanation of which language participants see each text in.',
  },
  intro: {
    id: 'architect.localization.translationFallback.intro',
    defaultMessage:
      'Participants see each text in the first of these languages that has a translation of it:',
    description:
      'Introduces a numbered list of the languages a participant may see a text in, in the order they are tried.',
  },
  own: {
    id: 'architect.localization.translationFallback.own',
    defaultMessage:
      'Their own language: the one they chose, or the one their browser or device is set to.',
    description:
      'First item of the numbered list of the languages a participant may see a text in.',
  },
  related: {
    id: 'architect.localization.translationFallback.related',
    defaultMessage:
      'A closely related language, such as Brazilian Portuguese for a participant using European Portuguese.',
    description:
      'Second item of the numbered list of the languages a participant may see a text in.',
  },
  browser: {
    id: 'architect.localization.translationFallback.browser',
    defaultMessage: 'Another language their browser or device lists.',
    description:
      'Third item of the numbered list of the languages a participant may see a text in.',
  },
  default: {
    id: 'architect.localization.translationFallback.default',
    defaultMessage: 'The protocol’s default language.',
    description:
      'Fourth item of the numbered list of the languages a participant may see a text in.',
  },
  any: {
    id: 'architect.localization.translationFallback.any',
    defaultMessage: 'Any other language that has the text.',
    description:
      'Last item of the numbered list of the languages a participant may see a text in.',
  },
  readMore: {
    id: 'architect.localization.translationFallback.readMore',
    defaultMessage: 'Read more in <link>Translating your protocol</link>.',
    description:
      'Link to the documentation guide about translating a protocol. The text inside <link> is the guide’s title.',
  },
});

const STEPS = [
  messages.own,
  messages.related,
  messages.browser,
  messages.default,
  messages.any,
];

const renderGuideLink = (chunks: ReactNode[]) => (
  <ExternalLink href={documentationLinks.whichTranslationParticipantsSee}>
    {chunks}
  </ExternalLink>
);

/** How a participant comes to see a text in one language rather than another. */
const TranslationFallback = () => {
  const intl = useAppIntl();

  return (
    <Accordion className="mb-6">
      <AccordionItem value="translation-fallback">
        <AccordionHeader>
          <AccordionTrigger>
            {intl.formatMessage(messages.title)}
          </AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>
          <Paragraph>{intl.formatMessage(messages.intro)}</Paragraph>
          <OrderedList>
            {STEPS.map((step) => (
              <li key={step.id}>{intl.formatMessage(step)}</li>
            ))}
          </OrderedList>
          <Paragraph margin="none">
            {intl.formatMessage(messages.readMore, { link: renderGuideLink })}
          </Paragraph>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
};

export default TranslationFallback;
