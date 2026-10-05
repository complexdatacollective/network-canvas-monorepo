/**
 * Merging and frontier-bounded pagination for one group of the everything bar.
 *
 * Every comparison is defined, including the ones involving a missing optional
 * field, so two providers cannot disagree about the first result or about where
 * a page boundary falls. The final key is the provider-qualified identity,
 * which is unique — the ordering is total.
 */

import type { EverythingBarMatchRange } from './everythingBarMatching';
import type { EverythingBarItem } from './everythingBarModel';

export type EverythingBarEntry = {
  /** `providerId:itemId` — the identity everything else is keyed on. */
  key: string;
  providerId: string;
  item: EverythingBarItem;
  /** Ranges of the label the current query matched. */
  ranges: EverythingBarMatchRange[];
};

export type EverythingBarComparator = (
  a: EverythingBarEntry,
  b: EverythingBarEntry,
) => number;

/**
 * (tier, position, recency, label, qualified key), with absent optional fields
 * placed deterministically: within a tier, items carrying `position` precede
 * items without one, and among the positionless, present `recency` precedes
 * absent.
 */
export function createEntryComparator(
  locale?: string,
): EverythingBarComparator {
  const collator = new Intl.Collator(locale);

  return (a, b) => {
    if (a.item.rank.tier !== b.item.rank.tier) {
      return a.item.rank.tier - b.item.rank.tier;
    }

    const positionA = a.item.rank.position;
    const positionB = b.item.rank.position;
    if (positionA !== undefined && positionB !== undefined) {
      if (positionA !== positionB) return positionA - positionB;
    } else if (positionA !== undefined) {
      return -1;
    } else if (positionB !== undefined) {
      return 1;
    }

    const recencyA = a.item.rank.recency;
    const recencyB = b.item.rank.recency;
    if (recencyA !== undefined && recencyB !== undefined) {
      if (recencyA !== recencyB) return recencyA < recencyB ? 1 : -1;
    } else if (recencyA !== undefined) {
      return -1;
    } else if (recencyB !== undefined) {
      return 1;
    }

    const byLabel = collator.compare(a.item.label, b.item.label);
    if (byLabel !== 0) return byLabel;

    if (a.key === b.key) return 0;
    return a.key < b.key ? -1 : 1;
  };
}

/**
 * A provider that still holds a continuation cursor, together with the last
 * item it has already delivered into this group — its frontier. A provider's
 * stream is rank-ordered, so nothing in its unfetched continuation can rank
 * ahead of that item.
 */
export type EverythingBarFrontier = {
  providerId: string;
  frontier: EverythingBarEntry | undefined;
};

/**
 * Which cursor-holding providers must deliver another page before the next
 * bounded slice can be revealed.
 *
 * A held row may be revealed once it ranks ahead of every cursor-holding
 * provider's frontier. Fetching only when the slice would read past a frontier
 * is what keeps both failure modes out: a held local row is never revealed
 * ahead of a page that could outrank it, and a group with several cursors does
 * not fetch every provider on every activation.
 */
export function providersToFetchBeforeReveal({
  merged,
  revealed,
  bound,
  frontiers,
  compare,
}: {
  merged: EverythingBarEntry[];
  revealed: number;
  bound: number;
  frontiers: EverythingBarFrontier[];
  compare: EverythingBarComparator;
}): string[] {
  const lastOfSlice = merged[revealed + bound - 1];

  return frontiers
    .filter(({ frontier }) => {
      // Nothing delivered yet, or not enough merged rows to fill the slice:
      // the slice necessarily reads past this provider.
      if (frontier === undefined || lastOfSlice === undefined) return true;
      return compare(lastOfSlice, frontier) > 0;
    })
    .map(({ providerId }) => providerId);
}
