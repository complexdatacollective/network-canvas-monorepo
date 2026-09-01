import type { ComponentType } from 'react';

/**
 * The everything bar's provider seam.
 *
 * Apps own what exists and whether the researcher may see it; the component
 * owns matching, grouping, bounds, pagination, error containment, keyboard
 * model and recents. Nothing here reaches an app's router, RPC layer or
 * translation catalogue — a provider hands over already-translated labels and
 * declarative activations, and the component reports rather than performs.
 */

/**
 * Fixed render order. Group order never changes, which is what makes the bar
 * learnable and the first `Enter` press predictable.
 */
export const EVERYTHING_BAR_GROUPS = [
  'go-to',
  'commands',
  'documentation',
] as const;

export type EverythingBarGroup = (typeof EVERYTHING_BAR_GROUPS)[number];

/**
 * What activating a result does, expressed declaratively so a launcher can
 * never hold a mutation:
 *
 * - `navigate` — an ordinary router navigation to `href`.
 * - `open` — navigate to the screen that owns a surface, and ask it to open
 *   that surface on arrival. `surface` is an identifier the destination screen
 *   registers ("members.invite"), never a callback.
 * - `external` — leave the app in a new tab (documentation results).
 */
export type EverythingBarActivation =
  | { kind: 'navigate'; href: string }
  | { kind: 'open'; href: string; surface: string }
  | { kind: 'external'; href: string };

/**
 * How a provider normalises its own context into the shared ordering. The
 * component merges every provider's items within a group by tier, then
 * position, then recency, then label, then the provider-qualified key.
 */
export type EverythingBarRank = {
  /** The ranking bucket: 0 is the researcher's current context. */
  tier: number;
  /**
   * The provider's own order within the tier, ascending. A server-ranked page
   * keeps its relevance order through the merge by numbering its items
   * absolutely across pages.
   */
  position?: number;
  /** ISO timestamp used for within-tier ordering, most recent first. */
  recency?: string;
};

export type EverythingBarItem = {
  /** Unique across this provider's complete inventory, and resource-scoped. */
  id: string;
  group: EverythingBarGroup;
  /** Already translated by the provider. */
  label: string;
  /** Secondary line, e.g. "Team" or "Study · Field Research Lab". */
  context?: string;
  /**
   * The glyph for this result, mirroring the navigation manifest's own `icon`
   * so a destination looks the same in the bar as it does in the sidebar it
   * came from. Rendered decoratively, tinted by the item's group.
   *
   * Optional: a result without one falls back to its group's default glyph, so
   * a row is never iconless and a provider is never forced to invent one.
   */
  icon?: ComponentType<{ className?: string }>;
  rank: EverythingBarRank;
  /** Rendered keys, read from the app's shortcut registry, e.g. ['G', 'A']. */
  chordHint?: string[];
  activate: EverythingBarActivation;
};

export type EverythingBarSearchPage = {
  items: EverythingBarItem[];
  /** Continuation cursor; present only while the provider holds more. */
  next?: string;
};

type EverythingBarLocality =
  | {
      /**
       * A synchronous inventory. The component filters, matches, ranks and
       * pages it itself, on the same keystroke — no promise, so a local result
       * can never be mistaken for a late remote one.
       */
      local: true;
      items(): EverythingBarItem[];
    }
  | {
      /** A debounced, abortable, paged search. */
      local: false;
      /**
       * The groups this provider can contribute to.
       *
       * Results carry their own group, so this is only needed for the rows
       * that exist BEFORE any result does: the per-group pending indicator and
       * the retryable error row. Omitting it is safe — the component then
       * places those rows in the groups the provider has already been seen to
       * serve, and outside the groups entirely until it has served one.
       */
      groups?: readonly EverythingBarGroup[];
      search(
        query: string,
        signal: AbortSignal,
        cursor?: string,
      ): Promise<EverythingBarSearchPage>;
      /** Optional current-context content for the empty query. */
      empty?(signal: AbortSignal): Promise<EverythingBarItem[]>;
    };

type EverythingBarPersistence =
  | {
      persistence: 'recents';
      /**
       * Recents are stored as references, so an activation must be revalidated
       * against the researcher's current permissions before it renders again.
       * Resolving to `null` prunes the stored reference.
       */
      resolve(id: string): Promise<EverythingBarItem | null>;
    }
  /** No per-item escape hatch: nothing from this provider is ever persisted. */
  | { persistence: 'never' };

export type EverythingBarProvider = { id: string } & EverythingBarLocality &
  EverythingBarPersistence;

export type EverythingBarRemoteProvider = Extract<
  EverythingBarProvider,
  { local: false }
>;

/**
 * Item identity is provider-qualified everywhere: highlighting, activation,
 * React reconciliation, `aria-activedescendant` and recents. Two providers
 * returning the same natural id therefore cannot collide.
 */
export function qualifiedKey(providerId: string, itemId: string): string {
  return `${providerId}:${itemId}`;
}

export function isRemoteProvider(
  provider: EverythingBarProvider,
): provider is EverythingBarRemoteProvider {
  return !provider.local;
}
