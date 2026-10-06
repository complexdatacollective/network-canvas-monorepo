import { useReducedMotion } from 'motion/react';
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { LocaleTag } from '@codaco/protocol-validation';
import LanguageList from '~/components/Localization/LanguageList';
import MissingTranslations from '~/components/Localization/MissingTranslations';
import PageHeading from '~/components/ProjectNav/PageHeading';
import { pageInsetClasses } from '~/components/ProjectNav/pageInset';
import { NAV_HEIGHT_VARIABLE } from '~/utils/navHeight';

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
  const shouldReduceMotion = useReducedMotion();
  const [language, setLanguage] = useState<LocaleTag | null>(null);
  const missingSectionRef = useRef<HTMLDivElement>(null);
  const missingHeadingRef = useRef<HTMLElement>(null);

  const showMissing = (locale: LocaleTag) => {
    // Rendered first, so the scroll lands on the section as it will look with
    // this language's list in it.
    flushSync(() => setLanguage(locale));
    missingSectionRef.current?.scrollIntoView({
      behavior: shouldReduceMotion ? 'auto' : 'smooth',
      block: 'start',
    });
    missingHeadingRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className={pageInsetClasses}>
      <PageHeading
        title={intl.formatMessage(messages.title)}
        description={intl.formatMessage(messages.description)}
      />
      <div className="mx-auto my-10 w-full max-w-4xl">
        <LanguageList onShowMissing={showMissing} />
        <div
          ref={missingSectionRef}
          // Keeps the section clear of the sticky navigation bar when it is
          // scrolled to.
          style={{
            scrollMarginTop: `calc(var(${NAV_HEIGHT_VARIABLE}) + 1rem)`,
          }}
        >
          <MissingTranslations
            language={language}
            onLanguageChange={setLanguage}
            headingRef={missingHeadingRef}
          />
        </div>
      </div>
    </div>
  );
};

export default LocalizationPage;
