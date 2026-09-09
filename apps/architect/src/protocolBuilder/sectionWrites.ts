import { v4 as uuid } from 'uuid';

import {
  EdgeDefinitionSchema,
  EgoDefinitionSchema,
  NodeDefinitionSchema,
  stageSchema,
  type CurrentProtocol,
  type EntityDefinition,
} from '@codaco/protocol-validation';
import { canonicalize, type SectionDoc } from '@codaco/studio-sync/apply';
import {
  SettingsSectionSchema,
  StageOrderSectionSchema,
  type SectionIssue,
} from '@codaco/studio-sync/section-validation';
import {
  sectionId,
  type ProtocolSectionId,
  type SectionRef,
} from '@codaco/studio-sync/taxonomy';
import { actionCreators as protocolActionCreators } from '~/ducks/modules/activeProtocol';
import { deleteAsset } from '~/ducks/modules/protocol/assetManifest';
import {
  createEdgeAsync,
  createTypeAsync,
  updateTypeAsync,
} from '~/ducks/modules/protocol/codebook';
import { commitStageEditorDraft } from '~/ducks/modules/protocol/commitStageEditorDraft';
import { actionCreators as stageActionCreators } from '~/ducks/modules/protocol/stages';
import { getAssetManifest, getCanonicalProtocol } from '~/selectors/protocol';

import type { ArchitectStore } from './architectStore.ts';

/**
 * `updateType` reads a type id for `node` and `edge` only; the ego definition
 * is the codebook's single `ego` key, so the value here is never read.
 */
const EGO_TYPE = 'ego';

export type SectionWrite =
  | Readonly<{ status: 'written' }>
  | Readonly<{ status: 'refused'; issues: SectionIssue[] }>;

export type SectionCreation =
  | Readonly<{ status: 'created'; sectionId: ProtocolSectionId }>
  | Readonly<{
      status: 'refused';
      sectionId: ProtocolSectionId;
      issues: SectionIssue[];
    }>;

export type CreatableSectionKind = 'stage' | 'codebookNode' | 'codebookEdge';

type ParseFailure = Readonly<{
  issues: ReadonlyArray<
    Readonly<{ path: readonly PropertyKey[]; message: string }>
  >;
}>;

function refuseParse(
  error: ParseFailure,
): SectionWrite & { status: 'refused' } {
  return {
    status: 'refused',
    issues: error.issues.map((issue) => ({
      path: issue.path.map((part) =>
        typeof part === 'symbol' ? String(part) : part,
      ),
      message: issue.message,
    })),
  };
}

function refuse(
  message: string,
  path: (string | number)[] = [],
): SectionWrite & { status: 'refused' } {
  return { status: 'refused', issues: [{ path, message }] };
}

/**
 * The move `moveStage` would have to make to reach `next`, or `undefined` if
 * no single relocation does.
 *
 * A researcher reorders the timeline by dragging one stage, which is the move
 * Architect's only stage-order writer applies. Two orders one relocation apart
 * differ over a contiguous run, so the ends of that run are the only candidate
 * moves and applying one of them settles it.
 */
function singleRelocation(
  current: readonly string[],
  next: readonly string[],
): Readonly<{ oldIndex: number; newIndex: number }> | undefined {
  if (current.length !== next.length) return undefined;
  let first = 0;
  while (first < current.length && current[first] === next[first]) first += 1;
  if (first === current.length) return undefined;
  let last = current.length - 1;
  while (last > first && current[last] === next[last]) last -= 1;

  for (const move of [
    { oldIndex: first, newIndex: last },
    { oldIndex: last, newIndex: first },
  ]) {
    const moved = [...current];
    const [item] = moved.splice(move.oldIndex, 1);
    if (item === undefined) continue;
    moved.splice(move.newIndex, 0, item);
    if (moved.every((id, index) => id === next[index])) return move;
  }
  return undefined;
}

async function writeEntityDefinition(
  store: ArchitectStore,
  entity: 'node' | 'edge' | 'ego',
  type: string,
  configuration: Partial<EntityDefinition>,
): Promise<SectionWrite> {
  await store
    .dispatch(updateTypeAsync({ entity, type, configuration }))
    .unwrap();
  return { status: 'written' };
}

function submitStage(
  store: ArchitectStore,
  stageId: string,
  document: SectionDoc,
): SectionWrite {
  const parsed = stageSchema.safeParse(document);
  if (!parsed.success) return refuseParse(parsed.error);
  store.dispatch(
    commitStageEditorDraft({ stageId, stage: parsed.data, codebook: null }),
  );
  return { status: 'written' };
}

function submitSettings(
  store: ArchitectStore,
  document: SectionDoc,
): SectionWrite {
  const parsed = SettingsSectionSchema.safeParse(document);
  if (!parsed.success) return refuseParse(parsed.error);
  // The optional three are named even when the document omits them: the
  // section is written whole, so a key the researcher cleared has to reach the
  // merging reducer as `undefined` rather than simply be absent.
  const settings: Partial<CurrentProtocol> = {
    name: parsed.data.name,
    schemaVersion: parsed.data.schemaVersion,
    description: parsed.data.description,
    experiments: parsed.data.experiments,
    lastModified: parsed.data.lastModified,
  };
  store.dispatch(protocolActionCreators.updateProtocol(settings));
  return { status: 'written' };
}

