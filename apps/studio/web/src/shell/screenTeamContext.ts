import { createContext, useContext } from 'react';

import { NO_TEAM, type ResearcherLogScope } from '../runtime/browserLogs.ts';

export const ScreenTeamContext = createContext<ResearcherLogScope>(NO_TEAM);

export const useScreenTeam = (): ResearcherLogScope =>
  useContext(ScreenTeamContext);
