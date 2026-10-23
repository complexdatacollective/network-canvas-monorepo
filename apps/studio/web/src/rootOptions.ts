import type { RootOptions } from 'react-dom/client';

import { reportCaughtStageCrash } from './participant/stageCrashes.ts';

export const studioRootOptions = {
  onCaughtError: (error, errorInfo) => {
    // oxlint-disable-next-line no-console -- React logs nothing itself once onCaughtError is set, so this keeps caught errors visible in the console
    console.error(error);
    reportCaughtStageCrash(errorInfo.errorBoundary);
  },
} satisfies RootOptions;
