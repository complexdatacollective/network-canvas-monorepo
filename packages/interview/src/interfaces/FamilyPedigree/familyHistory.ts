import { isEqual } from 'es-toolkit';

import {
  entityPrimaryKeyProperty,
  isFamilyPedigreeStageMetadata,
  type NcEdge,
  type NcNode,
  type StageMetadata,
} from '@codaco/shared-consts';

/**
 * Undo and redo for the family: what the participant's change did to the
 * session, and how to put it back or make it again.
 *
 * Each change is recorded as the session before it and after it. Undoing it
 * puts back, as they were before, only the people, relationships and stage
 * records the change itself altered; redoing it puts back those it made.
 * Anything else that changed in between is kept, so an undo never takes away
 * more than the change it reverses.
 */

/** The parts of the session a change to the family can alter. */
export type FamilyHistoryPoint = Readonly<{
  nodes: readonly NcNode[];
  edges: readonly NcEdge[];
  stageMetadata: StageMetadata | undefined;
}>;

type PedigreeMetadata = typeof isFamilyPedigreeStageMetadata extends ((
  value: unknown,
) => value is infer Entry)
  ? Entry
  : never;
type PedigreeMetadataKey = keyof PedigreeMetadata;
const PEDIGREE_METADATA_KEYS: readonly PedigreeMetadataKey[] = [
  'framing',
  'generatedLabels',
  'standIns',
];

/** What a change altered in one stage's record: some of a family pedigree
 * record's entries, or else the whole record. */
type MetadataChange = Readonly<{
  step: string;
  keys?: readonly PedigreeMetadataKey[];
}>;

/** A recorded change: the session either side of it, and what it altered. */
export type FamilyChange = Readonly<{
  before: FamilyHistoryPoint;
  after: FamilyHistoryPoint;
  nodeIds: ReadonlySet<string>;
  edgeIds: ReadonlySet<string>;
  metadata: readonly MetadataChange[];
}>;

const idOf = (entity: NcNode | NcEdge) => entity[entityPrimaryKeyProperty];

/** The ids of the entities that differ between two lists, whether added,
 * removed or changed. */
function changedIds<T extends NcNode | NcEdge>(
  before: readonly T[],
  after: readonly T[],
) {
  const earlier = new Map(before.map((entity) => [idOf(entity), entity]));
  const later = new Map(after.map((entity) => [idOf(entity), entity]));
  const changed = new Set<string>();
  for (const [id, entity] of earlier) {
    const now = later.get(id);
    if (now !== entity && !isEqual(now, entity)) changed.add(id);
  }
  for (const id of later.keys()) {
    if (!earlier.has(id)) changed.add(id);
  }
  return changed;
}

const isPedigreeRecord = (
  entry: StageMetadata[string] | undefined,
): entry is PedigreeMetadata | undefined =>
  entry === undefined || isFamilyPedigreeStageMetadata(entry);

function metadataChanges(
  before: StageMetadata | undefined,
  after: StageMetadata | undefined,
) {
  const steps = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  const changes: MetadataChange[] = [];
  for (const step of steps) {
    const earlier = before?.[step];
    const later = after?.[step];
    if (isEqual(earlier, later)) continue;
    // A family pedigree's record keeps the framing the participant chose
    // beside what the family's changes write, so only the entries the change
    // wrote are put back.
    if (isPedigreeRecord(earlier) && isPedigreeRecord(later)) {
      const keys = PEDIGREE_METADATA_KEYS.filter(
        (key) => !isEqual(earlier?.[key], later?.[key]),
      );
      if (keys.length > 0) changes.push({ step, keys });
    } else {
      changes.push({ step });
    }
  }
  return changes;
}

/** The change from one point to the next, or null when nothing changed. */
export function changeBetween(
  before: FamilyHistoryPoint,
  after: FamilyHistoryPoint,
): FamilyChange | null {
  const nodeIds = changedIds(before.nodes, after.nodes);
  const edgeIds = changedIds(before.edges, after.edges);
  const metadata = metadataChanges(before.stageMetadata, after.stageMetadata);
  if (nodeIds.size === 0 && edgeIds.size === 0 && metadata.length === 0) {
    return null;
  }
  return { before, after, nodeIds, edgeIds, metadata };
}

/**
 * The entities as they are now, with those `changed` put back as `target`
 * holds them (and taken away where it has none), in `target`'s order. Any
 * not in `target` that the change did not alter follow, as they are now.
 */
function restoreEntities<T extends NcNode | NcEdge>(
  current: readonly T[],
  target: readonly T[],
  changed: ReadonlySet<string>,
) {
  const now = new Map(current.map((entity) => [idOf(entity), entity]));
  const targetIds = new Set(target.map(idOf));
  const restored: T[] = [];
  for (const entity of target) {
    const id = idOf(entity);
    const kept = changed.has(id) ? entity : now.get(id);
    if (kept) restored.push(kept);
  }
  for (const entity of current) {
    const id = idOf(entity);
    if (!targetIds.has(id) && !changed.has(id)) restored.push(entity);
  }
  return restored;
}

function restoreMetadata(
  current: StageMetadata | undefined,
  target: StageMetadata | undefined,
  changes: readonly MetadataChange[],
) {
  const restored: StageMetadata = { ...current };
  for (const { step, keys } of changes) {
    const wanted = target?.[step];
    const kept = restored[step];
    if (
      keys === undefined ||
      !isPedigreeRecord(wanted) ||
      !isPedigreeRecord(kept)
    ) {
      if (wanted === undefined) delete restored[step];
      else restored[step] = wanted;
      continue;
    }
    const pick = <K extends PedigreeMetadataKey>(key: K) =>
      keys.includes(key) ? wanted?.[key] : kept?.[key];
    const framing = pick('framing');
    const generatedLabels = pick('generatedLabels');
    const standIns = pick('standIns');
    // A record holding none of them is no record.
    if (
      framing === undefined &&
      generatedLabels === undefined &&
      standIns === undefined
    ) {
      delete restored[step];
      continue;
    }
    restored[step] = {
      ...(framing === undefined ? {} : { framing }),
      ...(generatedLabels === undefined ? {} : { generatedLabels }),
      ...(standIns === undefined ? {} : { standIns }),
    };
  }
  // A session that had no records goes back to having none.
  return Object.keys(restored).length === 0 && target === undefined
    ? undefined
    : restored;
}

/**
 * The session `current` with what `change` altered put back as it was on one
 * side of it: `before` to undo the change, `after` to redo it.
 */
export function restoreSide(
  current: FamilyHistoryPoint,
  change: FamilyChange,
  side: 'before' | 'after',
): FamilyHistoryPoint {
  const target = change[side];
  const nodes = restoreEntities(current.nodes, target.nodes, change.nodeIds);
  const nodeIds = new Set(nodes.map(idOf));
  // A relationship is never left without either of the people it joins.
  const edges = restoreEntities(
    current.edges,
    target.edges,
    change.edgeIds,
  ).filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
  return {
    nodes,
    edges,
    stageMetadata: restoreMetadata(
      current.stageMetadata,
      target.stageMetadata,
      change.metadata,
    ),
  };
}
