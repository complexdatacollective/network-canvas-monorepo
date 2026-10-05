import { useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { LocaleTag } from '@codaco/protocol-validation';
import LanguageList from '~/components/Localization/LanguageList';
import MissingTranslations, {
  ALL_LANGUAGES,
} from '~/components/Localization/MissingTranslations';
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
      'Choose the languages participants can take this protocol in, and see which text still needs translating.',
    description: 'Description of the page that manages protocol languages.',
  },
});

const LocalizationPage = () => {
  const intl = useAppIntl();
  const [filter, setFilter] = useState<LocaleTag>(ALL_LANGUAGES);
  const missingHeadingRef = useRef<HTMLSpanElement>(null);

  const showMissing = (locale: LocaleTag) => {
    setFilter(locale);
    missingHeadingRef.current?.focus();
  };

  return (
    <div className={pageInsetClasses}>
      <PageHeading
        title={intl.formatMessage(messages.title)}
        description={intl.formatMessage(messages.description)}
      />
      <div className="mx-auto my-10 w-full max-w-4xl">
        <LanguageList onShowMissing={showMissing} />
        <MissingTranslations
          filter={filter}
          onFilterChange={setFilter}
          headingRef={missingHeadingRef}
        />
      </div>
    </div>
  );
};

export default LocalizationPage;
