import { commonCatalogLoaders } from '@codaco/app-i18n/common';
import { createCatalogSource } from '@codaco/app-i18n/locales';
import type { CatalogMessages } from '@codaco/app-i18n/locales';
import { frescoUiCatalogLoaders } from '@codaco/fresco-ui/locales';

import { interviewCatalogLoaders } from '../locales/catalogs';
import { type RequestedLocale, resolveInterviewLocale } from './locales';

// Every interface language, merged common → fresco-ui → interview and loaded
// one language at a time: each is its own chunk, so an interview downloads
// and parses only the language it shows. Offline hosts still have every
// language because their service workers precache every chunk of the build,
// not because this module carries them. One source serves every Shell on the
// page, so a language is fetched once however many interviews show it, while
// each provider keeps its own locale and formatter: no parent catalog or
// mutable global locale can leak a researcher's language into another
// interview on the same page.
export const interviewCatalogSource = createCatalogSource(
  commonCatalogLoaders,
  frescoUiCatalogLoaders,
  interviewCatalogLoaders,
);

/** The interview's messages in the language a Shell will show. */
export type InterviewCatalog = Readonly<{
  locale: string;
  messages: CatalogMessages;
}>;

/**
 * Loads the catalog a `Shell` given the same `requestedLocale` and
 * `localePreference` will show, negotiated exactly as the Shell negotiates it.
 *
 * A server host awaits it and passes the result to the Shell's `catalog`, so
 * the interview renders without suspending and hydrates without a download. A
 * client host calls it without awaiting while it prepares the interview, so
 * the download runs alongside that work instead of starting once the Shell
 * mounts.
 */
export async function loadInterviewCatalog(
  requestedLocale?: RequestedLocale,
  localePreference?: string | null,
): Promise<InterviewCatalog> {
  const locale = resolveInterviewLocale(requestedLocale, localePreference);
  return { locale, messages: await interviewCatalogSource.load(locale) };
}
