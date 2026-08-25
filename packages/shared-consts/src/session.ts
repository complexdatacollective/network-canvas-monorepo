// TODO: should be part of Fresco/Interviewer?

import { type NcNetwork } from './network.ts';
import { type StageMetadata } from './stage-metadata.ts';

export const caseProperty = 'caseId';
export const sessionProperty = 'sessionId';
export const protocolProperty = 'protocolUID';
export const protocolName = 'protocolName';
export const sessionStartTimeProperty = 'sessionStart';
export const sessionFinishTimeProperty = 'sessionFinish';
export const sessionExportTimeProperty = 'sessionExported';
export const codebookHashProperty = 'codebookHash';

/**
 * Session payload. Matches the persisted session state used by the reducer,
 * but is kept explicit so the public contract does not expose Redux internals.
 */
export type SessionPayload = {
  id: string;
  startTime: string;
  finishTime: string | null;
  exportTime: string | null;
  lastUpdated: string;
  network: NcNetwork;
  promptIndex?: number;
  stageMetadata?: StageMetadata;
};
