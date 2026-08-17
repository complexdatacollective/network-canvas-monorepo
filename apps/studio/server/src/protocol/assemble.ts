// Deterministic canonical assembly — the pure core of the protocol-store
// contract operation getProtocolDocument (#1276). Everything outside the
// storage layer consumes the assembled, schema-conformant document; this
// module is deliberately schema-version-agnostic (it merges whatever the
// settings section carries), so stored versions at older schema versions
// assemble for migration exactly as fielded.
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

/**
 * Assembles a full protocol document from a section map. Every section must
 * be consumed and every stage in the order list must have a section — a
 * mismatch is an integrity violation, never silently repaired.
 */
export function assembleProtocol(
  sections: Record<string, SectionDoc>,
): Record<string, unknown> {
  let settings: SectionDoc | undefined;
  let stageOrder: string[] | undefined;
  let ego: SectionDoc | undefined;
  let assets: SectionDoc | undefined;
  const stageDocs = new Map<string, SectionDoc>();
  // Null prototypes: type ids are schema-valid identifiers that may collide
  // with Object.prototype members ('__proto__' passes VariableNameSchema),
  // and assigning that key into an ordinary object invokes the prototype
  // setter instead of creating an entry.
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
  // Every draft carries an assets section so the sync engine can lease and
  // edit it; an empty manifest normalizes back to the absent field.
  if (assets !== undefined && Object.keys(assets).length > 0) {
    protocol.assetManifest = assets;
  }
  return protocol;
}
