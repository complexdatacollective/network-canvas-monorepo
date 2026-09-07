import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { UnorderedList } from '@codaco/fresco-ui/typography/UnorderedList';
import Markdown from '~/components/Markdown';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import MiniTable from '../MiniTable';
import Variable from '../Variable';
import SectionFrame from './SectionFrame';
const messages = defineMessages({
  diseaseNominationPrompts: {
    id: 'architect.protocolSummary.stage.diseaseNominationPrompts.diseaseNominationPrompts',
    defaultMessage: 'Disease Nomination Prompts',
    description:
      'The title text in lib / ProtocolSummary / components / Stage / DiseaseNominationPrompts.',
  },
});

type DiseasePrompt = {
  id: string;
  text: string;
  variable: string;
};

type DiseaseNominationPromptsProps = {
  diseaseNominationStep?: DiseasePrompt[] | null;
};

const DiseaseNominationPrompts = ({
  diseaseNominationStep = null,
}: DiseaseNominationPromptsProps) => {
  const intl = useAppIntl();
  if (!diseaseNominationStep || diseaseNominationStep.length === 0) {
    return null;
  }

  return (
    <SectionFrame title={intl.formatMessage(messages.diseaseNominationPrompts)}>
      <UnorderedList>
        {diseaseNominationStep.map((prompt) => (
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

export default DiseaseNominationPrompts;
