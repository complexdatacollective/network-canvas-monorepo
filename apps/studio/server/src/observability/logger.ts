import { AsyncLocalStorage } from 'node:async_hooks';

import pino, { type DestinationStream } from 'pino';

import {
  REQUEST_ID,
  requestLogFields,
  type RequestObservation as SharedRequestObservation,
} from '@codaco/studio-sync/operational-http';

const DIAGNOSTICS = {
  STUDIO_AUDIT_ALERT_WORKER_ERROR: 'error',
  STUDIO_CONFIGURATION_INVALID: 'error',
  STUDIO_ENCRYPTION_INVALID: 'error',
  STUDIO_ENCRYPTION_MAINTENANCE_FAILED: 'error',
  STUDIO_BACKUP_ACCESS_UNSAFE: 'error',
  STUDIO_RECOVERY_AUTHORIZATION_RECONCILED: 'info',
  STUDIO_RECOVERY_AUTHORIZATION_FAILED: 'error',
  STUDIO_RECOVERY_CURRENT_AUTHORIZATION_COMPLETED: 'info',
  STUDIO_RECOVERY_CURRENT_AUTHORIZATION_FAILED: 'error',
  STUDIO_PROCESS_FAILED: 'error',
  STUDIO_CLIENT_ASSETS_UNAVAILABLE: 'warn',
  STUDIO_DATABASE_IDLE_ERROR: 'error',
  STUDIO_DATABASE_IDENTITY_UNSAFE: 'error',
  STUDIO_DATABASE_UNREACHABLE: 'error',
  STUDIO_SCHEMA_ABSENT: 'error',
  STUDIO_SCHEMA_STALE: 'error',
  STUDIO_SCHEMA_CURRENT: 'info',
  STUDIO_SERVER_STARTED: 'info',
  STUDIO_WEB_REPLICA_REFUSED: 'error',
  STUDIO_WEB_LEASE_LOST: 'error',
  STUDIO_SHUTDOWN_FAILED: 'error',
  STUDIO_AUDIT_APPEND_FAILED: 'error',
  STUDIO_AUDIT_DENIAL_EVENT_LOST: 'error',
  STUDIO_DENIED_AUDIT_SUMMARY_FAILED: 'error',
  STUDIO_DENIED_AUDIT_FLUSH_TIMEOUT: 'error',
  STUDIO_AUTH_ERROR: 'error',
  STUDIO_AUTH_WARNING: 'warn',
  STUDIO_WEBSOCKET_ERROR: 'error',
  STUDIO_RESPONSE_STREAM_FAILED: 'error',
  STUDIO_INVITATION_WORKER_ERROR: 'error',
} as const;

type DiagnosticCode = keyof typeof DIAGNOSTICS;
type Correlation = { requestId?: string; teamId?: string };

export type RequestObservation = SharedRequestObservation & {
  teamId?: string;
};

export type OperationalLogger = {
  request(observation: RequestObservation): void;
  diagnostic(code: DiagnosticCode, correlation?: Correlation): void;
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
        logger[DIAGNOSTICS[code]]({
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
  code: DiagnosticCode,
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
