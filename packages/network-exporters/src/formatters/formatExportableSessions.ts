import { hash } from 'ohash';

import {
  caseProperty,
  codebookHashProperty,
  protocolName,
  protocolProperty,
  sessionExportTimeProperty,
  sessionFinishTimeProperty,
  sessionProperty,
  sessionStartTimeProperty,
} from '@codaco/shared-consts';

import type {
  FormattedSession,
  InterviewExportInput,
  ProtocolExportInput,
  SessionVariables,
} from '../input';
import type { ExportOptions } from '../options';

export const formatExportableSession = (
  session: InterviewExportInput,
  protocol: ProtocolExportInput,
  exportOptions: ExportOptions,
): FormattedSession => {
  const sessionVariables: SessionVariables = {
    [caseProperty]: session.participantIdentifier,
    [sessionProperty]: session.id,
    [protocolProperty]: protocol.hash,
    [protocolName]: protocol.name,
    [codebookHashProperty]: hash(protocol.codebook),
    [sessionStartTimeProperty]: session.startTime.toISOString(),
    [sessionFinishTimeProperty]: session.finishTime?.toISOString() ?? undefined,
    [sessionExportTimeProperty]: new Date().toISOString(),
    COMMIT_HASH: exportOptions.commitHash ?? '',
    APP_VERSION: exportOptions.appVersion ?? '',
  };

  return {
    ...session.network,
    sessionVariables,
  };
};
