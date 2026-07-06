/* eslint-disable react/jsx-props-no-spreading */

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
      <ol className="m-0 ps-(--space-xl)">
        {prompts.map((prompt) => (
          <li className="my-(--space-md) pl-(--space-md)" key={prompt.id}>
            <Prompt {...prompt} />
          </li>
        ))}
      </ol>
    </SectionFrame>
  );
};

export default Prompts;
