/* eslint-disable react/jsx-props-no-spreading */

import { UnorderedList } from '@codaco/fresco-ui/typography/UnorderedList';

import Prompt from './Prompt';
import SectionFrame from './SectionFrame';

export type PromptType = {
  id?: string;
  text: string;
  [key: string]: unknown;
};

type PromptsProps = {
  prompts?: PromptType[] | null;
};

const Prompts = ({ prompts = null }: PromptsProps) => {
  if (!prompts) {
    return null;
  }

  return (
    <SectionFrame title="Prompts">
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
