import type { CatalogMessages } from '@codaco/app-i18n/locales';

import enGb from './en-GB.json';
import es from './es.json';

/** Package-owned researcher copy, merged by localized authoring hosts. */
export const protocolBuilderCatalogs: Readonly<
  Record<string, CatalogMessages>
> = {
  'en-GB': enGb,
  es,
};
