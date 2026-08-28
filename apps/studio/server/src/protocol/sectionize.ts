import {
  CURRENT_SCHEMA_VERSION,
  type CurrentProtocol,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { sectionId } from './taxonomy.ts';

/** @public */
export class SectionizeError extends Error {}

// Branded reference fields make the literal uncastable directly.
export function emptyProtocol(name: string): CurrentProtocol {
  return {
    name,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    codebook: {},
    stages: [],
  } as unknown as CurrentProtocol;
}

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
    if (stage.id === '') {
      throw new SectionizeError('stage id must be non-empty');
    }
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

  // Present even when empty: the sync engine refuses commits to section ids
  // absent from the head manifest, so a protocol created without assets could
  // never gain its first one. Assembly normalizes empty back to absent.
  sections[sectionId({ kind: 'assets' })] = protocol.assetManifest ?? {};

  return sections;
}
