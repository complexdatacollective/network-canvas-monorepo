export type SectionRef =
  | { kind: 'settings' }
  | { kind: 'stageOrder' }
  | { kind: 'stage'; stageId: string }
  | { kind: 'codebookNode'; typeId: string }
  | { kind: 'codebookEdge'; typeId: string }
  | { kind: 'codebookEgo' }
  | { kind: 'assets' };

declare const protocolSectionIdBrand: unique symbol;

/** Client-safe identity shared by Studio storage, sync, and editor hosts. */
export type ProtocolSectionId = string & {
  readonly [protocolSectionIdBrand]: true;
};

export class UnknownSectionIdError extends Error {
  constructor(id: string) {
    super(`not a protocol-store section id: ${id}`);
  }
}

const STAGE_PREFIX = 'stage:';
const NODE_PREFIX = 'codebook:node:';
const EDGE_PREFIX = 'codebook:edge:';

export function sectionId(ref: SectionRef): ProtocolSectionId {
  switch (ref.kind) {
    case 'settings':
      return toProtocolSectionId('settings');
    case 'stageOrder':
      return toProtocolSectionId('stageOrder');
    case 'stage':
      return toProtocolSectionId(
        `${STAGE_PREFIX}${nonEmpty(ref.stageId, 'stage id')}`,
      );
    case 'codebookNode':
      return toProtocolSectionId(
        `${NODE_PREFIX}${nonEmpty(ref.typeId, 'node type id')}`,
      );
    case 'codebookEdge':
      return toProtocolSectionId(
        `${EDGE_PREFIX}${nonEmpty(ref.typeId, 'edge type id')}`,
      );
    case 'codebookEgo':
      return toProtocolSectionId('codebook:ego');
    case 'assets':
      return toProtocolSectionId('assets');
  }
  throw new UnknownSectionIdError('unknown section reference');
}

function toProtocolSectionId(value: string): ProtocolSectionId {
  // This module is the sole constructor for the branded string.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as ProtocolSectionId;
}

function nonEmpty(value: string, label: string): string {
  if (value === '') throw new UnknownSectionIdError(`empty ${label}`);
  return value;
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
