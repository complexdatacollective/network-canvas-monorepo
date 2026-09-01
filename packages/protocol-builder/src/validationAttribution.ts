import {
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

export function attributeValidationIssues(
  issues: readonly ProtocolValidationIssue[],
  sections: Readonly<Record<string, SectionDoc>>,
  attribution: Readonly<Record<string, ChangeAttribution>>,
  revision: ManifestRevision,
): readonly AttributedProtocolValidationIssue[] {
  const changesAtRevision = new Map(
    Object.entries(attribution).filter(([, change]) =>
      sameRevision(change.revision, revision),
    ),
  );
  const dependencySections = referencedDependencySections(sections);

  return Object.freeze(
    issues.map((issue) => {
      const ownerSectionId = sectionForIssuePath(issue.path, sections);
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
  return dependencies;
}

const pathKey = (path: readonly (string | number)[]): string =>
  JSON.stringify(path);

function sectionForIssuePath(
  path: readonly (string | number)[],
  sections: Readonly<Record<string, SectionDoc>>,
): ProtocolSectionId | undefined {
  const [root, second, third] = path;
  if (root === 'stages' && typeof second === 'number') {
    const stageOrder = sections[sectionId({ kind: 'stageOrder' })]?.stages;
    if (Array.isArray(stageOrder)) {
      const stageId = stageOrder[second];
      if (typeof stageId === 'string' && stageId !== '') {
        return sectionId({ kind: 'stage', stageId });
      }
    }
    return undefined;
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
