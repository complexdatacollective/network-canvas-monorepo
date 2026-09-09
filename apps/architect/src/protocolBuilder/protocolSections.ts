import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

const SETTINGS_SECTION = sectionId({ kind: 'settings' });
export const STAGE_ORDER_SECTION = sectionId({ kind: 'stageOrder' });
const ASSETS_SECTION = sectionId({ kind: 'assets' });

/**
 * Architect's committed protocol, split into the sections the host contract
 * addresses — the inverse of `@codaco/studio-sync`'s `assembleProtocolSections`.
 *
 * Stage and codebook-type documents are the store's own objects rather than
 * copies, so a section the last dispatch did not touch is recognised by
 * identity and never hashed.
 */
export function protocolSections(
  protocol: CurrentProtocol,
): Map<ProtocolSectionId, SectionDoc> {
  const { codebook, stages, assetManifest, ...settings } = protocol;
  const sections = new Map<ProtocolSectionId, SectionDoc>();

  const stageIds: string[] = [];
  for (const stage of stages) {
    stageIds.push(stage.id);
    sections.set(sectionId({ kind: 'stage', stageId: stage.id }), stage);
  }

  sections.set(SETTINGS_SECTION, settings);
  sections.set(STAGE_ORDER_SECTION, { stages: stageIds });
  sections.set(ASSETS_SECTION, assetManifest ?? {});

  for (const [typeId, definition] of Object.entries(codebook.node ?? {})) {
    sections.set(sectionId({ kind: 'codebookNode', typeId }), definition);
  }
  for (const [typeId, definition] of Object.entries(codebook.edge ?? {})) {
    sections.set(sectionId({ kind: 'codebookEdge', typeId }), definition);
  }
  if (codebook.ego !== undefined) {
    sections.set(sectionId({ kind: 'codebookEgo' }), codebook.ego);
  }

  return sections;
}
