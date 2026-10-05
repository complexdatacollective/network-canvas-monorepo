import { collectAssetReferences } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

export type StageResourceReference = Readonly<{
  /** Path from the stage document root to the field holding the id. */
  path: readonly (string | number)[];
  resourceId: string;
}>;

/**
 * Every resource a stage draft references, discovered from the schema's
 * `assetReference` tags rather than a hand-kept list of paths, so a stage type
 * that gains a resource field is covered as soon as its schema is tagged.
 *
 * The draft is wrapped as a one-stage protocol because the tags are reachable
 * only through the protocol schema; the wrapper path is stripped again, so the
 * returned paths are relative to the stage document.
 */
export function collectStageResourceReferences(
  stageDocument: SectionDoc,
): readonly StageResourceReference[] {
  return Object.freeze(
    collectAssetReferences({ stages: [stageDocument] }).map((hit) =>
      Object.freeze({
        path: Object.freeze(hit.path.slice(2)),
        resourceId: hit.assetId,
      }),
    ),
  );
}
