import {
  collectAssetReferences,
  collectEntityAttributeReferences,
  collectEntityTypeReferences,
  type ProtocolValidationIssue,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  type ProtocolSectionId,
  sectionId,
} from '@codaco/studio-sync/taxonomy';

import { protocolContextFromSections } from './protocol-context.ts';
import type { ChangeAttribution, ManifestRevision } from './session.ts';

export type AttributedProtocolValidationIssue = ProtocolValidationIssue &
  Readonly<{
    /** Section that owns the value named by the canonical validation path. */
    sectionId?: ProtocolSectionId;
    /** Exact authoritative change that caused this issue, when unambiguous. */
    attributedChange?: Readonly<{
      sectionId: ProtocolSectionId;
      attribution: ChangeAttribution;
    }>;
  }>;

/**
 * A stage that does not exist yet, and where the interview it is joining will
 * put it.
 *
 * The authoritative stage order has no entry for such a stage — the protocol
 * does not hold it until the finish that creates it — while the protocol being
 * VALIDATED does: a host assembling a candidate inserts the draft at this
 * position, and every `stages[n]` path the validator answers with is numbered
 * against that. Given here so the two agree. Without it a created stage's
 * problems were attributed to whichever stage the authoritative order happened
 * to hold at the same index — an existing stage blamed for a draft it has
 * nothing to do with — or, for a stage being appended, to no section at all,
 * which is how a newly created invalid stage came to have an outline reading
 * "Finished" beside a save that refused it.
 */
export type CreatedStagePlacement = Readonly<{
  stageId: string;
  /** Where the host will insert it, counting from zero. */
  position: number;
}>;

export function attributeValidationIssues(
  issues: readonly ProtocolValidationIssue[],
  sections: Readonly<Record<string, SectionDoc>>,
  attribution: Readonly<Record<string, ChangeAttribution>>,
  revision: ManifestRevision,
  createdStage?: CreatedStagePlacement,
): readonly AttributedProtocolValidationIssue[] {
  const changesAtRevision = new Map(
    Object.entries(attribution).filter(([, change]) =>
      sameRevision(change.revision, revision),
    ),
  );
  const dependencySections = referencedDependencySections(sections);
  const stageOrder = stageOrderForValidation(sections, createdStage);

  return Object.freeze(
    issues.map((issue) => {
      const ownerSectionId = sectionForIssuePath(issue.path, stageOrder);
      const ownerAttribution =
        ownerSectionId === undefined ? undefined : attribution[ownerSectionId];
      const ownerChange =
        ownerSectionId !== undefined &&
        ownerAttribution !== undefined &&
        sameRevision(ownerAttribution.revision, revision)
          ? ([ownerSectionId, ownerAttribution] as const)
          : undefined;
      const dependencySectionId = dependencySections.get(pathKey(issue.path));
      const dependencyAttribution =
        dependencySectionId === undefined
          ? undefined
          : changesAtRevision.get(dependencySectionId);
      const dependencyChange =
        dependencySectionId !== undefined && dependencyAttribution !== undefined
          ? ([dependencySectionId, dependencyAttribution] as const)
          : undefined;
      const ambiguousCause =
        ownerChange !== undefined &&
        dependencyChange !== undefined &&
        ownerChange[0] !== dependencyChange[0];
      const causalChange = ambiguousCause
        ? undefined
        : (ownerChange ?? dependencyChange);

      return Object.freeze({
        code: issue.code,
        path: [...issue.path],
        message: issue.message,
        ...(ownerSectionId === undefined ? {} : { sectionId: ownerSectionId }),
        ...(causalChange === undefined
          ? {}
          : {
              attributedChange: Object.freeze({
                sectionId: asProtocolSectionId(causalChange[0]),
                attribution: causalChange[1],
              }),
            }),
      });
    }),
  );
}

