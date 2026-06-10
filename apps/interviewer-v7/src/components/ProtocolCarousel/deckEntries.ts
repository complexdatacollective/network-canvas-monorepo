import type { ProtocolWithCounts } from '~/lib/db/types';
import { SAMPLE_PROTOCOL } from '~/lib/protocol/sampleProtocol';
import type { PendingImport } from '~/lib/protocol/useProtocolImport';

// Union shape that determines which card renders in a carousel slot.
export type DeckEntry =
  | { kind: 'protocol'; protocol: ProtocolWithCounts }
  | { kind: 'sample' }
  | { kind: 'pending'; pending: PendingImport }
  | { kind: 'import' };

// Name-based slot identity: entries whose names collide share a slot so the
// card morphs in place (sample → installing → installed protocol). The
// `slot:` namespace guarantees the import entry's key can never collide
// with a protocol name.
export function entryKey(entry: DeckEntry): string {
  switch (entry.kind) {
    case 'protocol':
      return `slot:${entry.protocol.name}`;
    case 'sample':
      return `slot:${SAMPLE_PROTOCOL.name}`;
    case 'pending':
      return `slot:${entry.pending.label}`;
    case 'import':
      return 'import';
  }
}

// Pending wins over sample wins over protocol when two entries collide on
// the same slot key (e.g. a sample-source pending and the sample card, or a
// freshly-imported protocol overlapping its just-cleared pending entry).
const KIND_PRIORITY = {
  pending: 3,
  sample: 2,
  protocol: 1,
  import: 0,
} as const;

type BuildDeckArgs = {
  protocols: ProtocolWithCounts[];
  showSampleCard: boolean;
  pendingImports: PendingImport[];
};

// Merge protocols, the sample teaser, and in-flight imports into slot-keyed
// entries sorted by name; the import trigger is always the last card and
// never participates in slot merging.
export function buildDeck({
  protocols,
  showSampleCard,
  pendingImports,
}: BuildDeckArgs): DeckEntry[] {
  const candidates: DeckEntry[] = protocols.map((protocol) => ({
    kind: 'protocol',
    protocol,
  }));
  if (showSampleCard) candidates.push({ kind: 'sample' });
  for (const pending of pendingImports) {
    candidates.push({ kind: 'pending', pending });
  }

  const bySlot = new Map<string, DeckEntry>();
  for (const candidate of candidates) {
    const key = entryKey(candidate);
    const existing = bySlot.get(key);
    if (
      !existing ||
      KIND_PRIORITY[candidate.kind] > KIND_PRIORITY[existing.kind]
    ) {
      bySlot.set(key, candidate);
    }
  }

  const sorted = Array.from(bySlot.entries())
    .toSorted(([a], [b]) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    )
    .map(([, entry]) => entry);

  return [...sorted, { kind: 'import' }];
}
