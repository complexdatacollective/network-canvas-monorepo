import { Table2 } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
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
  openTable: {
    id: 'architect.pages.localizationPage.openTable',
    defaultMessage: 'Open translation table',
    description:
      'Link on the Languages page to the translation table, which shows every participant-facing text beside its translation into each language.',
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
        actions={
          <Button
            asChild
            size="sm"
            variant="outline"
            icon={<Table2 aria-hidden />}
          >
            <Link href="/protocol/localization/table">
              {intl.formatMessage(messages.openTable)}
            </Link>
          </Button>
        }
      />
      {/* Side by side once there is room for both, languages narrower on the
          inline-start side; stacked, languages first, below that. */}
      <div className="@container mx-auto my-10 w-full max-w-7xl">
        <div className="grid grid-cols-1 items-start gap-10 @min-[64rem]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="min-w-0">
            <LanguageList onShowMissing={showMissing} />
          </div>
          <div
            ref={missingSectionRef}
            className="min-w-0"
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
    </div>
  );
};

export default LocalizationPage;
