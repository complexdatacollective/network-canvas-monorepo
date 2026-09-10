import type {
  CodebookSubject,
  SectionReference,
} from '@codaco/protocol-builder-core/contract/schemas';
import {
  collectEntityAttributeReferences,
  collectEntityTypeReferences,
  collectStageReferences,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { sectionId } from '@codaco/studio-sync/taxonomy';

type Path = (string | number)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Where a protocol path lives in the section model.
 *
 * The collectors answer in protocol coordinates (`stages[3].form.fields[0]`)
 * because that is what the schema they walk is shaped like; a host holds
 * sections, so every hit is translated once, here.
 */
function referenceAt(
  path: Path,
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
 * Asked of the schema rather than of the two or three paths a host happens to
 * know: `person.name` in the fixture protocol is reached from a form field, a
 * quick-add setting and a search property, and never from `prompts[].variable`.
 * A hit whose subject the collector could not resolve counts as a reference,
 * because the alternative is deleting a variable something may still name.
 */
export function variableReferences(
  sections: Readonly<Record<string, SectionDoc>>,
  subject: CodebookSubject,
  variableId: string,
): SectionReference[] {
  const { protocol, stageIds } = protocolOf(sections);
  return collectEntityAttributeReferences(protocol)
    .filter((hit) => {
      if (hit.variableId !== variableId) return false;
      const hitSubject = subjectOfHit(hit.subject);
      return hitSubject === undefined || sameSubject(hitSubject, subject);
    })
    .map((hit) => referenceAt(hit.path, stageIds));
}

/**
 * Every reference to one codebook entity type the current schema declares:
 * stage subjects, edge creation settings, filter rules, the pedigree configs,
 * and the attributes the type owns, which stop existing with it.
 */
export function entityTypeReferences(
  sections: Readonly<Record<string, SectionDoc>>,
  entity: 'node' | 'edge',
  typeId: string,
): SectionReference[] {
  const { protocol, stageIds } = protocolOf(sections);
  const subject: CodebookSubject = { entity, type: typeId };
  const types = collectEntityTypeReferences(protocol)
    .filter((hit) => hit.entity === entity && hit.typeId === typeId)
    .map((hit) => referenceAt(hit.path, stageIds));
  const attributes = collectEntityAttributeReferences(protocol)
    .filter((hit) => {
      const hitSubject = subjectOfHit(hit.subject);
      return hitSubject !== undefined && sameSubject(hitSubject, subject);
    })
    .map((hit) => referenceAt(hit.path, stageIds));
  return [...types, ...attributes];
}

/**
 * Every reference to one STAGE the current schema declares: a skip-logic
 * destination, the FamilyPedigree a NarrativePedigree describes the people of,
 * and whatever a stage type is tagged with next.
 *
 * The stage's own place in the stage order is not among them. That pointer is
 * how the protocol holds the stage rather than something naming it, and the
 * deletion rewrites it in the same revision; counting it would refuse every
 * deletion there is.
 */
export function stageReferences(
  sections: Readonly<Record<string, SectionDoc>>,
  stageId: string,
): SectionReference[] {
  const { protocol, stageIds } = protocolOf(sections);
  const own = sectionId({ kind: 'stage', stageId });
  return (
    collectStageReferences(protocol)
      .filter((hit) => hit.stageId === stageId)
      .map((hit) => referenceAt(hit.path, stageIds))
      // A stage naming itself goes with the stage: the schema refuses such a
      // protocol, and a reference the deletion removes cannot be one it leaves.
      .filter((reference) => reference.sectionId !== own)
  );
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
export function withoutReference(
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
export function inRemovalOrder(
  references: readonly SectionReference[],
): SectionReference[] {
  return [...references].sort((a, b) => comparePaths(b.path, a.path));
}

function comparePaths(
  a: readonly (string | number)[],
  b: readonly (string | number)[],
): number {
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

function protocolOf(sections: Readonly<Record<string, SectionDoc>>): Readonly<{
  protocol: Record<string, unknown>;
  stageIds: string[];
}> {
  const protocol = assembleProtocolSections(sections);
  const order = sections[sectionId({ kind: 'stageOrder' })]?.stages;
  const stageIds = Array.isArray(order)
    ? order.filter((entry): entry is string => typeof entry === 'string')
    : [];
  return { protocol, stageIds };
}
