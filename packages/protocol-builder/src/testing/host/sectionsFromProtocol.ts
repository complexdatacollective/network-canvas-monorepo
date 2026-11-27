import { Predicate } from 'effect';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import type { ProtocolSectionId } from '@codaco/studio-sync/taxonomy';

import { protocolSections } from '../../host/protocolSections.ts';

function recordOf(value: unknown): Record<string, unknown> {
  return Predicate.isObject(value) ? value : {};
}

function recordsIn(value: unknown): Record<string, SectionDoc> {
  return Object.fromEntries(
    Object.entries(recordOf(value)).filter(
      (entry): entry is [string, SectionDoc] => Predicate.isObject(entry[1]),
    ),
  );
}

/**
 * Splits a protocol document into the section model a host stores, as
 * `protocolSections` does, from a document no schema has checked: a stage
 * without an id, or a codebook entry that is not an object, is left out.
 */
export function sectionsFromProtocol(
  protocol: Readonly<Record<string, unknown>>,
): Record<ProtocolSectionId, SectionDoc> {
  const { codebook, stages, assetManifest, ...settings } = protocol;
  const book = recordOf(codebook);
  const stageDocs = Array.isArray(stages)
    ? stages.filter(
        (stage): stage is SectionDoc & { id: string } =>
          Predicate.isObject(stage) &&
          typeof stage.id === 'string' &&
          stage.id !== '',
      )
    : [];
  return Object.fromEntries(
    protocolSections({
      ...settings,
      codebook: {
        node: recordsIn(book.node),
        edge: recordsIn(book.edge),
        ...(Predicate.isObject(book.ego) ? { ego: book.ego } : {}),
        layouts: recordsIn(book.layouts),
      },
      stages: stageDocs,
      assetManifest: recordOf(assetManifest),
    }),
  );
}
