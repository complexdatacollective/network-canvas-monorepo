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
// no resulting hash yet, so name is the only identity available. Sharing that
// key is what lets a teaser's card become the installing card and then morph in
// place into the installed protocol (see `buildDeck`). The `slot:`/`hash:`
// namespaces keep the import entry's key from ever colliding with a protocol
// name or hash.
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

// Pending wins over the bundled teasers when entries share a name-slot (an
// in-flight sample install and the sample card), so the teaser's slot shows the
// install progress.
const KIND_PRIORITY = {
  pending: 3,
  sample: 2,
  development: 2,
  protocol: 1,
  import: 0,
} as const;

type BuildDeckArgs = {
  // Display ordering only: slot/hash identity always retains the authored name.
  locale?: string;
  protocols: ProtocolWithCounts[];
  showSampleCard: boolean;
  showDevelopmentCard: boolean;
  pendingImports: PendingImport[];
};

// Merge protocols, the bundled teasers, and in-flight imports into slot-keyed
// entries sorted by name; the import trigger is always the last card and
// never participates in slot merging.
export function buildDeck({
  locale = 'en',
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
  // A teaser offers a protocol the researcher doesn't have yet, so an
  // installed protocol of the same name drops it: that card owns the name, and
  // it is the one carrying the "Start new interview" and delete controls. The
  // caller's flags say whether a teaser is wanted at all (the researcher's
  // preference, the dev build); whether one is redundant is decided here, so
  // the two teasers can't answer that question differently.
  const installedNames = new Set(protocols.map((protocol) => protocol.name));
  const teasers: Exclude<DeckEntry, { kind: 'import' }>[] = [];
  if (showSampleCard) teasers.push({ kind: 'sample' });
  if (showDevelopmentCard) teasers.push({ kind: 'development' });
  for (const teaser of teasers) {
    if (!installedNames.has(entryName(teaser))) candidates.push(teaser);
  }

  for (const pending of pendingImports) {
    candidates.push({ kind: 'pending', pending });
  }

  // A pending import shadows every installed protocol that shares its name, so
  // the card morphs in place instead of the deck showing both the installing
  // card and the finished protocol at once. Two installed protocols with the
  // same name but different hashes keep separate slots, so neither becomes
  // unreachable. Only pending entries shadow: a teaser is a candidate at all
  // only while nothing of its name is installed.
  const shadowingNames = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.kind === 'pending') {
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

  const collator = new Intl.Collator(locale, { sensitivity: 'base' });
  const sorted = Array.from(bySlot.values()).toSorted((a, b) =>
    collator.compare(entryName(a), entryName(b)),
  );

  return [...sorted, { kind: 'import' }];
}
