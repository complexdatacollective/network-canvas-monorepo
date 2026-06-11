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

  // Guards against the effect adding a second toast (e.g. StrictMode double
  // invocation). The toast id lets the "learn more" action dismiss the toast.
  const shownRef = useRef(false);
  const toastIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (shownRef.current || hasSeenWelcome()) {
      return;
    }
    shownRef.current = true;

    const openDialog = () => {
      markWelcomeSeen();
      setDialogOpen(true);
      if (toastIdRef.current) {
        close(toastIdRef.current);
      }
    };

    toastIdRef.current = add({
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
  }, [add, close]);

  return <WelcomeDialog open={dialogOpen} onOpenChange={setDialogOpen} />;
};

export default WelcomeToast;
