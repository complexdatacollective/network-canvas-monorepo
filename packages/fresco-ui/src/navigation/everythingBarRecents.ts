'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { EverythingBarEntry } from './everythingBarMerge';
import {
  qualifiedKey,
  type EverythingBarItem,
  type EverythingBarProvider,
} from './everythingBarModel';

/**
 * Recents are stored as references — a provider id and an item id — never as a
 * snapshot to render. Rendering a stored label would resurrect destinations the
 * researcher can no longer reach and labels that no longer exist, so every
 * reference is re-resolved through its provider against current permissions
 * before it appears, and an entry that no longer resolves is pruned.
 *
 * A provider declaring `persistence: 'never'` has nothing written for it at
 * all: the policy is provider-level, so a sensitive provider cannot leak an
 * identifying label into `localStorage` by forgetting to mark one row.
 */
export type EverythingBarRecentRef = { providerId: string; itemId: string };

export const DEFAULT_RECENTS_LIMIT = 5;

/** Recents are a convenience: unreadable storage yields no recents, never an error. */
function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Tolerates anything: absent, cleared, truncated, or written by another version. */
export function parseRecents(raw: string | null): EverythingBarRecentRef[] {
  if (raw === null) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (entry): entry is EverythingBarRecentRef =>
        typeof entry === 'object' &&
        entry !== null &&
        'providerId' in entry &&
        typeof entry.providerId === 'string' &&
        'itemId' in entry &&
        typeof entry.itemId === 'string',
    );
  } catch {
    return [];
  }
}

/** Most recent first, deduplicated by qualified identity, bounded. */
export function addRecent(
  refs: EverythingBarRecentRef[],
  next: EverythingBarRecentRef,
  limit: number,
): EverythingBarRecentRef[] {
  const nextKey = qualifiedKey(next.providerId, next.itemId);
  return [
    next,
    ...refs.filter(
      (ref) => qualifiedKey(ref.providerId, ref.itemId) !== nextKey,
    ),
  ].slice(0, Math.max(limit, 0));
}

export function readRecents(storageKey: string): EverythingBarRecentRef[] {
  const storage = getStorage();
  if (!storage) return [];

  try {
    return parseRecents(storage.getItem(storageKey));
  } catch {
    return [];
  }
}

export function writeRecents(
  storageKey: string,
  refs: EverythingBarRecentRef[],
): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(storageKey, JSON.stringify(refs));
  } catch {
    // A full or blocked store costs the researcher their recents, nothing else.
  }
}

type ResolutionOutcome = {
  ref: EverythingBarRecentRef;
  entry: EverythingBarEntry | null;
  /**
   * Whether the provider actually answered. A provider that is not registered
   * on this screen, or whose resolve rejected, has not told us the entry is
   * gone — only a `null` resolution has, and only that prunes.
   */
  answered: boolean;
};

async function resolveRef(
  ref: EverythingBarRecentRef,
  providers: EverythingBarProvider[],
): Promise<ResolutionOutcome> {
  const provider = providers.find(
    (candidate) => candidate.id === ref.providerId,
  );
  if (!provider || provider.persistence !== 'recents') {
    return { ref, entry: null, answered: false };
  }

  try {
    const item = await provider.resolve(ref.itemId);
    if (!item) return { ref, entry: null, answered: true };
    return {
      ref,
      entry: {
        key: qualifiedKey(provider.id, item.id),
        providerId: provider.id,
        item,
        ranges: [],
      },
      answered: true,
    };
  } catch {
    return { ref, entry: null, answered: false };
  }
}

/**
 * Resolves the stored references whenever the bar opens, prunes the ones their
 * provider no longer returns, and records new activations.
 */
export function useEverythingBarRecents({
  providers,
  open,
  storageKey,
  limit = DEFAULT_RECENTS_LIMIT,
}: {
  providers: EverythingBarProvider[];
  open: boolean;
  storageKey: string;
  limit?: number;
}) {
  const [entries, setEntries] = useState<EverythingBarEntry[]>([]);
  const providersRef = useRef(providers);
  providersRef.current = providers;

  useEffect(() => {
    if (!open) return undefined;

    const refs = readRecents(storageKey).slice(0, limit);
    if (refs.length === 0) {
      setEntries([]);
      return undefined;
    }

    let cancelled = false;
    const resolveAll = async () => {
      const outcomes = await Promise.all(
        refs.map((ref) => resolveRef(ref, providersRef.current)),
      );
      if (cancelled) return;

      setEntries(
        outcomes
          .map((outcome) => outcome.entry)
          .filter((entry): entry is EverythingBarEntry => entry !== null),
      );

      const kept = outcomes
        .filter((outcome) => outcome.entry !== null || !outcome.answered)
        .map((outcome) => outcome.ref);
      if (kept.length !== refs.length) writeRecents(storageKey, kept);
    };

    void resolveAll();

    return () => {
      cancelled = true;
    };
  }, [open, storageKey, limit]);

  const record = useCallback(
    (providerId: string, item: EverythingBarItem) => {
      const provider = providersRef.current.find(
        (candidate) => candidate.id === providerId,
      );
      if (!provider || provider.persistence !== 'recents') return;

      writeRecents(
        storageKey,
        addRecent(
          readRecents(storageKey),
          { providerId, itemId: item.id },
          limit,
        ),
      );
    },
    [storageKey, limit],
  );

  return { entries, record };
}
