import { describe, expect, it } from 'vitest';

import {
  createEntryComparator,
  providersToFetchBeforeReveal,
  type EverythingBarEntry,
} from '../everythingBarMerge';
import { qualifiedKey, type EverythingBarRank } from '../everythingBarModel';

function entry(
  providerId: string,
  id: string,
  label: string,
  rank: EverythingBarRank,
): EverythingBarEntry {
  return {
    key: qualifiedKey(providerId, id),
    providerId,
    item: {
      id,
      group: 'go-to',
      label,
      rank,
      activate: { kind: 'navigate', href: `/${id}` },
    },
    ranges: [],
  };
}

const compare = createEntryComparator('en');
const order = (entries: EverythingBarEntry[]) =>
  entries.toSorted(compare).map((candidate) => candidate.item.label);

describe('createEntryComparator', () => {
  it('ranks by tier before anything else', () => {
    const tierZero = entry('remote', 'a', 'Zebra', { tier: 0 });
    const tierOne = entry('local', 'b', 'Alpha', { tier: 1 });

    expect(order([tierOne, tierZero])).toEqual(['Zebra', 'Alpha']);
  });

  it('keeps a server-ranked page in position order rather than alphabetising it', () => {
    // Deliberately non-alphabetical: a component that ignored `position`
    // would sort these the other way round.
    const first = entry('docs', '1', 'Zebra crossings', {
      tier: 0,
      position: 0,
    });
    const second = entry('docs', '2', 'Anonymisation', {
      tier: 0,
      position: 1,
    });

    expect(order([second, first])).toEqual([
      'Zebra crossings',
      'Anonymisation',
    ]);
  });

  it('places an item carrying a position ahead of one without', () => {
    const positioned = entry('docs', '1', 'Zebra', { tier: 0, position: 3 });
    const positionless = entry('entities', '2', 'Alpha', { tier: 0 });

    expect(order([positionless, positioned])).toEqual(['Zebra', 'Alpha']);
  });

  it('orders by recency, most recent first, ahead of items without one', () => {
    const older = entry('entities', '1', 'Alpha', {
      tier: 0,
      recency: '2026-01-01T00:00:00.000Z',
    });
    const newer = entry('entities', '2', 'Beta', {
      tier: 0,
      recency: '2026-08-01T00:00:00.000Z',
    });
    const undated = entry('entities', '3', 'Aardvark', { tier: 0 });

    expect(order([undated, older, newer])).toEqual([
      'Beta',
      'Alpha',
      'Aardvark',
    ]);
  });

  it('is total: equal labels fall back to the provider-qualified key', () => {
    const fromCommands = entry('commands', 'settings', 'Settings', { tier: 0 });
    const fromDestinations = entry('destinations', 'settings', 'Settings', {
      tier: 0,
    });

    expect(compare(fromCommands, fromDestinations)).toBeLessThan(0);
    expect(compare(fromDestinations, fromCommands)).toBeGreaterThan(0);
    expect(compare(fromCommands, fromCommands)).toBe(0);
  });

  it('produces the same order whichever way the input is shuffled', () => {
    const entries = [
      entry('local', 'a', 'Alpha', { tier: 1 }),
      entry('remote', 'b', 'Beta', { tier: 0, position: 1 }),
      entry('remote', 'c', 'Gamma', { tier: 0, position: 0 }),
      entry('remote', 'd', 'Delta', {
        tier: 0,
        recency: '2026-02-02T00:00:00.000Z',
      }),
      entry('remote', 'e', 'Epsilon', { tier: 0 }),
    ];

    const forwards = order(entries);
    const backwards = order(entries.toReversed());

    expect(forwards).toEqual(['Gamma', 'Beta', 'Delta', 'Epsilon', 'Alpha']);
    expect(backwards).toEqual(forwards);
  });
});

describe('providersToFetchBeforeReveal', () => {
  const merged = [
    entry('local', 'a', 'A', { tier: 0, position: 0 }),
    entry('local', 'b', 'B', { tier: 0, position: 1 }),
    entry('remote', 'c', 'C', { tier: 0, position: 2 }),
    entry('local', 'd', 'D', { tier: 0, position: 3 }),
  ];
  const remoteFrontier = merged[2];

  it('fetches nothing when the next slice stays ahead of every frontier', () => {
    expect(
      providersToFetchBeforeReveal({
        merged,
        revealed: 1,
        bound: 1,
        frontiers: [{ providerId: 'remote', frontier: remoteFrontier }],
        compare,
      }),
    ).toEqual([]);
  });

  it('fetches a provider whose frontier the slice would read past', () => {
    // Revealing rows 3 and 4 would show the held local row D, which ranks
    // after everything the remote provider has delivered so far.
    expect(
      providersToFetchBeforeReveal({
        merged,
        revealed: 2,
        bound: 2,
        frontiers: [{ providerId: 'remote', frontier: remoteFrontier }],
        compare,
      }),
    ).toEqual(['remote']);
  });

  it('fetches when the merged rows cannot fill the slice at all', () => {
    expect(
      providersToFetchBeforeReveal({
        merged,
        revealed: 4,
        bound: 5,
        frontiers: [{ providerId: 'remote', frontier: remoteFrontier }],
        compare,
      }),
    ).toEqual(['remote']);
  });

  it('fetches a provider that has delivered nothing yet', () => {
    expect(
      providersToFetchBeforeReveal({
        merged,
        revealed: 1,
        bound: 1,
        frontiers: [{ providerId: 'remote', frontier: undefined }],
        compare,
      }),
    ).toEqual(['remote']);
  });
});
