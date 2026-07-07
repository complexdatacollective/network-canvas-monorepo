import { useEffect, useSyncExternalStore } from 'react';

import { useToast } from '@codaco/fresco-ui/Toast';

import {
  getLaunchFailureCount,
  subscribeLaunchFiles,
  takeLaunchFailureCount,
} from './fileLaunchQueue';

// Surfaces a toast when an OS-launched file handle couldn't be read (file
// moved/deleted, volume unmounted between the OS launch and consumption).
// Mounted on Home — behind the auth gate, same as useLaunchedProtocolImport —
// so a failure that arrives while locked is shown once the user unlocks.
export function useLaunchFailureToast(): void {
  const failureCount = useSyncExternalStore(
    subscribeLaunchFiles,
    getLaunchFailureCount,
  );
  const toast = useToast();

  useEffect(() => {
    if (failureCount === 0) return;
    const count = takeLaunchFailureCount();
    const noun = count === 1 ? 'file' : 'files';
    toast.toast({
      title: 'Could not open file',
      description: `${count} launched ${noun} could not be read. The ${noun} may have been moved, deleted, or become unavailable since ${count === 1 ? 'it was' : 'they were'} opened.`,
      variant: 'destructive',
    });
  }, [failureCount, toast]);
}
