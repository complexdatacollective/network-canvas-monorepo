import type { GenerateNetworkParams } from '../generateNetwork.ts';

/**
 * What `generateNetwork` is told about the languages of a protocol written
 * in English alone, as the tests' protocols are: its forms are read in
 * English.
 */
export const ENGLISH_FORMS: Pick<
  GenerateNetworkParams,
  'formLanguage' | 'localization'
> = {
  formLanguage: 'en',
  localization: { defaultLocale: 'en', locales: ['en'] },
};
