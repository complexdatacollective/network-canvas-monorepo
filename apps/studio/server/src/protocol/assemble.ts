import type { SectionDoc } from '@codaco/studio-sync/apply';

import { parseSectionId } from './taxonomy.ts';

export class AssemblyError extends Error {}

function stageOrderOf(doc: SectionDoc): string[] {
  const order = doc.stages;
  if (
    !Array.isArray(order) ||
    order.some((entry) => typeof entry !== 'string')
  ) {
    throw new AssemblyError('stageOrder section is not a list of stage ids');
  }
  return order as string[];
}

// Deliberately schema-version-agnostic — it merges whatever the settings
// section carries — so a stored version at an older schema assembles exactly
// as fielded for migration.
export function assembleProtocol(
  sections: Record<string, SectionDoc>,
): Record<string, unknown> {
  let settings: SectionDoc | undefined;
  let stageOrder: string[] | undefined;
  let ego: SectionDoc | undefined;
  let assets: SectionDoc | undefined;
  const stageDocs = new Map<string, SectionDoc>();
  // Null prototypes: '__proto__' is a schema-valid type id, and assigning it
  // into an ordinary object invokes the prototype setter instead of adding an
  // entry, silently losing the entity.
  const node: Record<string, SectionDoc> = Object.create(null) as Record<
    string,
    SectionDoc
  >;
  const edge: Record<string, SectionDoc> = Object.create(null) as Record<
    string,
    SectionDoc
  >;

  for (const [id, doc] of Object.entries(sections)) {
    const ref = parseSectionId(id);
    switch (ref.kind) {
      case 'settings':
        settings = doc;
        break;
      case 'stageOrder':
        stageOrder = stageOrderOf(doc);
        break;
      case 'stage':
        stageDocs.set(ref.stageId, doc);
        break;
      case 'codebookNode':
        node[ref.typeId] = doc;
        break;
      case 'codebookEdge':
        edge[ref.typeId] = doc;
        break;
      case 'codebookEgo':
        ego = doc;
        break;
      case 'assets':
        assets = doc;
        break;
    }
  }

  if (settings === undefined) {
    throw new AssemblyError('missing settings section');
  }
  if (stageOrder === undefined) {
    throw new AssemblyError('missing stageOrder section');
  }

  const stages = stageOrder.map((stageId) => {
    const doc = stageDocs.get(stageId);
    if (doc === undefined) {
      throw new AssemblyError(`stageOrder names missing stage ${stageId}`);
    }
    stageDocs.delete(stageId);
    return doc;
  });
  if (stageDocs.size > 0) {
    const orphans = [...stageDocs.keys()].join(', ');
    throw new AssemblyError(`stages missing from stageOrder: ${orphans}`);
  }

  const codebook: Record<string, unknown> = {};
  if (Object.keys(node).length > 0) codebook.node = node;
  if (Object.keys(edge).length > 0) codebook.edge = edge;
  if (ego !== undefined) codebook.ego = ego;

  const protocol: Record<string, unknown> = { ...settings, codebook, stages };
  if (assets !== undefined && Object.keys(assets).length > 0) {
    protocol.assetManifest = assets;
  }
  return protocol;
}
