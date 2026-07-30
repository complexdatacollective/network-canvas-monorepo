import { useContext } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Markdown from '~/components/Markdown';

import { getVariableMeta } from '../helpers';
import MiniTable from '../MiniTable';
import SummaryContext from '../SummaryContext';
import Variable from '../Variable';
import SectionFrame from './SectionFrame';
type FormFieldType = {
  prompt: string;
  variable: string;
};
type FormProps = {
  form?: {
    title?: string;
    fields?: FormFieldType[];
  } | null;
};
const Form = ({ form = null }: FormProps) => {
  const { index } = useContext(SummaryContext);
  if (!form) {
    return null;
  }
  const fieldRows =
    form.fields?.map(({ prompt, variable }) => {
      const meta = getVariableMeta(index, variable);
      return [
        <Variable key={`var-${variable}`} id={variable} />,
        <span key={`comp-${variable}`}>{meta.component ?? ''}</span>,
        <Markdown key={`prompt-${variable}`} label={prompt} />,
      ];
    }) ?? [];
  return (
    <SectionFrame title="Form" wrapperClassName="break-inside-avoid">
      {form.title && <Heading level="h4">Title: {form.title}</Heading>}
      <MiniTable
        wide
        className="table-fixed [&_:is(th,td):nth-child(1)]:w-[40%] [&_:is(th,td):nth-child(2)]:w-[24%] [&_:is(th,td):nth-child(3)]:w-[36%]"
        rows={[['Variable', 'Component', 'Prompt'], ...fieldRows]}
      />
    </SectionFrame>
  );
};
export default Form;
