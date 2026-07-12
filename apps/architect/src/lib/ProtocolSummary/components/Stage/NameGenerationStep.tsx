import { useContext } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Markdown from '~/components/Form/Fields/Markdown';

import { getVariableMeta } from '../helpers';
import MiniTable from '../MiniTable';
import SummaryContext from '../SummaryContext';
import Variable from '../Variable';
type FormFieldType = {
  prompt: string;
  variable: string;
};
type NameGenerationStepProps = {
  nameGenerationStep?: {
    text: string;
    form: {
      fields?: FormFieldType[];
    };
  } | null;
};
const NameGenerationStep = ({
  nameGenerationStep = null,
}: NameGenerationStepProps) => {
  const { index } = useContext(SummaryContext);
  if (!nameGenerationStep) {
    return null;
  }
  const fieldRows =
    nameGenerationStep.form?.fields?.map(({ prompt, variable }) => {
      const meta = getVariableMeta(index, variable);
      return [
        <Variable key={`var-${variable}`} id={variable} />,
        <span key={`comp-${variable}`}>{meta.component ?? ''}</span>,
        <Markdown key={`prompt-${variable}`} label={prompt} />,
      ];
    }) ?? [];
  return (
    <>
      <Heading level="h4">Name Generation Step Instructions</Heading>
      <Markdown label={nameGenerationStep.text} />
      {fieldRows.length > 0 && (
        <>
          <Heading level="h4">Form Fields</Heading>
          <MiniTable
            wide
            rows={[['Variable', 'Component', 'Prompt'], ...fieldRows]}
          />
        </>
      )}
    </>
  );
};
export default NameGenerationStep;
