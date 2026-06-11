import { Toast } from '@base-ui/react/toast';
import { useEffect, useRef, useState } from 'react';

import WelcomeDialog from './WelcomeDialog';
import type { WelcomeToastData } from './WelcomeToaster';

// Persists across visits so the first-run welcome toast is shown only once.
const WELCOME_SEEN_KEY = 'architect-web-welcome-seen';

const hasSeenWelcome = () => {
  try {
    return window.localStorage.getItem(WELCOME_SEEN_KEY) === 'true';
  } catch {
    // localStorage can throw (e.g. private mode); fail safe by treating it as
    // seen so we never get stuck showing the toast on every visit.
    return true;
  }
};

const markWelcomeSeen = () => {
  try {
    window.localStorage.setItem(WELCOME_SEEN_KEY, 'true');
  } catch {
    // Ignore — if we can't persist the flag there's nothing more to do.
  }
};

/**
 * Shows a one-time welcome toast on the start screen the first time a user
 * visits. Clicking it opens the {@link WelcomeDialog}; dismissing it (or
 * opening the dialog) records a "seen" flag so it never shows again.
 */
const WelcomeToast = () => {
  const manager = Toast.useToastManager<WelcomeToastData>();
  const [dialogOpen, setDialogOpen] = useState(false);

  // The manager is read through a ref so the toast effect can run once on
  // mount/unmount without re-adding the toast on every render.
  const managerRef = useRef(manager);
  managerRef.current = manager;

  useEffect(() => {
    if (hasSeenWelcome()) {
      return undefined;
    }

    let toastId = '';

    const openDialog = () => {
      markWelcomeSeen();
      setDialogOpen(true);
      managerRef.current.close(toastId);
    };

    toastId = managerRef.current.add({
      title: 'Welcome to Architect Web!',
      description: (
        <button
          type="button"
          onClick={openDialog}
          className="text-action cursor-pointer text-left underline underline-offset-2"
        >
          Click here to learn more about this software.
        </button>
      ),
      data: { icon: '🎉' },
      timeout: 0,
      // Closing the toast (via the close button, swipe, etc.) records the flag.
      onClose: markWelcomeSeen,
    });

    // The toast lives in the app-level provider, so close it when the start
    // screen unmounts to stop it lingering on other routes.
    return () => {
      managerRef.current.close(toastId);
    };
  }, []);

  return <WelcomeDialog open={dialogOpen} onOpenChange={setDialogOpen} />;
};

export default WelcomeToast;
