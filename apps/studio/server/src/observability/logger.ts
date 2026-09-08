import { AsyncLocalStorage } from 'node:async_hooks';

import pino, { type DestinationStream } from 'pino';

import {
  REQUEST_ID,
  requestLogFields,
  type RequestObservation as SharedRequestObservation,
} from '@codaco/studio-sync/operational-http';

import {
  STUDIO_OPERATIONAL_DIAGNOSTIC_LEVELS,
  type StudioOperationalDiagnostic,
} from './diagnostic-catalog.ts';

type Correlation = { requestId?: string; teamId?: string };

export type RequestObservation = SharedRequestObservation & {
  teamId?: string;
};

export type OperationalLogger = {
  request(observation: RequestObservation): void;
  diagnostic(
    code: StudioOperationalDiagnostic,
    correlation?: Correlation,
  ): void;
};

export type RequestContext = {
  requestId: string;
  teamId?: string;
  logger: OperationalLogger;
};

export const requestContext = new AsyncLocalStorage<RequestContext>();

export const UUID = REQUEST_ID;

function correlationFields(correlation?: Correlation) {
  // Callers obtain team ids from authorization or committed audit context,
  // never headers or procedure input alone. Bound even those database values.
  return {
    ...(correlation?.requestId && UUID.test(correlation.requestId)
      ? { request_id: correlation.requestId }
      : {}),
    ...(correlation?.teamId && /^[\w-]{1,128}$/.test(correlation.teamId)
      ? { team_id: correlation.teamId }
      : {}),
  };
}

/** The only runtime log sink. No exception, message, body or header API. */
export function createOperationalLogger(
  destination?: DestinationStream,
): OperationalLogger {
  const logger = pino(
    { base: undefined, timestamp: pino.stdTimeFunctions.isoTime },
    destination,
  );
  return {
    request(observation) {
      try {
        logger.info({
          event: 'http_request',
          ...correlationFields(observation),
          ...requestLogFields(observation),
        });
      } catch {
        /* Logging failures cannot alter a request or domain transaction. */
      }
    },
    diagnostic(code, correlation) {
      try {
        logger[STUDIO_OPERATIONAL_DIAGNOSTIC_LEVELS[code]]({
          event: 'operational',
          code,
          ...correlationFields(correlation),
        });
      } catch {
        /* The sink is observational, including during database failure. */
      }
    },
  };
}

export const operationalLogger = createOperationalLogger();

export function logOperational(
  code: StudioOperationalDiagnostic,
  correlation?: Correlation,
): void {
  const context = requestContext.getStore();
  (context?.logger ?? operationalLogger).diagnostic(
    code,
    correlation ?? context,
  );
}

/** Call only after membership, study tenancy, or invitation acceptance resolves. */
export function correlateAuthorizedTeam(teamId: string): void {
  const context = requestContext.getStore();
  if (context) context.teamId = teamId;
}
