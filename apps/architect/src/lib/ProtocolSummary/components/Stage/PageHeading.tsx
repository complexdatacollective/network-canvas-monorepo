import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';

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
  heading?: string | null;
};
const PageHeading = ({ heading = null }: PageHeadingProps) => {
  const intl = useAppIntl();
  if (!heading) {
    return null;
  }
  return (
    <SectionFrame title={intl.formatMessage(messages.pageHeading)}>
      <Heading level="h2">{heading}</Heading>
    </SectionFrame>
  );
};
export default PageHeading;
