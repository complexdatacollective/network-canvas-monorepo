export const entityPrimaryKeyProperty = '_uid';
export const entityAttributesProperty = 'attributes';
export const edgeSourceProperty = 'from';
export const edgeTargetProperty = 'to';

export type NcEntity = {
  readonly [entityPrimaryKeyProperty]: string;
  type?: string;
  [entityAttributesProperty]: Record<string, unknown>;
};

export type NcNode = NcEntity & {
  type: string;
  stageId?: string;
  promptIDs?: string[];
  displayVariable?: string; // @deprecated
};

export type NcEdge = NcEntity & {
  type: string;
  from: string;
  to: string;
};

export type NcEgo = NcEntity;

export type NcNetwork = {
  nodes: NcNode[];
  edges: NcEdge[];
  ego?: NcEgo;
};