function referencedDependencySections(
  sections: Readonly<Record<string, SectionDoc>>,
): ReadonlyMap<string, ProtocolSectionId> {
  const context = protocolContextFromSections(sections);
  const protocol = {
    codebook: context.codebook,
    stages: context.orderedStages,
  };
  const dependencies = new Map<string, ProtocolSectionId>();

  for (const reference of collectEntityTypeReferences(protocol)) {
    const owner =
      reference.entity === 'node'
        ? sectionId({ kind: 'codebookNode', typeId: reference.typeId })
        : sectionId({ kind: 'codebookEdge', typeId: reference.typeId });
    dependencies.set(pathKey(reference.path), owner);
  }

  for (const reference of collectEntityAttributeReferences(protocol)) {
    const subject = reference.subject;
    if (subject === undefined) continue;
    const owner =
      subject.entity === 'ego'
        ? sectionId({ kind: 'codebookEgo' })
        : subject.entity === 'node'
          ? sectionId({ kind: 'codebookNode', typeId: subject.type })
          : sectionId({ kind: 'codebookEdge', typeId: subject.type });
    dependencies.set(pathKey(reference.path), owner);
  }

  const assetsSection = sectionId({ kind: 'assets' });
  for (const reference of collectAssetReferences(protocol)) {
    dependencies.set(pathKey(reference.path), assetsSection);
  }
  return dependencies;
}

const pathKey = (path: readonly (string | number)[]): string =>
  JSON.stringify(path);

/**
 * The stage order a validation path's `stages[n]` counts against.
 *
 * The authoritative order, except that a stage being CREATED is put where the
 * host will insert it — because that is where the candidate the validator
 * judged has it. Positions are kept exactly as the order holds them: an entry
 * that is not a stage id becomes an empty string rather than being dropped, so
 * a malformed order cannot shift every stage after it onto its neighbour.
 */
export function stageOrderForValidation(
  sections: Readonly<Record<string, SectionDoc>>,
  createdStage?: CreatedStagePlacement,
): readonly string[] {
  const order = sections[sectionId({ kind: 'stageOrder' })]?.stages;
  const stages = Array.isArray(order)
    ? order.map((stage) => (typeof stage === 'string' ? stage : ''))
    : [];
  if (createdStage === undefined) return stages;
  // Filtered first, so an order that has already gained the stage — a host
  // that inserted it before the session was told the creation is over — does
  // not list it twice and renumber everything after it.
  const existing = stages.filter((stage) => stage !== createdStage.stageId);
  const index = Math.min(Math.max(createdStage.position, 0), existing.length);
  return [
    ...existing.slice(0, index),
    createdStage.stageId,
    ...existing.slice(index),
  ];
}

function sectionForIssuePath(
  path: readonly (string | number)[],
  stageOrder: readonly string[],
): ProtocolSectionId | undefined {
  const [root, second, third] = path;
  if (root === 'stages' && typeof second === 'number') {
    const stageId = stageOrder[second];
    if (stageId === undefined || stageId === '') return undefined;
    return sectionId({ kind: 'stage', stageId });
  }
  if (root === 'codebook') {
    if (second === 'node' && typeof third === 'string' && third !== '') {
      return sectionId({ kind: 'codebookNode', typeId: third });
    }
    if (second === 'edge' && typeof third === 'string' && third !== '') {
      return sectionId({ kind: 'codebookEdge', typeId: third });
    }
    if (second === 'ego') return sectionId({ kind: 'codebookEgo' });
    return undefined;
  }
  if (root === 'assetManifest') return sectionId({ kind: 'assets' });
  if (
    root === 'name' ||
    root === 'description' ||
    root === 'experiments' ||
    root === 'schemaVersion' ||
    root === 'lastModified'
  ) {
    return sectionId({ kind: 'settings' });
  }
  return undefined;
}

function sameRevision(
  left: ManifestRevision,
  right: ManifestRevision,
): boolean {
  return left.sequence === right.sequence && left.hash === right.hash;
}

function asProtocolSectionId(value: string): ProtocolSectionId {
  // Attribution keys originate in the host's branded section-id map. Keep the
  // cast at this JSON/map boundary instead of weakening the public type.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as ProtocolSectionId;
}
