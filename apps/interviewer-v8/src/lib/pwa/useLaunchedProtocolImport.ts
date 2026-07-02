import { useEffect, useSyncExternalStore } from 'react';

import type { ImportRequest } from '~/lib/protocol/useProtocolImport';
import {
  getLaunchFiles,
  subscribeLaunchFiles,
  takeLaunchFiles,
} from './fileLaunchQueue';

// Feeds OS-launched .netcanvas files (double-clicked in Finder/Explorer with
// the installed PWA as handler) into the protocol-import pipeline. Mounted on
// Home — behind the auth gate — so files delivered while the vault was locked
// import only after unlock. Imports run sequentially: the pending-import deck
// card renders one at a time, and hashProtocol dedupes re-imports.
export function useLaunchedProtocolImport(
  startImport: (request: ImportRequest) => Promise<void>,
): void {
  const launchFiles = useSyncExternalStore(
    subscribeLaunchFiles,
    getLaunchFiles,
  );

  useEffect(() => {
    if (launchFiles.length === 0) return;
    const files = takeLaunchFiles();
    void (async () => {
      for (const file of files) {
        await startImport({ source: 'file', file, label: file.name });
      }
    })();
  }, [launchFiles, startImport]);
}
