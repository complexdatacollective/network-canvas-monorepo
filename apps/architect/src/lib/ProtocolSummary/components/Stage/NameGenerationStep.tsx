import { useContext } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import type { LocalizedString } from '@codaco/protocol-validation';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import { getVariableMeta } from '../helpers';
import MiniTable from '../MiniTable';
import SummaryContext from '../SummaryContext';
import { SummaryMarkdown } from '../SummaryText';
import Variable from '../Variable';
const messages = defineMessages({
  nameGenerationStepInstructions: {
    id: 'architect.protocolSummary.stage.nameGenerationStep.nameGenerationStepInstructions',
    defaultMessage: 'Name Generation Step Instructions',
    description:
      'Sub-heading in the printable protocol summary of a family tree census stage, above the instructions shown to participants for its name generation step.',
  },
  formFields: {
    id: 'architect.protocolSummary.stage.nameGenerationStep.formFields',
    defaultMessage: 'Form Fields',
    description:
      'Sub-heading in the printable protocol summary of a family tree census stage, above the table of form fields in its name generation step.',
  },
});

type FormFieldType = {
  prompt: LocalizedString;
  variable: string;
};
type NameGenerationStepProps = {
  nameGenerationStep?: {
    text: LocalizedString;
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
        <SummaryMarkdown key={`prompt-${variable}`} value={prompt} />,
      ];
    }) ?? [];
  return (
    <>
      <Heading level="h4">
        {intl.formatMessage(messages.nameGenerationStepInstructions)}
      </Heading>
      <SummaryMarkdown value={nameGenerationStep.text} />
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
