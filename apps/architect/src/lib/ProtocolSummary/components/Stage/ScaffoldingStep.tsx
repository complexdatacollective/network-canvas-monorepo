import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import type { LocalizedString } from '@codaco/protocol-validation';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import MiniTable from '../MiniTable';
import { SummaryMarkdown } from '../SummaryText';
const messages = defineMessages({
  scaffoldingStepInstructions: {
    id: 'architect.protocolSummary.stage.scaffoldingStep.scaffoldingStepInstructions',
    defaultMessage: 'Scaffolding Step Instructions',
    description:
      'Sub-heading in the printable protocol summary of a family tree census stage, above the instructions shown to participants for its scaffolding step.',
  },
});

type ScaffoldingStepProps = {
  scaffoldingStep?: {
    text: LocalizedString;
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
      <SummaryMarkdown value={scaffoldingStep.text} />
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
    description:
      'Yes or no value in the printable protocol summary of a family tree census stage, saying whether the quick start dialog is shown. enabled is true or false.',
  },
});
