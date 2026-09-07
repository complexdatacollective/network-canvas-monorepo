import { createElement, useEffect, useSyncExternalStore } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage } from '@codaco/app-i18n/react';
import { useToast } from '@codaco/fresco-ui/Toast';

import {
  getLaunchFailureCount,
  subscribeLaunchFiles,
  takeLaunchFailureCount,
} from './fileLaunchQueue';

const messages = defineMessages({
  couldNotOpenFile: {
    id: 'interviewer.launchFailureToast.couldNotOpenFile',
    defaultMessage: 'Could not open file',
    description: 'User-facing message in Interviewer Launch Failure Toast.',
  },
  filesUnreadable: {
    id: 'interviewer.launchFailureToast.filesUnreadable',
    defaultMessage:
      '{count, plural, one {# launched file could not be read. The file may have been moved, deleted, or become unavailable since it was opened.} other {# launched files could not be read. The files may have been moved, deleted, or become unavailable since they were opened.}}',
    description: 'Administration text in Interviewer useLaunchFailureToast.',
  },
});

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
    toast.toast({
      title: createElement(AppMessage, { message: messages.couldNotOpenFile }),
      description: createElement(AppMessage, {
        message: messages.filesUnreadable,
        values: { count },
      }),
      variant: 'destructive',
    });
  }, [failureCount, toast]);
}
