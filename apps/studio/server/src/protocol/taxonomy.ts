export type SectionRef =
  | { kind: 'settings' }
  | { kind: 'stageOrder' }
  | { kind: 'stage'; stageId: string }
  | { kind: 'codebookNode'; typeId: string }
  | { kind: 'codebookEdge'; typeId: string }
  | { kind: 'codebookEgo' }
  | { kind: 'assets' };

/** @public */
export class UnknownSectionIdError extends Error {
  constructor(id: string) {
    super(`not a protocol-store section id: ${id}`);
  }
}

const STAGE_PREFIX = 'stage:';
const NODE_PREFIX = 'codebook:node:';
const EDGE_PREFIX = 'codebook:edge:';

export function sectionId(ref: SectionRef): string {
  switch (ref.kind) {
    case 'settings':
      return 'settings';
    case 'stageOrder':
      return 'stageOrder';
    case 'stage':
      return `${STAGE_PREFIX}${ref.stageId}`;
    case 'codebookNode':
      return `${NODE_PREFIX}${ref.typeId}`;
    case 'codebookEdge':
      return `${EDGE_PREFIX}${ref.typeId}`;
    case 'codebookEgo':
      return 'codebook:ego';
    case 'assets':
      return 'assets';
  }
}

// Stage and codebook type ids may themselves contain ':', so this matches
// fixed prefixes and takes the remainder verbatim rather than splitting.
export function parseSectionId(id: string): SectionRef {
  if (id === 'settings') return { kind: 'settings' };
  if (id === 'stageOrder') return { kind: 'stageOrder' };
  if (id === 'codebook:ego') return { kind: 'codebookEgo' };
  if (id === 'assets') return { kind: 'assets' };
  if (id.startsWith(STAGE_PREFIX)) {
    const stageId = id.slice(STAGE_PREFIX.length);
    if (stageId !== '') return { kind: 'stage', stageId };
  }
  if (id.startsWith(NODE_PREFIX)) {
    const typeId = id.slice(NODE_PREFIX.length);
    if (typeId !== '') return { kind: 'codebookNode', typeId };
  }
  if (id.startsWith(EDGE_PREFIX)) {
    const typeId = id.slice(EDGE_PREFIX.length);
    if (typeId !== '') return { kind: 'codebookEdge', typeId };
  }
  throw new UnknownSectionIdError(id);
}
