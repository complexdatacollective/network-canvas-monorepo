import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { UnorderedList } from '@codaco/fresco-ui/typography/UnorderedList';
import Markdown from '~/components/Markdown';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import MiniTable from '../MiniTable';
import Variable from '../Variable';
import SectionFrame from './SectionFrame';
const messages = defineMessages({
  nominationPrompts: {
    id: 'architect.protocolSummary.stage.nominationPrompts.nominationPrompts',
    defaultMessage: 'Nomination Prompts',
    description:
      'The title text in lib / ProtocolSummary / components / Stage / NominationPrompts. A Family Pedigree stage asks these after the family is built; each records a condition or trait as a boolean attribute of the family members the participant picks.',
  },
});

type NominationPrompt = {
  id: string;
  text: string;
  variable: string;
};

type NominationPromptsProps = {
  nominationPrompts?: NominationPrompt[] | null;
};

const NominationPrompts = ({
  nominationPrompts = null,
}: NominationPromptsProps) => {
  const intl = useAppIntl();
  if (!nominationPrompts || nominationPrompts.length === 0) {
    return null;
  }

  return (
    <SectionFrame title={intl.formatMessage(messages.nominationPrompts)}>
      <UnorderedList>
        {nominationPrompts.map((prompt) => (
          <li className="my-5" key={prompt.id}>
            <div className="break-inside-avoid">
              <Markdown label={prompt.text} />
              <MiniTable
                rotated
                rows={[
                  [
                    intl.formatMessage(summaryMessages.attribute),
                    <Variable key={prompt.variable} id={prompt.variable} />,
                  ],
                ]}
              />
            </div>
          </li>
        ))}
      </UnorderedList>
    </SectionFrame>
  );
};

export default NominationPrompts;
