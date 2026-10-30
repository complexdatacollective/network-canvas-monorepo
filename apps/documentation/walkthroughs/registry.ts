import type { Walkthrough } from '~/components/walkthrough/types';

import frescoDeployment from './fresco-deployment/en';

const WALKTHROUGHS: Record<string, Walkthrough> = {
  [frescoDeployment.id]: frescoDeployment,
};

export const getWalkthrough = (id: string): Walkthrough | undefined =>
  WALKTHROUGHS[id];
