/* eslint-disable react/jsx-props-no-spreading */

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { UnorderedList } from '@codaco/fresco-ui/typography/UnorderedList';
import type { LocalizedString } from '@codaco/protocol-validation';

import Prompt from './Prompt';
import SectionFrame from './SectionFrame';
const messages = defineMessages({
  prompts: {
    id: 'architect.protocolSummary.stage.prompts.prompts',
    defaultMessage: 'Prompts',
    description:
      'Section heading in the printable protocol summary, above the list of prompts (the questions or instructions participants see) of a stage.',
  },
});

export type PromptType = {
  id?: string;
  text: LocalizedString;
  [key: string]: unknown;
};

type PromptsProps = {
  prompts?: PromptType[] | null;
};

const Prompts = ({ prompts = null }: PromptsProps) => {
  const intl = useAppIntl();
  if (!prompts) {
    return null;
  }

  return (
    <SectionFrame title={intl.formatMessage(messages.prompts)}>
      <UnorderedList>
        {prompts.map((prompt) => (
          <li className="my-5" key={prompt.id}>
            <Prompt {...prompt} />
          </li>
        ))}
      </UnorderedList>
    </SectionFrame>
  );
};

export default Prompts;
