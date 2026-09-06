import { getValue } from '@codaco/fresco-ui/form/utils/objectPath';
import isUnanswered from '@codaco/fresco-ui/form/validation/utils/isUnanswered';
import {
  assetSchema,
  collectAssetReferences,
  type ProtocolValidationIssue,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { resourceProblemClause } from '../form/schemaProblems.ts';

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
          message: unreadableResourceMessage(
            manifest,
            reference.resourceId,
            entry.error.issues[0],
          ),
          resourceId: reference.resourceId,
        }),
      );
    }
  }

  return Object.freeze(problems);
}

/**
 * What a researcher is told about a resource whose stored entry the schema
 * refuses: which resource it is, and what is wrong with it in this package's
 * own words.
 *
 * The validator's own message is no part of it. "Invalid input: expected
 * string, received undefined" is a sentence about a schema, and a researcher
 * authoring an interview is not holding one — so the words for each kind of
 * refusal live in `schemaProblems.ts`, beside the words for every other
 * refusal this editor reports, rather than being repeated from Zod.
 *
 * The refusal is optional because a failed parse carrying no issue is a shape
 * the types allow and nothing produces: with none, what comes back is the
 * clause for a refusal this package has no words for, which is what that is.
 */
function unreadableResourceMessage(
  manifest: SectionDoc,
  resourceId: string,
  refusal: Readonly<{ code: string; path: readonly PropertyKey[] }> | undefined,
): string {
  const clause = resourceProblemClause({
    code: refusal?.code ?? '',
    absent:
      refusal !== undefined &&
      isMissingAt(manifest, [resourceId, ...refusal.path]),
  });
  return `This stage points at a resource ("${resourceId}") the protocol cannot read: ${clause}`;
}

/**
 * Is there nothing at all where the schema refused a value?
 *
 * The question the validator's own answer cannot settle, asked of the manifest
 * the way the stage editor asks it of a draft: Zod finalises an issue without
 * keeping what it was given, and a key that is not there and a number where a
 * string belongs are both `invalid_type`, so the manifest it judged is what
 * says which. Read with the predicate this editor reads every emptiness by, so
 * an entry holding `""` counts as missing here exactly as it would in a form.
 *
 * A path with a symbol in it is not read at all: nothing in a manifest is
 * keyed by one, and a read that quietly skipped the segment would answer about
 * the wrong value rather than decline to answer.
 */
function isMissingAt(
  manifest: SectionDoc,
  path: readonly PropertyKey[],
): boolean {
  const readable: (string | number)[] = [];
  for (const segment of path) {
    if (typeof segment === 'symbol') return false;
    readable.push(segment);
  }
  return isUnanswered(getValue(manifest, readable));
}
