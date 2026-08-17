// Structural diff (#1276): schema-aware, typed change records computed from
// two section-hash maps — "added/removed/moved directly, body diffs only
// where hashes differ". Records carry ids, display names, stage types, and
// paths; rendering them as human-readable summaries (and localizing that
// text) is the consumer's concern, so no prose is produced here.
import { type SectionDoc, canonicalize } from '@codaco/studio-sync/apply';

import { parseSectionId, sectionId } from './taxonomy.ts';

/** sectionId -> content hash, as stored in a manifest or a version pin set. */
export type SectionSet = Record<string, string>;

export type FieldChange = {
  /** Path within the section document. */
  path: (string | number)[];
  change: 'added' | 'removed' | 'changed';
};

export type VariableChange = {
  variableId: string;
  name: string;
  change: 'added' | 'removed' | 'changed';
  /** Top-level keys of the variable definition that differ (change: 'changed'). */
  changedKeys?: string[];
};

export type ProtocolChange =
  | {
      kind: 'stage-added';
      stageId: string;
      stageType: string;
      label?: string;
      index: number;
    }
  | {
      kind: 'stage-removed';
      stageId: string;
      stageType: string;
      label?: string;
    }
  | { kind: 'stage-moved'; stageId: string; from: number; to: number }
  | {
      kind: 'stage-changed';
      stageId: string;
      stageType: string;
      changes: FieldChange[];
    }
  | {
      kind: 'entity-added' | 'entity-removed';
      entity: 'node' | 'edge' | 'ego';
      typeId?: string;
      name?: string;
    }
  | {
      kind: 'entity-changed';
      entity: 'node' | 'edge' | 'ego';
      typeId?: string;
      name?: string;
      changes: FieldChange[];
      variables: VariableChange[];
    }
  | { kind: 'settings-changed'; changes: FieldChange[] }
  | {
      kind: 'assets-changed';
      added: string[];
      removed: string[];
      changed: string[];
    };

function equal(a: unknown, b: unknown): boolean {
  return canonicalize(a) === canonicalize(b);
}

function stringField(doc: SectionDoc, key: string): string | undefined {
  const value = doc[key];
  return typeof value === 'string' ? value : undefined;
}

function stageOrderOf(doc: SectionDoc | undefined): string[] {
  const order = doc?.stages;
  return Array.isArray(order)
    ? order.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/**
 * Top-level key comparison, descending one level into prompts (an id-keyed
 * collection), so the canonical example — "prompt text changed" — carries the
 * path ['prompts', promptId, 'text'] rather than an opaque top-level change.
 */
function diffBody(a: SectionDoc, b: SectionDoc): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!(key in a)) {
      changes.push({ path: [key], change: 'added' });
      continue;
    }
    if (!(key in b)) {
      changes.push({ path: [key], change: 'removed' });
      continue;
    }
    if (equal(a[key], b[key])) continue;
    if (key === 'prompts' && Array.isArray(a[key]) && Array.isArray(b[key])) {
      changes.push(...diffPrompts(a[key], b[key]));
      continue;
    }
    changes.push({ path: [key], change: 'changed' });
  }
  return changes;
}

function promptsById(prompts: unknown[]): Map<string, SectionDoc> {
  const byId = new Map<string, SectionDoc>();
  for (const prompt of prompts) {
    if (typeof prompt === 'object' && prompt !== null && 'id' in prompt) {
      const { id } = prompt as SectionDoc;
      if (typeof id === 'string') byId.set(id, prompt as SectionDoc);
    }
  }
  return byId;
}

function diffPrompts(a: unknown[], b: unknown[]): FieldChange[] {
  const aById = promptsById(a);
  const bById = promptsById(b);
  const changes: FieldChange[] = [];
  for (const id of new Set([...aById.keys(), ...bById.keys()])) {
    const aPrompt = aById.get(id);
    const bPrompt = bById.get(id);
    if (aPrompt === undefined) {
      changes.push({ path: ['prompts', id], change: 'added' });
      continue;
    }
    if (bPrompt === undefined) {
      changes.push({ path: ['prompts', id], change: 'removed' });
      continue;
    }
    for (const change of diffBody(aPrompt, bPrompt)) {
      changes.push({
        path: ['prompts', id, ...change.path],
        change: change.change,
      });
    }
  }
  return changes;
}

function variablesOf(doc: SectionDoc): Record<string, SectionDoc> {
  const variables = doc.variables;
  if (typeof variables !== 'object' || variables === null) return {};
  return variables as Record<string, SectionDoc>;
}

function diffVariables(a: SectionDoc, b: SectionDoc): VariableChange[] {
  const aVars = variablesOf(a);
  const bVars = variablesOf(b);
  const changes: VariableChange[] = [];
  for (const variableId of new Set([
    ...Object.keys(aVars),
    ...Object.keys(bVars),
  ])) {
    const aVar = aVars[variableId];
    const bVar = bVars[variableId];
    if (aVar === undefined && bVar !== undefined) {
      changes.push({
        variableId,
        name: stringField(bVar, 'name') ?? variableId,
        change: 'added',
      });
      continue;
    }
    if (bVar === undefined && aVar !== undefined) {
      changes.push({
        variableId,
        name: stringField(aVar, 'name') ?? variableId,
        change: 'removed',
      });
      continue;
    }
    if (aVar === undefined || bVar === undefined || equal(aVar, bVar)) continue;
    const changedKeys = new Set([...Object.keys(aVar), ...Object.keys(bVar)]);
    changes.push({
      variableId,
      name: stringField(bVar, 'name') ?? variableId,
      change: 'changed',
      changedKeys: [...changedKeys].filter(
        (key) => !equal(aVar[key], bVar[key]),
      ),
    });
  }
  return changes;
}

