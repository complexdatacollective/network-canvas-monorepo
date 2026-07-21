'use client';

import { DocSearch } from '@docsearch/react';
import '@docsearch/css';
import { Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useLayoutEffect, useRef } from 'react';

import { usePageBackgroundTargetRef } from '@codaco/art';
import { inputFieldControlVariants } from '@codaco/fresco-ui/form/fields/InputField';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { env } from '~/env';
import { getDocSearchConfig } from '~/lib/docSearchConfig';
import { getSectionColorClass } from '~/lib/sections';
import { usePathname } from '~/navigation';

const docSearchConfig = getDocSearchConfig({
  appId: env.NEXT_PUBLIC_ALGOLIA_APPLICATION_ID,
  indexName: env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME,
  apiKey: env.NEXT_PUBLIC_ALGOLIA_API_KEY,
});

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

const openDocSearch = () => {
  document.querySelector<HTMLButtonElement>('.DocSearch-Button')?.click();
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
  backgroundTarget = false,
  className,
  large,
}: {
  backgroundTarget?: boolean;
  className?: string;
  large?: boolean;
}) => {
  const locale = useLocale();
  const t = useTranslations('DocSearch');
  const tSection = useTranslations('SectionSwitcher');
  const translations = useDocSearchTranslations();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const backgroundTargetRef = usePageBackgroundTargetRef();
  const isSearchAvailable = docSearchConfig !== null;

  const selectVisibleSearchAsBackgroundTarget = useCallback(() => {
    const button = buttonRef.current;
    if (
      !backgroundTarget ||
      !button ||
      button.offsetWidth === 0 ||
      button.offsetHeight === 0
    ) {
      return;
    }

    backgroundTargetRef?.(button);
  }, [backgroundTarget, backgroundTargetRef]);

  useLayoutEffect(() => {
    const button = buttonRef.current;
    if (!backgroundTarget || !button) return undefined;

    selectVisibleSearchAsBackgroundTarget();

    const observer = new ResizeObserver(selectVisibleSearchAsBackgroundTarget);
    observer.observe(button);
    window.addEventListener('resize', selectVisibleSearchAsBackgroundTarget);

    return () => {
      observer.disconnect();
      window.removeEventListener(
        'resize',
        selectVisibleSearchAsBackgroundTarget,
      );
    };
  }, [backgroundTarget, selectVisibleSearchAsBackgroundTarget]);

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

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={inputFieldControlVariants({
          size: large ? 'lg' : 'md',
          state: 'normal',
          className: cx(
            'pointer-events-auto w-full shrink',
            isSearchAvailable
              ? 'cursor-pointer'
              : 'cursor-not-allowed opacity-50',
            className,
          ),
        })}
        onClick={openDocSearch}
        disabled={!isSearchAvailable}
        aria-label={
          isSearchAvailable
            ? t('button.buttonAriaLabel')
            : t('button.buttonUnavailableText')
        }
        aria-haspopup={isSearchAvailable ? 'dialog' : undefined}
        title={
          isSearchAvailable ? undefined : t('button.buttonUnavailableText')
        }
      >
        <Search aria-hidden />
        <span
          className={cx(
            'text-input-contrast/50 min-w-0 grow basis-0 text-left italic',
            'phone-landscape:inline tablet-portrait:hidden tablet-landscape:inline hidden',
          )}
        >
          {t('button.buttonText')}
        </span>
        <span
          className={cx(
            'text-input-contrast/50 min-w-0 grow basis-0 text-left italic',
            'phone-landscape:hidden',
          )}
        >
          {t('button.buttonTextMobile')}
        </span>

        <kbd
          className={cx(
            'pointer-events-none ml-auto hidden h-5 shrink-0 items-center gap-1 rounded border bg-current/5 px-1.5 text-xs font-medium text-current/70 not-italic opacity-100 select-none',
            'phone-landscape:inline-flex',
            large && 'h-6',
          )}
        >
          <span className="text-sm">⌘</span>K
        </kbd>
      </button>
      {docSearchConfig ? (
        <div className="hidden">
          <DocSearch
            translations={translations}
            appId={docSearchConfig.appId}
            indices={[
              {
                name: docSearchConfig.indexName,
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
            apiKey={docSearchConfig.apiKey}
            insights={true}
            placeholder="Search documentation"
            hitComponent={({ hit, children }) => {
              const slug = getSectionSlug(hit.url);
              const colorClass = slug ? getSectionColorClass(slug) : undefined;
              return (
                <a href={hit.url}>
                  {slug && colorClass ? (
                    <span
                      className={cx(
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
      ) : null}
    </>
  );
};

export default DocSearchComponent;
