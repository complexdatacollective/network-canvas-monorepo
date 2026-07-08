import type { ProtocolWithCounts } from '~/lib/db/types';
import { DEVELOPMENT_PROTOCOL } from '~/lib/protocol/developmentProtocol';
import { SAMPLE_PROTOCOL } from '~/lib/protocol/sampleProtocol';
import type { PendingImport } from '~/lib/protocol/useProtocolImport';

// Union shape that determines which card renders in a carousel slot.
export type DeckEntry =
  | { kind: 'protocol'; protocol: ProtocolWithCounts }
  | { kind: 'sample' }
  | { kind: 'development' }
  | { kind: 'pending'; pending: PendingImport }
  | { kind: 'import' };

// Slot identity. An installed protocol is keyed by its content hash — the same
// identity the DB uses — so two protocols sharing a name but differing in hash
// each get their own card and stay independently reachable (and deletable).
// Pending imports and the bundled teasers are keyed by name instead: they have
// no resulting hash yet, so name is the only identity available to let their
// card morph in place into the installed protocol (see the name-based
// shadowing in `buildDeck`). The `slot:`/`hash:` namespaces keep the import
// entry's key from ever colliding with a protocol name or hash.
export function entryKey(entry: DeckEntry): string {
  switch (entry.kind) {
    case 'protocol':
      return `hash:${entry.protocol.hash}`;
    case 'sample':
      return `slot:${SAMPLE_PROTOCOL.name}`;
    case 'development':
      return `slot:${DEVELOPMENT_PROTOCOL.name}`;
    case 'pending':
      return `slot:${entry.pending.label}`;
    case 'import':
      return 'import';
  }
}

// The display name each entry occupies a name-slot under, used to let a pending
// import or a bundled teaser shadow the installed protocol they will become.
function entryName(entry: Exclude<DeckEntry, { kind: 'import' }>): string {
  switch (entry.kind) {
    case 'protocol':
      return entry.protocol.name;
    case 'sample':
      return SAMPLE_PROTOCOL.name;
    case 'development':
      return DEVELOPMENT_PROTOCOL.name;
    case 'pending':
      return entry.pending.label;
  }
}

// Pending wins over the bundled teasers wins over protocol when entries share
// a name-slot (e.g. a sample-source pending and the sample card, or a
// freshly-imported protocol overlapping its just-cleared pending entry).
const KIND_PRIORITY = {
  pending: 3,
  sample: 2,
  development: 2,
  protocol: 1,
  import: 0,
} as const;

type BuildDeckArgs = {
  protocols: ProtocolWithCounts[];
  showSampleCard: boolean;
  showDevelopmentCard: boolean;
  pendingImports: PendingImport[];
};

// Merge protocols, the bundled teasers, and in-flight imports into slot-keyed
// entries sorted by name; the import trigger is always the last card and
// never participates in slot merging.
export function buildDeck({
  protocols,
  showSampleCard,
  showDevelopmentCard,
  pendingImports,
}: BuildDeckArgs): DeckEntry[] {
  const candidates: Exclude<DeckEntry, { kind: 'import' }>[] = protocols.map(
    (protocol) => ({
      kind: 'protocol',
      protocol,
    }),
  );
  if (showSampleCard) candidates.push({ kind: 'sample' });
  if (showDevelopmentCard) candidates.push({ kind: 'development' });
  for (const pending of pendingImports) {
    candidates.push({ kind: 'pending', pending });
  }

  // A pending import (or a bundled teaser) shadows every installed protocol
  // that shares its name, so the card morphs in place instead of the deck
  // showing both the installing card and the finished protocol at once. Two
  // installed protocols with the same name but different hashes keep separate
  // slots, so neither becomes unreachable.
  const shadowingNames = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.kind !== 'protocol') {
      shadowingNames.add(entryName(candidate));
    }
  }

  const bySlot = new Map<string, Exclude<DeckEntry, { kind: 'import' }>>();
  for (const candidate of candidates) {
    const shadowed =
      candidate.kind === 'protocol' && shadowingNames.has(entryName(candidate));
    if (shadowed) continue;
    const key = entryKey(candidate);
    const existing = bySlot.get(key);
    if (
      !existing ||
      KIND_PRIORITY[candidate.kind] > KIND_PRIORITY[existing.kind]
    ) {
      bySlot.set(key, candidate);
    }
  }

  const sorted = Array.from(bySlot.values()).toSorted((a, b) =>
    entryName(a).localeCompare(entryName(b), undefined, {
      sensitivity: 'base',
    }),
  );

  return [...sorted, { kind: 'import' }];
}
