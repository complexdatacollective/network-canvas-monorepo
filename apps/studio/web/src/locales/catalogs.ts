import { commonCatalogs } from '@codaco/app-i18n/common';
import { mergeCatalogs } from '@codaco/app-i18n/locales';
import type { CatalogMessages } from '@codaco/app-i18n/locales';
import { frescoUiCatalogs } from '@codaco/fresco-ui/locales';
import protocolBuilderEnGb from '@codaco/protocol-builder/locales/en-GB';

import studioEnGb from './en-GB.json';

/**
 * The merged message catalog per non-source locale (2026-09-04 localization
 * design §4.7). Merge order is common → shared packages → app; dot-namespaced
 * ids make overlap structurally impossible. English has no runtime catalog —
 * every descriptor renders its own defaultMessage — and the dev-only
 * pseudo-locale transforms formatter output rather than reading a catalog.
 *
 * `en.json` in this directory is deliberately absent from this manifest: it
 * is the extraction artifact the catalog guards diff, never a runtime import.
 */
export const studioCatalogs: Readonly<
  Record<string, CatalogMessages | undefined>
> = {
  'en-GB': mergeCatalogs(
    commonCatalogs['en-GB'] ?? {},
    frescoUiCatalogs['en-GB'] ?? {},
    // The stage editors Studio mounts come from @codaco/protocol-builder, and
    // they declare their own `protocolBuilder.*` ids. Studio's own registry is
    // en and en-GB only, so only that catalog is imported: the package's
    // catalog map would bundle every locale it ships.
    protocolBuilderEnGb,
    studioEnGb,
  ),
};
