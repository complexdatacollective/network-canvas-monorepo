import { useEffect } from 'react';

import { returnToArchitect9 } from '~/utils/architect9Handoff';
import {
  isCriticalOperationInProgress,
  subscribeCriticalOperation,
} from '~/utils/criticalOperation';
import {
  isLaunchActivityInProgress,
  subscribeLaunchActivity,
} from '~/utils/launchActivity';

/**
 * The start screen of the Architect 8 build served inside Architect 9. That
 * build is the protocol editor alone: Architect 9's start screen lists its
 * protocols and opens them here, so whenever this one would show — the editor
 * was closed, or /v8/ was loaded with nothing to open — the tab goes back to
 * Architect 9 instead.
 *
 * Not until launch work is done, though: a protocol named in the URL or a file
 * handed over may still open the editor, or be explaining in a dialog why it
 * could not. Nor while a save, import or export is still writing, which the
 * navigation would cut short.
 */
const ReturnToArchitect9 = () => {
  useEffect(() => {
    let active = true;
    const returnWhenIdle = () => {
      if (!active) return;
      if (isLaunchActivityInProgress() || isCriticalOperationInProgress()) {
        return;
      }
      returnToArchitect9();
    };

    const unsubscribeActivity = subscribeLaunchActivity(returnWhenIdle);
    const unsubscribeCritical = subscribeCriticalOperation(returnWhenIdle);
    // After this commit's other effects, so work they start from the URL is
    // already counted.
    queueMicrotask(returnWhenIdle);
    return () => {
      active = false;
      unsubscribeActivity();
      unsubscribeCritical();
    };
  }, []);

  return null;
};

export default ReturnToArchitect9;
