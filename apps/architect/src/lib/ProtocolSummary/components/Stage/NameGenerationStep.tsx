import { useContext } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Markdown from '~/components/Markdown';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import { getVariableMeta } from '../helpers';
import MiniTable from '../MiniTable';
import SummaryContext from '../SummaryContext';
import Variable from '../Variable';
const messages = defineMessages({
  nameGenerationStepInstructions: {
    id: 'architect.protocolSummary.stage.nameGenerationStep.nameGenerationStepInstructions',
    defaultMessage: 'Name Generation Step Instructions',
    description:
      'Visible text in lib / ProtocolSummary / components / Stage / NameGenerationStep.',
  },
  formFields: {
    id: 'architect.protocolSummary.stage.nameGenerationStep.formFields',
    defaultMessage: 'Form Fields',
    description:
      'Visible text in lib / ProtocolSummary / components / Stage / NameGenerationStep.',
  },
});

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
  const intl = useAppIntl();
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
      <Heading level="h4">
        {intl.formatMessage(messages.nameGenerationStepInstructions)}
      </Heading>
      <Markdown label={nameGenerationStep.text} />
      {fieldRows.length > 0 && (
        <>
          <Heading level="h4">
            {intl.formatMessage(messages.formFields)}
          </Heading>
          <MiniTable
            wide
            rows={[
              [
                intl.formatMessage(summaryMessages.attribute),
                intl.formatMessage(summaryMessages.component),
                intl.formatMessage(summaryMessages.prompt),
              ],
              ...fieldRows,
            ]}
          />
        </>
      )}
    </>
  );
};
export default NameGenerationStep;
