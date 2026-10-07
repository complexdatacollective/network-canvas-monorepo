import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import TranslationTable from '~/components/Localization/TranslationTable';
import PageHeading from '~/components/ProjectNav/PageHeading';

const messages = defineMessages({
  title: {
    id: 'architect.pages.translationTablePage.title',
    defaultMessage: 'Translation table',
    description:
      'Title of the page, opened from the Languages page, that shows every participant-facing text of a protocol beside its translation into each language.',
  },
  description: {
    id: 'architect.pages.translationTablePage.description',
    defaultMessage:
      'Every text participants see, beside its translation into each language. Empty cells show the text participants see instead.',
    description: 'Description of the translation table page.',
  },
});

// The table spans the page and scrolls within it, so its headings stay in view
// and it ends above the floating toolbar.
const TranslationTablePage = () => {
  const intl = useAppIntl();
  return (
    <div className="phone-landscape:px-7 flex min-h-0 flex-1 flex-col gap-6 px-5 pb-28">
      <PageHeading
        fullWidth
        title={intl.formatMessage(messages.title)}
        description={intl.formatMessage(messages.description)}
      />
      <TranslationTable />
    </div>
  );
};

export default TranslationTablePage;
