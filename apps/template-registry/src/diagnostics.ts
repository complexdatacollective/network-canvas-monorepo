import { REQUEST_ID } from '@codaco/studio-sync/operational-http';

import type { RegistryOperationalDiagnostic } from './diagnostic-catalog.ts';

export type RegistryDiagnostic = RegistryOperationalDiagnostic;

/** No exception, address, URL, provider reply, token, or content enters a log. */
export function logRegistryDiagnostic(
  code: RegistryDiagnostic,
  requestId?: string,
): void {
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      code,
      ...(requestId && REQUEST_ID.test(requestId)
        ? { request_id: requestId }
        : {}),
    })}\n`,
  );
}
