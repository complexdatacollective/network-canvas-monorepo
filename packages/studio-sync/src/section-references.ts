// Where a protocol names one of its own codebook entries, expressed in
// sections rather than in protocol coordinates.
//
// The reference collectors in `@codaco/protocol-validation` walk the current
// schema and answer in protocol coordinates (`stages[3].form.fields[0]`),
// because that is the shape the schema describes. A host holds sections, so
// every hit is translated here, once, and a host that deletes a codebook entry
// asks the schema what still names it rather than the two or three paths it
// happens to know about.
import {
  collectEntityAttributeReferences,
  collectEntityTypeReferences,
  collectStageReferences,
} from '@codaco/protocol-validation';

import type { SectionDoc } from './apply.ts';
import { assembleProtocolSections } from './protocol-document.ts';
import { sectionShapeIssues } from './section-validation.ts';
import { sectionId, type ProtocolSectionId } from './taxonomy.ts';

type DocumentPath = (string | number)[];

/** One place a section names something: a reference, at its path. */
export type SectionReference = {
  sectionId: ProtocolSectionId;
  path: DocumentPath;
};

export type CodebookSubject =
  | { entity: 'node'; type: string }
  | { entity: 'edge'; type: string }
  | { entity: 'ego' };

/** A protocol as the collectors walk it, with the stage order that indexes it. */
export type AssembledProtocol = {
  protocol: Record<string, unknown>;
  stageIds: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The protocol a set of sections makes, and the stage ids indexing its stages. */
export function assembledProtocol(
  sections: Readonly<Record<string, SectionDoc>>,
): AssembledProtocol {
  const order = sections[sectionId({ kind: 'stageOrder' })]?.stages;
  return {
    protocol: assembleProtocolSections(sections),
    stageIds: Array.isArray(order)
      ? order.filter((entry): entry is string => typeof entry === 'string')
      : [],
  };
}

/** Where a protocol-coordinate path lives in the section model. */
export function sectionReferenceAt(
  path: DocumentPath,
  stageIds: readonly string[],
): SectionReference {
  if (path[0] === 'stages' && typeof path[1] === 'number') {
    const stageId = stageIds[path[1]];
    if (stageId !== undefined) {
      return {
        sectionId: sectionId({ kind: 'stage', stageId }),
        path: path.slice(2),
      };
    }
  }
  if (path[0] === 'codebook') {
    if (path[1] === 'ego') {
      return {
        sectionId: sectionId({ kind: 'codebookEgo' }),
        path: path.slice(2),
      };
    }
    const typeId = path[2];
    if (
      (path[1] === 'node' || path[1] === 'edge') &&
      typeof typeId === 'string'
    ) {
      return {
        sectionId: sectionId({
          kind: path[1] === 'node' ? 'codebookNode' : 'codebookEdge',
          typeId,
        }),
        path: path.slice(3),
      };
    }
  }
  if (path[0] === 'assetManifest') {
    return { sectionId: sectionId({ kind: 'assets' }), path: path.slice(1) };
  }
  // Everything else a protocol carries at its root is the settings section.
  return { sectionId: sectionId({ kind: 'settings' }), path };
}

function subjectOfHit(
  subject: Readonly<{ entity: string; type?: string }> | undefined,
): CodebookSubject | undefined {
  if (subject === undefined) return undefined;
  if (subject.entity === 'ego') return { entity: 'ego' };
  if (subject.entity !== 'node' && subject.entity !== 'edge') return undefined;
  return subject.type === undefined
    ? undefined
    : { entity: subject.entity, type: subject.type };
}

function sameSubject(a: CodebookSubject, b: CodebookSubject): boolean {
  if (a.entity !== b.entity) return false;
  return a.entity === 'ego' || b.entity === 'ego' || a.type === b.type;
}

/**
 * Every reference to one codebook variable the current schema declares.
 *
 * A hit whose subject the collector could not resolve counts as a reference,
 * because the alternative is deleting a variable something may still name.
 */
export function variableReferences(
  { protocol, stageIds }: AssembledProtocol,
  subject: CodebookSubject,
  variableId: string,
): SectionReference[] {
  return collectEntityAttributeReferences(protocol)
    .filter((hit) => {
      if (hit.variableId !== variableId) return false;
      const hitSubject = subjectOfHit(hit.subject);
      return hitSubject === undefined || sameSubject(hitSubject, subject);
    })
    .map((hit) => sectionReferenceAt(hit.path, stageIds));
}

/**
 * Every reference to one codebook entity type the current schema declares:
 * stage subjects, edge creation settings, filter rules, the pedigree configs,
 * and the attributes the type owns, which stop existing with it.
 */
export function entityTypeReferences(
  assembled: AssembledProtocol,
  entity: 'node' | 'edge',
  typeId: string,
): SectionReference[] {
  const { protocol, stageIds } = assembled;
  const subject: CodebookSubject = { entity, type: typeId };
  const types = collectEntityTypeReferences(protocol)
    .filter((hit) => hit.entity === entity && hit.typeId === typeId)
    .map((hit) => sectionReferenceAt(hit.path, stageIds));
  const attributes = collectEntityAttributeReferences(protocol)
    .filter((hit) => {
      const hitSubject = subjectOfHit(hit.subject);
      return hitSubject !== undefined && sameSubject(hitSubject, subject);
    })
    .map((hit) => sectionReferenceAt(hit.path, stageIds));
  return [...types, ...attributes];
}

/**
 * Every reference to one STAGE the current schema declares: a skip-logic
 * destination, the FamilyPedigree a NarrativePedigree describes the people of,
 * and whatever a stage type is tagged with next.
 *
 * The stage's own place in the stage order is not among them. That pointer is
 * how the protocol holds the stage rather than something naming it, and a
 * deletion rewrites it in the same revision; counting it would refuse every
 * deletion there is. Nor is a reference the stage makes to itself, which the
 * schema refuses a protocol for anyway.
 */
export function stageReferences(
  { protocol, stageIds }: AssembledProtocol,
  stageId: string,
): SectionReference[] {
  const own = sectionId({ kind: 'stage', stageId });
  return collectStageReferences(protocol)
    .filter((hit) => hit.stageId === stageId)
    .map((hit) => sectionReferenceAt(hit.path, stageIds))
    .filter((reference) => reference.sectionId !== own);
}

/**
 * The section document without the reference at `path`, or `undefined` when
 * removing it would mean inventing semantics.
 *
 * A reference inside a list — a prompt, a form field, a filter rule, a sort
 * option — is removed by dropping the entry that holds it. A reference that is
 * a property of the section itself, a stage's `subject.type` or a quick-add
 * attribute, has no such entry: there is nothing to remove that leaves a stage
 * the researcher would recognise, so the host says so rather than guessing.
 */
function withoutReference(
  document: SectionDoc,
  path: readonly (string | number)[],
): SectionDoc | undefined {
  let cut = -1;
  for (const [at, segment] of path.entries()) {
    if (typeof segment === 'number') cut = at;
  }
  const index = path[cut];
  if (typeof index !== 'number') return undefined;

  const next = structuredClone(document) as SectionDoc;
  let holder: unknown = next;
  for (const segment of path.slice(0, cut)) {
    if (Array.isArray(holder) && typeof segment === 'number') {
      holder = holder[segment];
      continue;
    }
    holder = isRecord(holder) ? holder[segment] : undefined;
  }
  if (!Array.isArray(holder)) return undefined;
  holder.splice(index, 1);
  return next;
}

/**
 * Removals applied deepest and last-first, so an earlier splice cannot move
 * the element a later one names.
 */
function inRemovalOrder(
  references: readonly SectionReference[],
): SectionReference[] {
  return [...references].sort((a, b) => comparePaths(b.path, a.path));
}

function comparePaths(a: DocumentPath, b: DocumentPath): number {
  for (let at = 0; at < Math.max(a.length, b.length); at += 1) {
    const left = a[at];
    const right = b[at];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left === right) continue;
    if (typeof left === 'number' && typeof right === 'number') {
      return left - right;
    }
    return String(left) < String(right) ? -1 : 1;
  }
  return 0;
}