function submitStageOrder(
  store: ArchitectStore,
  document: SectionDoc,
): SectionWrite {
  const parsed = StageOrderSectionSchema.safeParse(document);
  if (!parsed.success) return refuseParse(parsed.error);
  const current = (getCanonicalProtocol(store.getState())?.stages ?? []).map(
    (stage) => stage.id,
  );
  const move = singleRelocation(current, parsed.data.stages);
  if (move === undefined) {
    return refuse(
      'Architect reorders the stage index one stage at a time, and this order is not one move from the committed one',
      ['stages'],
    );
  }
  store.dispatch(stageActionCreators.moveStage(move.oldIndex, move.newIndex));
  // `moveStage` drops a reorder that would put a stage before the stage its
  // skip logic jumps to, and says nothing. Read the order back, so the refusal
  // reaches the caller rather than passing as a write that did nothing.
  const written = (getCanonicalProtocol(store.getState())?.stages ?? []).map(
    (stage) => stage.id,
  );
  if (!written.every((id, index) => id === parsed.data.stages[index])) {
    return refuse(
      'this order would put a stage before the stage its skip logic jumps to',
      ['stages'],
    );
  }
  return { status: 'written' };
}

function submitAssets(
  store: ArchitectStore,
  document: SectionDoc,
): SectionWrite {
  const current = getAssetManifest(store.getState());
  for (const [id, entry] of Object.entries(document)) {
    const committed = current[id];
    if (committed === undefined) {
      return refuse(
        'Architect imports a resource through the resource procedures, which write its bytes; a manifest entry cannot be added on its own',
        [id],
      );
    }
    if (canonicalize(entry) !== canonicalize(committed)) {
      return refuse(
        'Architect has no writer that edits a committed manifest entry in place',
        [id],
      );
    }
  }
  for (const id of Object.keys(current)) {
    if (document[id] === undefined) store.dispatch(deleteAsset(id));
  }
  return { status: 'written' };
}

/** Dispatches the reducer path that writes one section whole. */
export function submitSection(
  store: ArchitectStore,
  ref: SectionRef,
  document: SectionDoc,
): SectionWrite | Promise<SectionWrite> {
  switch (ref.kind) {
    case 'stage':
      return submitStage(store, ref.stageId, document);
    case 'codebookNode': {
      const parsed = NodeDefinitionSchema.safeParse(document);
      if (!parsed.success) return refuseParse(parsed.error);
      return writeEntityDefinition(store, 'node', ref.typeId, parsed.data);
    }
    case 'codebookEdge': {
      const parsed = EdgeDefinitionSchema.safeParse(document);
      if (!parsed.success) return refuseParse(parsed.error);
      return writeEntityDefinition(store, 'edge', ref.typeId, parsed.data);
    }
    case 'codebookEgo': {
      const parsed = EgoDefinitionSchema.safeParse(document);
      if (!parsed.success) return refuseParse(parsed.error);
      return writeEntityDefinition(store, 'ego', EGO_TYPE, parsed.data);
    }
    case 'settings':
      return submitSettings(store, document);
    case 'stageOrder':
      return submitStageOrder(store, document);
    case 'assets':
      return submitAssets(store, document);
  }
}

/**
 * Creates a section and registers its pointer in the same dispatch.
 *
 * A created stage rides `commitStageEditorDraft` with a null `stageId`, which
 * is what Architect already uses for exactly this: the stages reducer splices
 * it in at `index`, so the stage and its place in the order land together.
 */
export async function createSection(
  store: ArchitectStore,
  kind: CreatableSectionKind,
  document: SectionDoc,
  position: number | undefined,
): Promise<SectionCreation> {
  if (kind === 'stage') {
    const stageId = uuid();
    const target = sectionId({ kind, stageId });
    const parsed = stageSchema.safeParse({ ...document, id: stageId });
    if (!parsed.success)
      return { ...refuseParse(parsed.error), sectionId: target };
    store.dispatch(
      commitStageEditorDraft({
        stageId: null,
        stage: parsed.data,
        codebook: null,
        ...(position === undefined ? {} : { index: position }),
      }),
    );
    return { status: 'created', sectionId: target };
  }

  // The codebook thunks mint the type id themselves, so a refusal is named
  // with one this call would have taken — as the in-memory host's is.
  const target = sectionId({ kind, typeId: uuid() });
  if (kind === 'codebookNode') {
    const parsed = NodeDefinitionSchema.safeParse(document);
    if (!parsed.success)
      return { ...refuseParse(parsed.error), sectionId: target };
    const created = await store
      .dispatch(createTypeAsync({ entity: 'node', configuration: parsed.data }))
      .unwrap();
    return {
      status: 'created',
      sectionId: sectionId({ kind, typeId: created.type }),
    };
  }

  const parsed = EdgeDefinitionSchema.safeParse(document);
  if (!parsed.success)
    return { ...refuseParse(parsed.error), sectionId: target };
  const created = await store.dispatch(createEdgeAsync(parsed.data)).unwrap();
  return {
    status: 'created',
    sectionId: sectionId({ kind, typeId: created.type }),
  };
}
