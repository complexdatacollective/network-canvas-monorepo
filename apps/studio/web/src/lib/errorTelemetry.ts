import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { startResearcherLogs } from '../runtime/browserLogs.ts';
import { rpcQuery } from '../runtime/rpc.ts';
import { useErrorTelemetry } from '../runtime/telemetry.ts';

export function ResearcherErrorTelemetry(): null {
  const status = useQuery(
    rpcQuery('status', undefined, { staleTime: Infinity }),
  );
  const telemetry = status.data?.telemetry;
  const logLevel = status.data?.logLevel;
  useErrorTelemetry('researcher', telemetry === true);
  useEffect(
    () =>
      telemetry === undefined || logLevel === undefined
        ? undefined
        : startResearcherLogs({
            enabled: telemetry,
            level: logLevel,
            credentials: 'same-origin',
            headers: () => ({}),
          }),
    [telemetry, logLevel],
  );
  return null;
}
