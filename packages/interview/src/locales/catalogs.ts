import type { CatalogMessages } from '@codaco/app-i18n/locales';

import enGb from './en-GB.json';
import es from './es.json';

/** Built-in interface messages only; protocol-authored copy is never cataloged. */
export const interviewCatalogs: Readonly<Record<string, CatalogMessages>> = {
  'en-GB': enGb,
  es,
};
