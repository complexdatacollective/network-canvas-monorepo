import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

export const SETTINGS_SECTION = sectionId({ kind: 'settings' });
export const STAGE_ORDER_SECTION = sectionId({ kind: 'stageOrder' });
export const ASSETS_SECTION = sectionId({ kind: 'assets' });

/** What a protocol must hold to be split into sections. */
export type SplittableProtocol = Readonly<Record<string, unknown>> &
  Readonly<{
    codebook: Readonly<{
      node?: Readonly<Record<string, SectionDoc>> | undefined;
      edge?: Readonly<Record<string, SectionDoc>> | undefined;
      ego?: SectionDoc | undefined;
    }>;
    stages: readonly (SectionDoc & Readonly<{ id: string }>)[];
    assetManifest?: SectionDoc | undefined;
  }>;

/**
 * A protocol, split into the sections the host contract addresses — the
 * inverse of `@codaco/studio-sync`'s `assembleProtocolSections`.
 *
 * Stage and codebook-type documents are the protocol's own objects rather
 * than copies, so a host holding a store's protocol recognises a section the
 * last change did not touch by identity, and never hashes it.
 */
export function protocolSections(
  protocol: SplittableProtocol,
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
