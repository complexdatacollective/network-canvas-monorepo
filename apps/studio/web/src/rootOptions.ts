import type { RootOptions } from 'react-dom/client';

import { reportCaughtStageCrash } from './participant/stageCrashes.ts';

export const studioRootOptions = {
  onCaughtError: (error, errorInfo) => {
    console.error(error);
    reportCaughtStageCrash(errorInfo.errorBoundary);
  },
} satisfies RootOptions;
