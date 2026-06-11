import { useEffect, useRef, useState } from 'react';

import { useToast } from '@codaco/fresco-ui/Toast';

import WelcomeDialog from './WelcomeDialog';

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
 * visits. Clicking the toast opens the {@link WelcomeDialog}; dismissing it
 * (or opening the dialog) records a "seen" flag so it never shows again.
 */
const WelcomeToast = () => {
  const { add, close } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  // `useToast` returns fresh `add`/`close` each render, so read them through
  // refs and run the toast effect once on mount rather than re-running (and
  // re-adding the toast) on every render.
  const addRef = useRef(add);
  const closeRef = useRef(close);
  addRef.current = add;
  closeRef.current = close;

  useEffect(() => {
    if (hasSeenWelcome()) {
      return undefined;
    }

    let toastId = '';

    const openDialog = () => {
      markWelcomeSeen();
      setDialogOpen(true);
      closeRef.current(toastId);
    };

    toastId = addRef.current({
      title: 'Welcome to Architect Web!',
      description: (
        <button
          type="button"
          onClick={openDialog}
          className="cursor-pointer text-left underline underline-offset-2"
        >
          Click here to learn more about this software.
        </button>
      ),
      variant: 'success',
      icon: <span className="text-xl leading-none">🎉</span>,
      timeout: 0,
      // Closing the toast (via the close button, swipe, etc.) records the flag.
      onClose: markWelcomeSeen,
    });

    // The toast is persistent (`timeout: 0`) and lives in the app-level
    // provider, so close it when the start screen unmounts to stop it
    // lingering on other routes.
    return () => {
      closeRef.current(toastId);
    };
  }, []);

  return <WelcomeDialog open={dialogOpen} onOpenChange={setDialogOpen} />;
};

export default WelcomeToast;
