'use client';

import { DocSearch } from '@docsearch/react';
import { useLocale, useTranslations } from 'next-intl';
import '@docsearch/css';
import { env } from '~/env.mjs';
import { inputClasses } from '@codaco/ui';
import { Search } from 'lucide-react';
import { cn } from '~/lib/utils';

const DocSearchComponent = ({ className }: { className?: string }) => {
  const locale = useLocale();
  const t = useTranslations('DocSearch');

  // This is honestly some of the biggest bullshit I've ever had to deal with.
  // Algolia - fix your shit.
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
        className={cn(
          inputClasses,
          'pointer-events-auto flex w-full items-center justify-between px-4',
          'md:w-auto',
          className,
        )}
        onClick={madHax}
        aria-label={t('button.buttonAriaLabel')}
      >
        <span className="flex items-center">
          <Search className="mr-2 md:mr-0 lg:mr-2" />
          <span className="hidden sm:inline md:hidden lg:inline">
            {t('button.buttonText')}
          </span>
          <span className="sm:hidden">{t('button.buttonTextMobile')}</span>
        </span>

        <kbd className="pointer-events-none ml-4 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>
      <div className="hidden">
        <DocSearch
          translations={{
            button: {
              buttonText: t('button.buttonText'),
              buttonAriaLabel: t('button.buttonAriaLabel'),
            },
            modal: {
              searchBox: {
                resetButtonTitle: t('modal.searchBox.resetButtonTitle'),
                resetButtonAriaLabel: t('modal.searchBox.resetButtonAriaLabel'),
                cancelButtonText: t('modal.searchBox.cancelButtonText'),
                cancelButtonAriaLabel: t(
                  'modal.searchBox.cancelButtonAriaLabel',
                ),
              },
              startScreen: {
                recentSearchesTitle: t('modal.startScreen.recentSearchesTitle'),
                noRecentSearchesText: t(
                  'modal.startScreen.noRecentSearchesText',
                ),
                saveRecentSearchButtonTitle: t(
                  'modal.startScreen.saveRecentSearchButtonTitle',
                ),
                removeRecentSearchButtonTitle: t(
                  'modal.startScreen.removeRecentSearchButtonTitle',
                ),
                favoriteSearchesTitle: t(
                  'modal.startScreen.favoriteSearchesTitle',
                ),
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
                navigateUpKeyAriaLabel: t(
                  'modal.footer.navigateUpKeyAriaLabel',
                ),
                navigateDownKeyAriaLabel: t(
                  'modal.footer.navigateDownKeyAriaLabel',
                ),
                closeText: t('modal.footer.closeText'),
                closeKeyAriaLabel: t('modal.footer.closeKeyAriaLabel'),
                searchByText: t('modal.footer.searchByText'),
              },
              noResultsScreen: {
                noResultsText: t('modal.noResultsScreen.noResultsText'),
                suggestedQueryText: t(
                  'modal.noResultsScreen.suggestedQueryText',
                ),
                reportMissingResultsText: t(
                  'modal.noResultsScreen.reportMissingResultsText',
                ),
                reportMissingResultsLinkText: t(
                  'modal.noResultsScreen.reportMissingResultsLinkText',
                ),
              },
            },
          }}
          appId={env.NEXT_PUBLIC_ALGOLIA_APPLICATION_ID}
          indexName={env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME}
          apiKey={env.NEXT_PUBLIC_ALGOLIA_API_KEY}
          insights={true}
          placeholder="Search documentation"
          searchParameters={{
            filters: `lang:${locale}`,
          }}
        />
      </div>
    </>
  );
};

export default DocSearchComponent;