/** Ids present in both orders whose relative order survived — the ones NOT
 * in the longest common subsequence are the moved set, so a single dragged
 * stage reports one move rather than shifting every neighbour. */
function longestCommonSubsequence(a: string[], b: string[]): Set<string> {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i]![j] =
        a[i] === b[j]
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const kept = new Set<string>();
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      kept.add(a[i]!);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return kept;
}

/**
 * Structural diff between two section sets (draft heads, version pin sets,
 * or one of each). getDoc must resolve every hash present in either set —
 * both sides' documents are content-addressed, so a shared store lookup
 * serves both.
 */
export function diffProtocolSections(
  a: SectionSet,
  b: SectionSet,
  getDoc: (hash: string) => SectionDoc,
): ProtocolChange[] {
  const changes: ProtocolChange[] = [];

  const orderId = sectionId({ kind: 'stageOrder' });
  const aOrderHash = a[orderId];
  const bOrderHash = b[orderId];
  const aOrder = stageOrderOf(
    aOrderHash === undefined ? undefined : getDoc(aOrderHash),
  );
  const bOrder = stageOrderOf(
    bOrderHash === undefined ? undefined : getDoc(bOrderHash),
  );

  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) {
    if (id === orderId) continue;
    const ref = parseSectionId(id);
    const aHash = a[id];
    const bHash = b[id];

    switch (ref.kind) {
      case 'stage': {
        if (aHash === undefined && bHash !== undefined) {
          const doc = getDoc(bHash);
          changes.push({
            kind: 'stage-added',
            stageId: ref.stageId,
            stageType: stringField(doc, 'type') ?? 'unknown',
            label: stringField(doc, 'label'),
            index: bOrder.indexOf(ref.stageId),
          });
        } else if (bHash === undefined && aHash !== undefined) {
          const doc = getDoc(aHash);
          changes.push({
            kind: 'stage-removed',
            stageId: ref.stageId,
            stageType: stringField(doc, 'type') ?? 'unknown',
            label: stringField(doc, 'label'),
          });
        } else if (
          aHash !== undefined &&
          bHash !== undefined &&
          aHash !== bHash
        ) {
          const aDoc = getDoc(aHash);
          const bDoc = getDoc(bHash);
          changes.push({
            kind: 'stage-changed',
            stageId: ref.stageId,
            stageType: stringField(bDoc, 'type') ?? 'unknown',
            changes: diffBody(aDoc, bDoc),
          });
        }
        break;
      }
      case 'codebookNode':
      case 'codebookEdge':
      case 'codebookEgo': {
        const entity =
          ref.kind === 'codebookNode'
            ? 'node'
            : ref.kind === 'codebookEdge'
              ? 'edge'
              : 'ego';
        const typeId = ref.kind === 'codebookEgo' ? undefined : ref.typeId;
        if (aHash === undefined && bHash !== undefined) {
          changes.push({
            kind: 'entity-added',
            entity,
            typeId,
            name: stringField(getDoc(bHash), 'name'),
          });
        } else if (bHash === undefined && aHash !== undefined) {
          changes.push({
            kind: 'entity-removed',
            entity,
            typeId,
            name: stringField(getDoc(aHash), 'name'),
          });
        } else if (
          aHash !== undefined &&
          bHash !== undefined &&
          aHash !== bHash
        ) {
          const aDoc = getDoc(aHash);
          const bDoc = getDoc(bHash);
          changes.push({
            kind: 'entity-changed',
            entity,
            typeId,
            name: stringField(bDoc, 'name'),
            changes: diffBody(aDoc, bDoc).filter(
              (change) => change.path[0] !== 'variables',
            ),
            variables: diffVariables(aDoc, bDoc),
          });
        }
        break;
      }
      case 'settings': {
        if (aHash !== undefined && bHash !== undefined && aHash !== bHash) {
          changes.push({
            kind: 'settings-changed',
            changes: diffBody(getDoc(aHash), getDoc(bHash)),
          });
        }
        break;
      }
      case 'assets': {
        const aDoc = aHash === undefined ? {} : getDoc(aHash);
        const bDoc = bHash === undefined ? {} : getDoc(bHash);
        if (aHash === bHash) break;
        const added: string[] = [];
        const removed: string[] = [];
        const changed: string[] = [];
        for (const key of new Set([
          ...Object.keys(aDoc),
          ...Object.keys(bDoc),
        ])) {
          if (!(key in aDoc)) added.push(key);
          else if (!(key in bDoc)) removed.push(key);
          else if (!equal(aDoc[key], bDoc[key])) changed.push(key);
        }
        changes.push({ kind: 'assets-changed', added, removed, changed });
        break;
      }
      case 'stageOrder':
        break;
    }
  }

  const commonA = aOrder.filter((stageId) => bOrder.includes(stageId));
  const commonB = bOrder.filter((stageId) => aOrder.includes(stageId));
  const kept = longestCommonSubsequence(commonA, commonB);
  for (const stageId of commonA) {
    if (!kept.has(stageId)) {
      changes.push({
        kind: 'stage-moved',
        stageId,
        from: aOrder.indexOf(stageId),
        to: bOrder.indexOf(stageId),
      });
    }
  }

  return changes;
}
