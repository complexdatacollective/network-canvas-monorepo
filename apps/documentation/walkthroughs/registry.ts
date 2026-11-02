import type { Walkthrough } from '~/components/walkthrough/types';

import frescoDeployment from './fresco-deployment/en';
import workingWithRosters from './working-with-rosters/en';

const WALKTHROUGHS: Record<string, Walkthrough> = {
  [frescoDeployment.id]: frescoDeployment,
  [workingWithRosters.id]: workingWithRosters,
};

export const getWalkthrough = (id: string): Walkthrough | undefined =>
  WALKTHROUGHS[id];
