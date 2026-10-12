import type { IntlShape } from '@codaco/app-i18n/messages';
import type {
  EverythingBarItem,
  EverythingBarProvider,
} from '@codaco/fresco-ui/navigation/EverythingBar';

import type {
  NavManifestArea,
  NavManifestEntry,
} from './navigationManifest.ts';

/**
 * The everything bar's `go-to` provider, built from the shell's own navigation
 * manifest — the same entries `ManifestNav` renders as each area's sidebar.
 *
 * This is the structural half of invariant 1: the bar cannot offer a
 * destination the chrome does not have, and cannot miss one the chrome does,
 * because there is one list. It is REAL, not a fixture: everything in this file
 * is derived from `navigationManifest.ts`.
 *
 * Entities — studies and templates across every team the researcher belongs to
 * — share the `go-to` group and are the server-owned other half (§3.1, §5.4).
 * They arrive with `search.entities` as their own remote provider; nothing here
 * needs to change when they do.
 */

/**
 * §3.4's buckets. The area the researcher is in is promoted to 0, so a study
 * destination stays first from every screen of that study, and the rest keep a
 * fixed order: the work, then its team, then the researcher's own settings,
 * then the platform libraries.
 */
const AREA_TIER: Record<NavManifestArea, number> = {
  study: 1,
  editor: 1,
  team: 2,
  account: 3,
  platform: 4,
};

/**
 * Which manifest entries can be activated from the bar.
 *
 * Two exclusions, and both are about not offering a row that goes nowhere new:
 *
 * - a destination this deployment does not have (`unavailableReason`) is
 *   explained in the sidebar and absent here, because a result the researcher
 *   cannot activate is either a dead link or a new non-launching result type;
 * - a `reentry` row — the editor outline's "Back to study" — points at a
 *   destination another area already declares under its own name, so listing it
 *   would render the same href twice.
 */
export function activatableDestinations(
  entries: NavManifestEntry[],
): NavManifestEntry[] {
  return entries.filter(
    (entry) => entry.unavailableReason === undefined && entry.reentry !== true,
  );
}

export function destinationItems({
  entries,
  currentArea,
  intl,
}: {
  entries: NavManifestEntry[];
  currentArea: NavManifestArea | undefined;
  /**
   * Resolves the manifest's message descriptors into the whole strings the
   * bar renders. The provider is re-created when the active locale changes
   * (the caller's memo includes `intl`), so recents re-resolve translated.
   */
  intl: IntlShape;
}): EverythingBarItem[] {
  return activatableDestinations(entries).map((entry, position) => ({
    id: entry.id,
    group: 'go-to',
    label: intl.formatMessage(entry.label),
    context: intl.formatMessage(entry.context),
    // The manifest's own glyph, so a destination looks the same in the bar as
    // in the sidebar it came from.
    icon: entry.icon,
    rank: {
      tier: entry.area === currentArea ? 0 : AREA_TIER[entry.area],
      // Manifest order within the tier: the sidebar's order is the order a
      // researcher has already learnt.
      position,
    },
    activate: { kind: 'navigate', href: entry.href },
  }));
}

/**
 * The provider itself. `persistence: 'recents'`, so activations are stored as
 * references and re-resolved through `resolve` against the manifest the
 * researcher can reach NOW — a destination whose study they have left, or whose
 * deployment does not have it, resolves to `null` and is pruned rather than
 * rendered from a stale label.
 *
 * Hold the returned object in a stable reference and re-create it exactly when
 * the manifest changes; a provider re-created on every render would re-run the
 * bar's whole result pipeline on every render.
 */
export function createDestinationsProvider({
  entries,
  currentArea,
  intl,
}: {
  entries: NavManifestEntry[];
  currentArea: NavManifestArea | undefined;
  intl: IntlShape;
}): EverythingBarProvider {
  const items = destinationItems({ entries, currentArea, intl });

  return {
    id: 'destinations',
    local: true,
    persistence: 'recents',
    items: () => items,
    resolve: (id) =>
      Promise.resolve(items.find((item) => item.id === id) ?? null),
  };
}
