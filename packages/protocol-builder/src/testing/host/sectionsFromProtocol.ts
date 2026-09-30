import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordOf(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

/**
 * Splits a protocol document into the section model a host stores, which is
 * the inverse of `@codaco/studio-sync`'s `assembleProtocolSections`.
 */
export function sectionsFromProtocol(
  protocol: Readonly<Record<string, unknown>>,
): Record<ProtocolSectionId, SectionDoc> {
  const {
    codebook,
    stages,
    assetManifest,
    ...settings
  }: Record<string, unknown> = protocol;
  const sections: Record<ProtocolSectionId, SectionDoc> = {};

  const stageDocs = Array.isArray(stages) ? stages.filter(isRecord) : [];
  const stageIds: string[] = [];
  for (const stage of stageDocs) {
    if (typeof stage.id !== 'string' || stage.id === '') continue;
    stageIds.push(stage.id);
    sections[sectionId({ kind: 'stage', stageId: stage.id })] = stage;
  }

  sections[sectionId({ kind: 'settings' })] = settings;
  sections[sectionId({ kind: 'stageOrder' })] = { stages: stageIds };
  sections[sectionId({ kind: 'assets' })] = recordOf(assetManifest);

  const book = recordOf(codebook);
  for (const [typeId, definition] of Object.entries(recordOf(book.node))) {
    if (isRecord(definition)) {
      sections[sectionId({ kind: 'codebookNode', typeId })] = definition;
    }
  }
  for (const [typeId, definition] of Object.entries(recordOf(book.edge))) {
    if (isRecord(definition)) {
      sections[sectionId({ kind: 'codebookEdge', typeId })] = definition;
    }
  }
  if (isRecord(book.ego)) {
    sections[sectionId({ kind: 'codebookEgo' })] = book.ego;
  }

  return sections;
}
