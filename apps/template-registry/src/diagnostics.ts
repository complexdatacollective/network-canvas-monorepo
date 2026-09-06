import type { RegistryAuthDiagnostic } from './auth/service.ts';

export type RegistryDiagnostic =
  | RegistryAuthDiagnostic
  | 'REGISTRY_CONFIGURATION_INVALID'
  | 'REGISTRY_STARTUP_FAILED'
  | 'REGISTRY_PROCESS_FAILED'
  | 'REGISTRY_DATABASE_IDLE_ERROR'
  | 'REGISTRY_REQUEST_FAILED'
  | 'REGISTRY_READINESS_FAILED'
  | 'REGISTRY_CLEANUP_FAILED'
  | 'REGISTRY_LISTENING'
  | 'REGISTRY_SHUTDOWN_COMPLETE'
  | 'REGISTRY_SHUTDOWN_FAILED'
  | 'REGISTRY_MIGRATION_COMPLETE'
  | 'REGISTRY_MIGRATION_FAILED'
  | 'REGISTRY_OPERATOR_COMPLETE'
  | 'REGISTRY_OPERATOR_FAILED'
  | 'REGISTRY_BACKUP_VERIFIED'
  | 'REGISTRY_BACKUP_FAILED';

/** No exception, address, URL, provider reply, token, or content enters a log. */
export function logRegistryDiagnostic(
  code: RegistryDiagnostic,
  requestId?: string,
): void {
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      code,
      ...(requestId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        requestId,
      )
        ? { request_id: requestId }
        : {}),
    })}\n`,
  );
}
