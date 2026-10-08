import {
  createDefaultFinishSessionStage,
  CURRENT_SCHEMA_VERSION,
  type CurrentProtocol,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

/** @public */
export class SectionizeError extends Error {}

/**
 * The id of the finish stage a new protocol starts with. Fixed rather than
 * minted, as the schema 8 migration's is: a stage id only has to be unique
 * within its own protocol.
 */
export const NEW_PROTOCOL_FINISH_STAGE_ID = 'finish';

// Nothing asks the researcher for a language yet, so a new protocol declares
// English, as a protocol migrated from schema 8 does. Every interview has to
// end at a finish stage, so a new protocol starts with the one Network Canvas
// supplies, and the stages a researcher adds go in front of it.
export function emptyProtocol(name: string): CurrentProtocol {
  const localization: CurrentProtocol['localization'] = {
    defaultLocale: 'en',
    locales: ['en'],
  };
  return {
    name,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    localization,
    codebook: {},
    stages: [
      createDefaultFinishSessionStage({
        id: NEW_PROTOCOL_FINISH_STAGE_ID,
        localization,
      }),
    ],
  };
}

export function sectionizeProtocol(
  protocol: CurrentProtocol,
): Record<string, SectionDoc> {
  const sections: Record<string, SectionDoc> = {};

  const settings: SectionDoc = {
    name: protocol.name,
    schemaVersion: protocol.schemaVersion,
    localization: protocol.localization,
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
