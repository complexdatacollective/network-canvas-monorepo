import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import type { LocalizedString } from '@codaco/protocol-validation';

import { SummaryText } from '../SummaryText';
import SectionFrame from './SectionFrame';
const messages = defineMessages({
  pageHeading: {
    id: 'architect.protocolSummary.stage.pageHeading.pageHeading',
    defaultMessage: 'Page Heading',
    description:
      'The title text in lib / ProtocolSummary / components / Stage / PageHeading.',
  },
});

type PageHeadingProps = {
  heading?: LocalizedString | null;
};
const PageHeading = ({ heading = null }: PageHeadingProps) => {
  const intl = useAppIntl();
  if (!heading) {
    return null;
  }
  return (
    <SectionFrame title={intl.formatMessage(messages.pageHeading)}>
      <Heading level="h2">
        <SummaryText value={heading} />
      </Heading>
    </SectionFrame>
  );
};
export default PageHeading;
