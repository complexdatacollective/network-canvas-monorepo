import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { BROWSER_LOG_TEAM_HEADER } from '@codaco/studio-contract/schema/browser-logs';

import { startBrowserLogs } from '../runtime/browserLogs.ts';
import { rpcQuery } from '../runtime/rpc.ts';
import { useErrorTelemetry } from '../runtime/telemetry.ts';

let researcherTeam: string | undefined;

export const setResearcherLogTeam = (teamId: string | undefined): void => {
  researcherTeam = teamId;
};

const researcherLogHeaders = (): Readonly<Record<string, string>> =>
  researcherTeam === undefined
    ? {}
    : { [BROWSER_LOG_TEAM_HEADER]: researcherTeam };

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
        : startBrowserLogs('researcher', {
            enabled: telemetry,
            level: logLevel,
            credentials: 'same-origin',
            headers: researcherLogHeaders,
          }),
    [telemetry, logLevel],
  );
  return null;
}
