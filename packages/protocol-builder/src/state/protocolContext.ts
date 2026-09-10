import { useQueries, useQuery } from '@tanstack/react-query';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import type { ProtocolSectionId } from '@codaco/studio-sync/taxonomy';

import {
  protocolContextFromSections,
  type ProtocolBuilderProtocolContext,
} from '../protocol-context.ts';
import { useProtocolBuilderContext } from './context.ts';
import type { SectionAtRevision } from './hooks.ts';

const NO_SECTIONS: readonly ProtocolSectionId[] = Object.freeze([]);

export type ProtocolSections = Readonly<Record<string, SectionDoc>>;

/**
 * How far a reader of the WHOLE protocol has got.
 *
 * Three answers rather than "the sections so far", because for such a reader a
 * partial protocol is not a smaller one but a wrong one — a stage still on its
 * way reads as a stage the protocol does not have — and because a read that
 * FAILED never becomes a read that is still coming. Nothing here retries past
 * the query's own attempts and nothing refetches, so a reader told only
 * "not yet" would wait for ever.
 */
export type ProtocolReading =
  | Readonly<{ status: 'reading' }>
  | Readonly<{ status: 'unreadable' }>
  | Readonly<{ status: 'read'; sections: ProtocolSections }>;

const STILL_READING: ProtocolReading = Object.freeze({ status: 'reading' });
const UNREADABLE: ProtocolReading = Object.freeze({ status: 'unreadable' });

type Derivation = Readonly<{
  sections: ProtocolSections;
  context: ProtocolBuilderProtocolContext;
  reading: ProtocolReading;
}>;

/**
 * The last few readings of the protocol, keyed by the revisions they were made
 * from.
 *
 * Two things depend on this rather than on a hook's own memo. The record has to
 * be the SAME object for every reader at a given set of revisions, so that the
 * query layer's structural sharing recognises an unchanged combination without
 * walking every section of the protocol. And the derivation parses every
 * section against the protocol schema, which a dozen components ask for on one
 * page.
 *
 * More than one entry because two readers can render against different
 * revisions inside one commit: a component that has not re-rendered since the
 * last revision is still reading the previous one.
 */
const READINGS = new Map<string, Derivation>();
const READING_LIMIT = 4;

function reading(
  results: readonly Readonly<{ data?: SectionAtRevision; isError: boolean }>[],
  ids: readonly ProtocolSectionId[],
  list: Readonly<{ listed: boolean; failed: boolean }>,
): Derivation {
  const sections: Record<string, SectionDoc> = {};
  const parts: string[] = [];
  let failed = list.failed;
  for (const [index, result] of results.entries()) {
    if (result.isError) failed = true;
    const id = ids[index];
    if (id === undefined || result.data === undefined) continue;
    sections[id] = result.data.document;
    parts.push(`${id}\u0000${result.data.revision.contentHash}`);
  }
  // Escaped rather than written as themselves: two control characters in
  // the source make this a binary file to git and to every tool that reads
  // a diff of it.
  //
  // How many sections were LISTED is part of the key as well as which of them
  // have been read, so a reading that is still waiting on half the protocol is
  // never served the entry a complete reading of those same sections made.
  const revisions = [
    failed ? 'x' : 'o',
    list.listed ? '1' : '0',
    ids.length,
    ...parts.toSorted(),
  ].join('\u0001');

  const cached = READINGS.get(revisions);
  if (cached !== undefined) return cached;
  const complete = list.listed && parts.length === ids.length;
  const derived: Derivation = {
    sections,
    context: protocolContextFromSections(sections),
    // A failed read wins over a partial one: the section it was for is not on
    // its way any more.
    reading: failed
      ? UNREADABLE
      : complete
        ? { status: 'read', sections }
        : STILL_READING,
  };
  READINGS.set(revisions, derived);
  for (const key of READINGS.keys()) {
    if (READINGS.size <= READING_LIMIT) break;
    READINGS.delete(key);
  }
  return derived;
}

function useReading(): Derivation {
  const { protocolId, utils } = useProtocolBuilderContext();
  const { data: list, isError: listFailed } = useQuery(
    utils.listSections.queryOptions({ input: { protocolId } }),
  );
  const ids = list?.sectionIds ?? NO_SECTIONS;

  return useQueries({
    queries: ids.map((id) =>
      utils.getSection.queryOptions({ input: { protocolId, sectionId: id } }),
    ),
    combine: (results) =>
      reading(results, ids, { listed: list !== undefined, failed: listFailed }),
  });
}

/**
 * Every section of the open protocol, as the cache currently holds them.
 *
 * The subscription is the reading component's own — the stage editor's form
 * holds none for its children — so a component that reads another section calls
 * this, or one of the narrower readers beside it, where it renders.
 */
export function useProtocolSections(): ProtocolSections {
  return useReading().sections;
}

/**
 * The protocol as a whole, for a reader that needs all of it or none: what to
 * validate, what to assemble, which screen to open on, which position in the
 * interview a control is pointing at.
 *
 * A reader of one section, or of a family of them, wants
 * `useProtocolSections` and whatever it has.
 */
export function useProtocolReading(): ProtocolReading {
  return useReading().reading;
}

/**
 * The tolerant read model of the protocol: its codebook, asset manifest and
 * ordered stages, with whatever could not be read reported rather than thrown.
 */
export function useProtocolContext(): ProtocolBuilderProtocolContext {
  return useReading().context;
}
