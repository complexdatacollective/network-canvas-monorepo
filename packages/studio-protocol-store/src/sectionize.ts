// Splits a schema-conformant protocol document into the store's section
// documents. Sectioning is Studio-internal storage topology (#1276): the
// assembled document remains the contract, and assembleProtocol() is the
// exact inverse of this function.
import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { sectionId } from './taxonomy.ts';

export class SectionizeError extends Error {}

/**
 * One record per section, keyed by section id. Canonicalization notes:
 * absent optional fields stay absent, and an empty codebook entity record
 * (`node: {}`) or empty asset manifest normalizes to absent — assembly
 * cannot distinguish "no sections" from "an empty record", and the schema
 * treats both identically.
 */
export function sectionizeProtocol(
  protocol: CurrentProtocol,
): Record<string, SectionDoc> {
  const sections: Record<string, SectionDoc> = {};

  const settings: SectionDoc = {
    name: protocol.name,
    schemaVersion: protocol.schemaVersion,
  };
  if (protocol.description !== undefined) {
    settings.description = protocol.description;
  }
  if (protocol.experiments !== undefined) {
    settings.experiments = protocol.experiments;
  }
  if (protocol.lastModified !== undefined) {
    settings.lastModified = protocol.lastModified;
  }
  sections[sectionId({ kind: 'settings' })] = settings;

  const stageIds: string[] = [];
  for (const stage of protocol.stages) {
    const id = sectionId({ kind: 'stage', stageId: stage.id });
    if (id in sections) {
      throw new SectionizeError(`duplicate stage id ${stage.id}`);
    }
    sections[id] = stage;
    stageIds.push(stage.id);
  }
  sections[sectionId({ kind: 'stageOrder' })] = { stages: stageIds };

  for (const [typeId, definition] of Object.entries(
    protocol.codebook.node ?? {},
  )) {
    sections[sectionId({ kind: 'codebookNode', typeId })] = definition;
  }
  for (const [typeId, definition] of Object.entries(
    protocol.codebook.edge ?? {},
  )) {
    sections[sectionId({ kind: 'codebookEdge', typeId })] = definition;
  }
  if (protocol.codebook.ego !== undefined) {
    sections[sectionId({ kind: 'codebookEgo' })] = protocol.codebook.ego;
  }

  if (
    protocol.assetManifest !== undefined &&
    Object.keys(protocol.assetManifest).length > 0
  ) {
    sections[sectionId({ kind: 'assets' })] = protocol.assetManifest;
  }

  return sections;
}
