import { skipToken, useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useEffect } from 'react';

import { toStudyId } from '../lib/ids.ts';
import { setResearcherLogTeam } from '../runtime/browserLogs.ts';
import { rpcKey, rpcQuery } from '../runtime/rpc.ts';

export const screenTeam = (
  routeTeamId: string | undefined,
  studyId: string | undefined,
  studyTeamId: string | undefined,
): string | undefined =>
  routeTeamId ?? (studyId === undefined ? undefined : studyTeamId);

export function useResearcherLogTeam(): void {
  const { teamId, studyId } = useParams({ strict: false });
  const study = useQuery(
    studyId === undefined
      ? { queryKey: rpcKey('studies.get'), queryFn: skipToken }
      : rpcQuery('studies.get', { studyId: toStudyId(studyId) }),
  );
  const team = screenTeam(teamId, studyId, study.data?.teamId);
  useEffect(() => {
    setResearcherLogTeam(team);
    return () => setResearcherLogTeam(undefined);
  }, [team]);
}