/** Removes the first reference the sweep can take, saying whether it took one. */
function removeOneReference(
  documents: Record<string, SectionDoc>,
  rewritten: Map<ProtocolSectionId, SectionDoc>,
  remaining: readonly SectionReference[],
): boolean {
  for (const reference of inRemovalOrder(remaining)) {
    const current = documents[reference.sectionId];
    if (current === undefined) continue;
    const next = withoutReference(current, reference.path);
    if (next === undefined) continue;
    if (sectionShapeIssues(reference.sectionId, next).length > 0) continue;
    documents[reference.sectionId] = next;
    rewritten.set(reference.sectionId, next);
    return true;
  }
  return false;
}

export type ReferenceSweep = {
  /** Sections the sweep rewrote, at the document it rewrote them to. */
  rewritten: Map<ProtocolSectionId, SectionDoc>;
  /** References the sweep could not remove. Empty means the change is safe. */
  remaining: SectionReference[];
};

/**
 * Rewrites every section that stops naming what a change removes.
 *
 * One reference is removed at a time and the protocol is asked again, since
 * removing a list entry moves every path after it. What the sweep cannot
 * remove is left standing and reported: applying the change anyway would leave
 * the protocol naming something that no longer exists.
 */
export function sweepReferences(
  documents: Record<string, SectionDoc>,
  referencesTo: (
    documents: Readonly<Record<string, SectionDoc>>,
  ) => SectionReference[],
): ReferenceSweep {
  const rewritten = new Map<ProtocolSectionId, SectionDoc>();
  let remaining = referencesTo(documents);
  while (remaining.length > 0) {
    if (!removeOneReference(documents, rewritten, remaining)) break;
    remaining = referencesTo(documents);
  }
  return { rewritten, remaining };
}
