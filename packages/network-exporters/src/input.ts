import type { Codebook, FinishOutcome } from '@codaco/protocol-validation';
import type {
  NcEdge,
  NcNetwork,
  NcNode,
  caseProperty,
  codebookHashProperty,
  edgeExportIDProperty,
  egoProperty,
  finishOutcomeProperty,
  ncSourceUUID,
  ncTargetUUID,
  nodeExportIDProperty,
  protocolName,
  protocolProperty,
  sessionExportTimeProperty,
  sessionFinishTimeProperty,
  sessionProperty,
  sessionStartTimeProperty,
} from '@codaco/shared-consts';

type NodeWithEgo = NcNode & {
  [egoProperty]: string;
};

type EdgeWithEgo = NcEdge & {
  [egoProperty]: string;
};

export type SessionVariables = {
  [caseProperty]: string;
  [sessionProperty]: string;
  [protocolProperty]: string;
  [protocolName]: string;
  [codebookHashProperty]: string;
  [finishOutcomeProperty]: FinishOutcome | null;
  [sessionExportTimeProperty]: string;
  [sessionStartTimeProperty]: string | undefined;
  [sessionFinishTimeProperty]: string | undefined;
  COMMIT_HASH: string;
  APP_VERSION: string;
};

export type FormattedSession = NcNetwork & {
  sessionVariables: SessionVariables;
};

export type SessionWithNetworkEgo = Omit<
  FormattedSession,
  'nodes' | 'edges'
> & {
  nodes: NodeWithEgo[];
  edges: EdgeWithEgo[];
};

export type NodeWithResequencedID = NodeWithEgo & {
  [nodeExportIDProperty]: number;
};

export type EdgeWithResequencedID = EdgeWithEgo & {
  [ncSourceUUID]: string;
  [ncTargetUUID]: string;
  [edgeExportIDProperty]: number;
};

export type SessionWithResequencedIDs = Omit<
  FormattedSession,
  'nodes' | 'edges'
> & {
  nodes: NodeWithResequencedID[];
  edges: EdgeWithResequencedID[];
};

export type ProtocolExportInput = {
  hash: string;
  name: string;
  codebook: Codebook;
  /**
   * For each layout of the codebook, the node types a stage sets it for, as
   * `getNodeTypesWithLayout` gives them. A node type has columns for the
   * layouts it is listed under, and for any layout a node of it holds a
   * position in.
   */
  layoutNodeTypes: Readonly<Record<string, readonly string[]>>;
};

/**
 * The codebook as the formatters read it, with each layout's node types. The
 * export pipeline always gives them; a formatter called on its own without
 * them exports the layouts that rows hold positions in.
 */
export type ExportCodebook = Codebook &
  Partial<Pick<ProtocolExportInput, 'layoutNodeTypes'>>;

export type InterviewExportInput = {
  id: string;
  participantIdentifier: string;
  startTime: Date;
  finishTime: Date | null;
  network: NcNetwork;
  protocolHash: string;
  /**
   * How the interview ended: the outcome of the finish stage it ended at, or
   * `null` for an interview that is not finished, or was finished before
   * finish outcomes were recorded.
   */
  finishOutcome: FinishOutcome | null;
};
