import { Effect } from 'effect';

import { sessionProperty } from '@codaco/shared-consts';

import { formatExportableSession } from '../formatters/formatExportableSessions';
import type {
  FormattedSession,
  InterviewExportInput,
  ProtocolExportInput,
  SessionWithNetworkEgo,
  SessionWithResequencedIDs,
} from '../input';
import type { ExportOptions } from '../options';
import type { ExportFailure } from '../output';
import { ProtocolRepository } from '../services/ProtocolRepository';
import { collectProtocolHashes } from './collectProtocolHashes';
import groupByProtocolProperty from './groupByProtocolProperty';
import { insertEgoIntoSessionNetwork } from './insertEgoIntoSessionNetworks';
import { partitionByProtocolAvailability } from './partitionByProtocolAvailability';
import { perSession } from './perSession';
import { resequenceSessionIds } from './resequenceIds';

type ProcessSessionsResult = {
  readonly grouped: Record<string, SessionWithResequencedIDs[]>;
  readonly protocols: Record<string, ProtocolExportInput>;
  readonly failures: ExportFailure[];
};

const getInterviewId = (s: InterviewExportInput) => s.id;
const getFormattedId = (s: FormattedSession) =>
  s.sessionVariables[sessionProperty];
const getNetworkEgoId = (s: SessionWithNetworkEgo) =>
  s.sessionVariables[sessionProperty];

export const processSessions = (
  sessions: InterviewExportInput[],
  exportOptions: ExportOptions,
) =>
  Effect.gen(function* () {
    const protocolRepo = yield* ProtocolRepository;

    const hashes = collectProtocolHashes(sessions);
    const protocols = yield* protocolRepo
      .getProtocols(hashes)
      .pipe(Effect.withSpan('format.fetchProtocols'));

    const { resolvable, missing } = partitionByProtocolAvailability(
      sessions,
      protocols,
    );
    const failures: ExportFailure[] = [...missing];

    const [formatErrors, formatted] = yield* perSession(
      'format',
      (s: InterviewExportInput) =>
        Effect.try(() => {
          const protocol = protocols[s.protocolHash];
          if (!protocol) {
            throw new Error(
              `unreachable: protocol ${s.protocolHash} dropped earlier`,
            );
          }
          return formatExportableSession(s, protocol, exportOptions);
        }),
      getInterviewId,
    )(resolvable).pipe(Effect.withSpan('format.buildVariables'));

    for (const err of formatErrors) {
      failures.push({
        kind: 'session-processing',
        sessionId: err.sessionId,
        error: err,
      });
    }

    const [egoErrors, withEgo] = yield* perSession(
      'insertEgo',
      (s: FormattedSession) => Effect.try(() => insertEgoIntoSessionNetwork(s)),
      getFormattedId,
    )(formatted).pipe(Effect.withSpan('format.insertEgo'));

    for (const err of egoErrors) {
      failures.push({
        kind: 'session-processing',
        sessionId: err.sessionId,
        error: err,
      });
    }

    const [reseqErrors, resequenced] = yield* perSession(
      'resequence',
      (s: SessionWithNetworkEgo) => Effect.try(() => resequenceSessionIds(s)),
      getNetworkEgoId,
    )(withEgo).pipe(Effect.withSpan('format.resequence'));

    for (const err of reseqErrors) {
      failures.push({
        kind: 'session-processing',
        sessionId: err.sessionId,
        error: err,
      });
    }

    const grouped = groupByProtocolProperty(resequenced);

    return { grouped, protocols, failures } satisfies ProcessSessionsResult;
  });
