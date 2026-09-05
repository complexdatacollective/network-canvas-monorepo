import {
  assetSchema,
  collectAssetReferences,
  type ProtocolValidationIssue,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

export type StageResourceReference = Readonly<{
  /** Path from the stage document root to the field holding the id. */
  path: readonly (string | number)[];
  resourceId: string;
}>;

export type DanglingResourceReference = ProtocolValidationIssue &
  Readonly<{ resourceId: string }>;

export type DanglingResourceReferenceOptions = Readonly<{
  /** The stage draft, including its session-owned `id` and `type`. */
  stageDocument: SectionDoc;
  /** The committed `assets` manifest section document, keyed by asset id. */
  manifestSection?: SectionDoc;
  /** Resources staged in this session; a draft may reference them already. */
  stagedResourceIds?: Iterable<string>;
  /**
   * Prefix for the reported paths. The lifecycle passes `['stages', index]` so
   * the issues sit on the same canonical paths as schema validation, and
   * `attributeValidationIssues` can attribute them to the owning sections.
   */
  pathPrefix?: readonly (string | number)[];
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

/**
 * Resource references a stage draft cannot legally commit: ids that are neither
 * in the committed manifest nor staged in this session, and ids whose committed
 * manifest entry does not satisfy `assetSchema`.
 *
 * Staged ids count as resolvable because the promotion in `finish()` writes
 * their manifest entries in the same atomic revision as the stage itself; an id
 * that is neither committed nor staged can only become a dangling reference.
 */
export function findDanglingResourceReferences(
  options: DanglingResourceReferenceOptions,
): readonly DanglingResourceReference[] {
  const manifest = options.manifestSection ?? {};
  const staged = new Set<string>(options.stagedResourceIds ?? []);
  const prefix = options.pathPrefix ?? [];
  const problems: DanglingResourceReference[] = [];

  for (const reference of collectStageResourceReferences(
    options.stageDocument,
  )) {
    const path = [...prefix, ...reference.path];
    if (staged.has(reference.resourceId)) continue;

    if (!Object.hasOwn(manifest, reference.resourceId)) {
      problems.push(
        Object.freeze({
          code: 'custom',
          path,
          message: `This stage uses a resource ("${reference.resourceId}") that is not in the protocol.`,
          resourceId: reference.resourceId,
        }),
      );
      continue;
    }

    const entry = assetSchema.safeParse(manifest[reference.resourceId]);
    if (!entry.success) {
      problems.push(
        Object.freeze({
          code: 'custom',
          path,
          message: `The resource ("${reference.resourceId}") this stage uses is not valid: ${
            entry.error.issues[0]?.message ?? 'asset validation failed'
          }`,
          resourceId: reference.resourceId,
        }),
      );
    }
  }

  return Object.freeze(problems);
}
