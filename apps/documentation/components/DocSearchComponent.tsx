'use client';

import { DocSearch } from '@docsearch/react';
import '@docsearch/css';
import { Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { inputVariants } from '~/components/ui/inputVariants';
import { env } from '~/env';
import { getSectionColorClass } from '~/lib/sections';
import { cn } from '~/lib/utils';
import { usePathname } from '~/navigation';

// Pulls the workflow-section slug out of a result's URL. Sections are the first
// path segment after the locale (e.g. /en/design-protocols/...); we match the
// first segment that is a known section so locale prefixes are skipped.
const getSectionSlug = (url: string): string | undefined => {
  try {
    return new URL(url).pathname
      .split('/')
      .filter(Boolean)
      .find((segment) => getSectionColorClass(segment) !== undefined);
  } catch {
    return undefined;
  }
};

const useDocSearchTranslations = () => {
  const t = useTranslations('DocSearch');
  return {
    button: {
      buttonText: t('button.buttonText'),
      buttonAriaLabel: t('button.buttonAriaLabel'),
    },
    modal: {
      searchBox: {
        clearButtonTitle: t('modal.searchBox.resetButtonTitle'),
        clearButtonAriaLabel: t('modal.searchBox.resetButtonAriaLabel'),
        closeButtonText: t('modal.searchBox.cancelButtonText'),
        closeButtonAriaLabel: t('modal.searchBox.cancelButtonAriaLabel'),
      },
      startScreen: {
        recentSearchesTitle: t('modal.startScreen.recentSearchesTitle'),
        noRecentSearchesText: t('modal.startScreen.noRecentSearchesText'),
        saveRecentSearchButtonTitle: t(
          'modal.startScreen.saveRecentSearchButtonTitle',
        ),
        removeRecentSearchButtonTitle: t(
          'modal.startScreen.removeRecentSearchButtonTitle',
        ),
        favoriteSearchesTitle: t('modal.startScreen.favoriteSearchesTitle'),
        removeFavoriteSearchButtonTitle: t(
          'modal.startScreen.removeFavoriteSearchButtonTitle',
        ),
      },
      errorScreen: {
        titleText: t('modal.errorScreen.titleText'),
        helpText: t('modal.errorScreen.helpText'),
      },
      footer: {
        selectText: t('modal.footer.selectText'),
        selectKeyAriaLabel: t('modal.footer.selectKeyAriaLabel'),
        navigateText: t('modal.footer.navigateText'),
        navigateUpKeyAriaLabel: t('modal.footer.navigateUpKeyAriaLabel'),
        navigateDownKeyAriaLabel: t('modal.footer.navigateDownKeyAriaLabel'),
        closeText: t('modal.footer.closeText'),
        closeKeyAriaLabel: t('modal.footer.closeKeyAriaLabel'),
      },
      noResultsScreen: {
        noResultsText: t('modal.noResultsScreen.noResultsText'),
        suggestedQueryText: t('modal.noResultsScreen.suggestedQueryText'),
        reportMissingResultsText: t(
          'modal.noResultsScreen.reportMissingResultsText',
        ),
        reportMissingResultsLinkText: t(
          'modal.noResultsScreen.reportMissingResultsLinkText',
        ),
      },
    },
  };
};

const DocSearchComponent = ({
  className,
  large,
}: {
  className?: string;
  large?: boolean;
}) => {
  const locale = useLocale();
  const t = useTranslations('DocSearch');
  const tSection = useTranslations('SectionSwitcher');
  const translations = useDocSearchTranslations();

  const pathname = usePathname();
  // The reader's current workflow section (first path segment, locale stripped
  // by next-intl's usePathname). Used to boost same-section results.
  const currentSection = pathname.split('/')[1] ?? '';
  const boostSection = getSectionColorClass(currentSection)
    ? currentSection
    : undefined;

  const sectionLabel = (slug: string) =>
    tSection.has(`${slug}.label`)
      ? tSection(`${slug}.label`)
      : slug.replace(/-/g, ' ');

  const madHax = () => {
    const element = document.getElementsByClassName(
      'DocSearch-Button',
    )[0] as HTMLButtonElement;
    if (element) {
      element.click();
    }
  };

  return (
    <>
      <button
        type="button"
        className={cn(
          inputVariants({ size: large ? '2xl' : 'default' }),
          'pointer-events-auto flex w-full items-center justify-between px-4',
          className,
        )}
        onClick={madHax}
        aria-label={t('button.buttonAriaLabel')}
      >
        <span className="flex items-center">
          <Search
            className={cn(
              'adornment-left mr-2 md:mr-0 lg:mr-2',
              large && '!mr-4',
            )}
          />
          <span className="hidden sm:inline md:hidden lg:inline">
            {t('button.buttonText')}
          </span>
          <span className="sm:hidden">{t('button.buttonTextMobile')}</span>
        </span>

        <kbd
          className={cn(
            'bg-muted text-muted-foreground pointer-events-none ml-4 hidden h-5 items-center gap-1 rounded border px-1.5 font-mono text-xs font-medium opacity-100 select-none',
            'sm:inline-flex',
            large && '!h-6',
          )}
        >
          <span className="text-sm">⌘</span>K
        </kbd>
      </button>
      <div className="hidden">
        <DocSearch
          translations={translations}
          appId={env.NEXT_PUBLIC_ALGOLIA_APPLICATION_ID}
          indices={[
            {
              name: env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME,
              searchParameters: {
                filters: `lang:${locale}`,
                // Boost (not restrict) results from the section the reader is
                // currently in, so same-section pages rank higher while every
                // section still appears. Relies on the crawler-populated,
                // facetable `section` attribute on each record.
                ...(boostSection
                  ? { optionalFilters: [`section:${boostSection}`] }
                  : {}),
              },
            },
          ]}
          apiKey={env.NEXT_PUBLIC_ALGOLIA_API_KEY}
          insights={true}
          placeholder="Search documentation"
          hitComponent={({ hit, children }) => {
            const slug = getSectionSlug(hit.url);
            const colorClass = slug ? getSectionColorClass(slug) : undefined;
            return (
              <a href={hit.url}>
                {slug && colorClass ? (
                  <span
                    className={cn(
                      'mr-2 shrink-0 self-center rounded-full px-2 py-0.5 text-[0.625rem] font-semibold tracking-wide text-white uppercase',
                      colorClass,
                    )}
                  >
                    {sectionLabel(slug)}
                  </span>
                ) : null}
                {children}
              </a>
            );
          }}
        />
      </div>
    </>
  );
};

export default DocSearchComponent;
