import { skipToken, useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { Schema } from 'effect';
import { type ReactNode, useMemo } from 'react';

import { StudyId, TeamId } from '@codaco/studio-contract/schema/ids';

import { NO_TEAM, teamScope } from '../runtime/browserLogs.ts';
import { rpcKey, rpcQuery } from '../runtime/rpc.ts';
import { ScreenTeamContext } from './screenTeamContext.ts';

const isTeamId = Schema.is(TeamId);

const isStudyId = Schema.is(StudyId);

export const screenTeam = (
  routeTeamId: string | undefined,
  studyId: string | undefined,
  studyTeamId: string | undefined,
): string | undefined =>
  routeTeamId ?? (studyId === undefined ? undefined : studyTeamId);

export function ScreenTeamProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const params = useParams({ strict: false });
  const teamId = isTeamId(params.teamId) ? params.teamId : undefined;
  const studyId = isStudyId(params.studyId) ? params.studyId : undefined;
  const study = useQuery(
    studyId === undefined
      ? { queryKey: rpcKey('studies.get'), queryFn: skipToken }
      : rpcQuery('studies.get', { studyId }),
  );
  const team = screenTeam(teamId, studyId, study.data?.teamId);
  const scope = useMemo(
    () => (team === undefined ? NO_TEAM : teamScope(team)),
    [team],
  );
  return (
    <ScreenTeamContext.Provider value={scope}>
      {children}
    </ScreenTeamContext.Provider>
  );
}
