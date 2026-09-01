import type { SectionDoc } from './apply.ts';
import { parseSectionId } from './taxonomy.ts';

export class ProtocolAssemblyError extends Error {}

function stageOrderOf(doc: SectionDoc): string[] {
  const order = doc.stages;
  if (!isStringArray(order)) {
    throw new ProtocolAssemblyError(
      'stageOrder section is not a list of stage ids',
    );
  }
  return order;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string')
  );
}

/**
 * Assemble the client-safe section model into a protocol-shaped document.
 * Callers must run the canonical protocol schema before treating it as valid.
 */
export function assembleProtocolSections(
  sections: Readonly<Record<string, SectionDoc>>,
): Record<string, unknown> {
  let settings: SectionDoc | undefined;
  let stageOrder: string[] | undefined;
  let ego: SectionDoc | undefined;
  let assets: SectionDoc | undefined;
  const stageDocs = new Map<string, SectionDoc>();
  // Null prototypes preserve schema-valid `__proto__` entity ids.
  const node: Record<string, SectionDoc> = Object.create(null);
  const edge: Record<string, SectionDoc> = Object.create(null);

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
    throw new ProtocolAssemblyError('missing settings section');
  }
  if (stageOrder === undefined) {
    throw new ProtocolAssemblyError('missing stageOrder section');
  }

  const stages = stageOrder.map((stageId) => {
    const doc = stageDocs.get(stageId);
    if (doc === undefined) {
      throw new ProtocolAssemblyError(
        `stageOrder names missing stage ${stageId}`,
      );
    }
    stageDocs.delete(stageId);
    return doc;
  });
  if (stageDocs.size > 0) {
    throw new ProtocolAssemblyError(
      `stages missing from stageOrder: ${[...stageDocs.keys()].join(', ')}`,
    );
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
