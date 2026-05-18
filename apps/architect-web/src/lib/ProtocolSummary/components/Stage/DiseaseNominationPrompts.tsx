import Markdown from '~/components/Form/Fields/Markdown';

import MiniTable from '../MiniTable';
import Variable from '../Variable';
import SectionFrame from './SectionFrame';

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
  if (!diseaseNominationStep || diseaseNominationStep.length === 0) {
    return null;
  }

  return (
    <SectionFrame title="Disease Nomination Prompts">
      <ol className="m-0 ps-(--space-xl)">
        {diseaseNominationStep.map((prompt) => (
          <li className="my-(--space-md) pl-(--space-md)" key={prompt.id}>
            <div className="break-inside-avoid">
              <Markdown label={prompt.text} />
              <MiniTable
                rotated
                rows={[
                  [
                    'Variable',
                    <Variable key={prompt.variable} id={prompt.variable} />,
                  ],
                ]}
              />
            </div>
          </li>
        ))}
      </ol>
    </SectionFrame>
  );
};

export default DiseaseNominationPrompts;
