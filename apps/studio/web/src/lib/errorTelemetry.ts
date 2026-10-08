import { useQuery } from '@tanstack/react-query';

import { rpcQuery } from '../runtime/rpc.ts';
import { useErrorTelemetry } from '../runtime/telemetry.ts';

export function ResearcherErrorTelemetry(): null {
  const status = useQuery(
    rpcQuery('status', undefined, { staleTime: Infinity }),
  );
  useErrorTelemetry('researcher', status.data?.telemetry === true);
  return null;
}
