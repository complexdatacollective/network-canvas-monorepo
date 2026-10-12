import type { CatalogLoaders } from './locales.ts';
import { defineMessages } from './messages.ts';

/**
 * Universal chrome verbs and boilerplate, translated exactly once for every
 * Network Canvas app. Shared packages and apps import these descriptors
 * instead of defining near-duplicates; anything with app-specific phrasing
 * belongs in the app's own catalog, not here.
 */
export const commonMessages = defineMessages({
  cancel: {
    id: 'common.cancel',
    defaultMessage: 'Cancel',
    description: 'Generic action that abandons the current operation.',
  },
  save: {
    id: 'common.save',
    defaultMessage: 'Save',
    description: 'Generic action that persists the current changes.',
  },
  close: {
    id: 'common.close',
    defaultMessage: 'Close',
    description:
      'Generic action or accessible name that dismisses a panel or dialog.',
  },
  delete: {
    id: 'common.delete',
    defaultMessage: 'Delete',
    description: 'Generic action that removes the selected item.',
  },
  confirm: {
    id: 'common.confirm',
    defaultMessage: 'Confirm',
    description: 'Generic action that accepts a confirmation prompt.',
  },
  continue: {
    id: 'common.continue',
    defaultMessage: 'Continue',
    description: 'Generic action that advances to the next step.',
  },
  back: {
    id: 'common.back',
    defaultMessage: 'Back',
    description: 'Generic action that returns to the previous step.',
  },
  done: {
    id: 'common.done',
    defaultMessage: 'Done',
    description: 'Generic action that finishes the current flow.',
  },
  retry: {
    id: 'common.retry',
    defaultMessage: 'Try again',
    description: 'Generic action that retries a failed operation.',
  },
  loading: {
    id: 'common.loading',
    defaultMessage: 'Loading…',
    description: 'Generic indicator shown while content is being fetched.',
  },
  search: {
    id: 'common.search',
    defaultMessage: 'Search',
    description: 'Generic label or accessible name for a search input.',
  },
  genericError: {
    id: 'common.genericError',
    defaultMessage: 'Something went wrong.',
    description:
      'Generic failure sentence shown when no more specific error applies.',
  },
});

/**
 * The common catalog per non-source locale, complete for every entry of
 * `ecosystemLocales` (English renders from the descriptors themselves).
 * en-GB is an override catalog: the common verb set currently has no British
 * divergences, so it is empty by design — the file exists so the layering
 * and guards cover it.
 *
 * The imports deliberately carry no `with { type: 'json' }` attribute.
 * Storybook's Next.js Vite builder transforms this file with Next's SWC, and
 * `vite-plugin-storybook-nextjs` hardcodes `emitAssertForImportAttributes`,
 * rewriting the attribute to the legacy `assert` keyword Chromium removed —
 * Fresco's Storybook reaches this module through fresco-ui, so the attribute
 * broke every story that renders a localized component. The cost is that
 * Node's own ESM loader, which wants the attribute, cannot load these
 * catalogs; every consumer bundles.
 */
export const commonCatalogLoaders: CatalogLoaders = {
  'en-GB': () => import('./locales/en-GB.json'),
  'es': () => import('./locales/es.json'),
  'zh-Hans': () => import('./locales/zh-Hans.json'),
  'zh-Hant': () => import('./locales/zh-Hant.json'),
  'de': () => import('./locales/de.json'),
  'nl': () => import('./locales/nl.json'),
  'pt-BR': () => import('./locales/pt-BR.json'),
  'it': () => import('./locales/it.json'),
  'fr': () => import('./locales/fr.json'),
};
