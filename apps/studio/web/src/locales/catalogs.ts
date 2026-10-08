import { commonCatalogLoaders } from '@codaco/app-i18n/common';
import { createCatalogSource } from '@codaco/app-i18n/locales';
import type { CatalogLoaders } from '@codaco/app-i18n/locales';
import { frescoUiCatalogLoaders } from '@codaco/fresco-ui/locales';
import { protocolBuilderCatalogLoaders } from '@codaco/protocol-builder/locales';

/**
 * Studio's own catalogs: a loader per non-source locale it translates, which
 * today is only the British override. English has no runtime catalog — every
 * descriptor renders its own defaultMessage — and the dev-only pseudo-locale
 * transforms formatter output rather than reading a catalog.
 *
 * `en.json` in this directory is deliberately absent from this manifest: it
 * is the extraction artifact the catalog guards diff, never a runtime import.
 */
export const studioCatalogLoaders: CatalogLoaders = {
  'en-GB': () => import('./en-GB.json'),
};

/**
 * The merged message catalog per non-source locale (2026-09-04 localization
 * design §4.7), loaded when a locale becomes active rather than bundled
 * up front. Merge order is common → shared packages → app; dot-namespaced ids
 * make overlap structurally impossible.
 *
 * Studio's registry is `en` and `en-GB` only, so no other locale is ever
 * requested and the other languages the shared packages ship are never
 * fetched. They stay as loaders — each is its own chunk, unreferenced at
 * runtime — because those packages' guards are driven off the ecosystem's
 * locale list rather than off any one host. The stage editors Studio mounts
 * come from @codaco/protocol-builder, and they declare their own
 * `protocolBuilder.*` ids.
 */
export const studioCatalogSource = createCatalogSource(
  commonCatalogLoaders,
  frescoUiCatalogLoaders,
  protocolBuilderCatalogLoaders,
  studioCatalogLoaders,
);
