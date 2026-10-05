import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Markdown from '~/components/Markdown';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import MiniTable from '../MiniTable';
const messages = defineMessages({
  scaffoldingStepInstructions: {
    id: 'architect.protocolSummary.stage.scaffoldingStep.scaffoldingStepInstructions',
    defaultMessage: 'Scaffolding Step Instructions',
    description:
      'Visible text in lib / ProtocolSummary / components / Stage / ScaffoldingStep.',
  },
});

type ScaffoldingStepProps = {
  scaffoldingStep?: {
    text: string;
    showQuickStartModal: boolean;
  } | null;
};
const ScaffoldingStep = ({ scaffoldingStep = null }: ScaffoldingStepProps) => {
  const intl = useAppIntl();
  if (!scaffoldingStep) {
    return null;
  }
  return (
    <>
      <Heading level="h4">
        {intl.formatMessage(messages.scaffoldingStepInstructions)}
      </Heading>
      <Markdown label={scaffoldingStep.text} />
      <MiniTable
        rotated
        rows={[
          [
            intl.formatMessage(summaryMessages.showQuickStartModal),
            intl.formatMessage(extraMessages.enabled, {
              enabled: String(scaffoldingStep.showQuickStartModal),
            }),
          ],
        ]}
      />
    </>
  );
};
export default ScaffoldingStep;

const extraMessages = defineMessages({
  enabled: {
    id: 'architect.summary.scaffolding.enabled',
    defaultMessage: '{enabled, select, true {Yes} other {No}}',
    description: 'Researcher-facing Architect control or feedback.',
  },
});
