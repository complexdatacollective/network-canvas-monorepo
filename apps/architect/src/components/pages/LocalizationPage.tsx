import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import LanguageList from '~/components/Localization/LanguageList';
import PageHeading from '~/components/ProjectNav/PageHeading';
import { pageInsetClasses } from '~/components/ProjectNav/pageInset';

const messages = defineMessages({
  title: {
    id: 'architect.pages.localizationPage.title',
    defaultMessage: 'Languages',
    description: 'Title of the page that manages the languages of a protocol.',
  },
  description: {
    id: 'architect.pages.localizationPage.description',
    defaultMessage:
      'Choose the languages participants can take the interview in, and see which text still needs translating.',
    description: 'Description of the page that manages protocol languages.',
  },
});

const LocalizationPage = () => {
  const intl = useAppIntl();

  return (
    <div className={pageInsetClasses}>
      <PageHeading
        title={intl.formatMessage(messages.title)}
        description={intl.formatMessage(messages.description)}
      />
      <div className="mx-auto my-10 w-full max-w-4xl">
        <LanguageList />
      </div>
    </div>
  );
};

export default LocalizationPage;
