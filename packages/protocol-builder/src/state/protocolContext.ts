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

type Derivation = Readonly<{
  sections: ProtocolSections;
  context: ProtocolBuilderProtocolContext;
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
  results: readonly Readonly<{ data?: SectionAtRevision }>[],
  ids: readonly ProtocolSectionId[],
): Derivation {
  const sections: Record<string, SectionDoc> = {};
  const parts: string[] = [];
  for (const [index, result] of results.entries()) {
    const id = ids[index];
    if (id === undefined || result.data === undefined) continue;
    sections[id] = result.data.document;
    parts.push(`${id}\u0000${result.data.revision.contentHash}`);
  }
  // Escaped rather than written as themselves: two control characters in
  // the source make this a binary file to git and to every tool that reads
  // a diff of it.
  const revisions = parts.toSorted().join('\u0001');

  const cached = READINGS.get(revisions);
  if (cached !== undefined) return cached;
  const derived: Derivation = {
    sections,
    context: protocolContextFromSections(sections),
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
  const { data: list } = useQuery(
    utils.listSections.queryOptions({ input: { protocolId } }),
  );
  const ids = list?.sectionIds ?? NO_SECTIONS;

  return useQueries({
    queries: ids.map((id) =>
      utils.getSection.queryOptions({ input: { protocolId, sectionId: id } }),
    ),
    combine: (results) => reading(results, ids),
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
 * The tolerant read model of the protocol: its codebook, asset manifest and
 * ordered stages, with whatever could not be read reported rather than thrown.
 */
export function useProtocolContext(): ProtocolBuilderProtocolContext {
  return useReading().context;
}
