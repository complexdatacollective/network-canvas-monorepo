import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

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
 * visits. The whole toast is clickable and opens the {@link WelcomeDialog};
 * dismissing it (or opening the dialog) records a "seen" flag so it never
 * shows again.
 *
 * Self-contained and animated with `motion` (the same spring Architect's
 * dialogs use) rather than the shared toast system, so it matches the app's
 * styling and gets a weighty, springy enter/exit.
 */
const WelcomeToast = () => {
  const [toastVisible, setToastVisible] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!hasSeenWelcome()) {
      setToastVisible(true);
    }
  }, []);

  const dismiss = () => {
    markWelcomeSeen();
    setToastVisible(false);
  };

  const openDialog = () => {
    markWelcomeSeen();
    setToastVisible(false);
    setDialogOpen(true);
  };

  return (
    <>
      <AnimatePresence>
        {toastVisible && (
          <motion.div
            key="welcome-toast"
            initial={{ opacity: 0, y: 140, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              y: 60,
              scale: 0.96,
              transition: {
                type: 'tween',
                duration: 0.22,
                ease: [0.4, 0, 1, 1],
              },
            }}
            transition={{
              type: 'spring',
              stiffness: 320,
              damping: 18,
              mass: 1.1,
            }}
            className="fixed right-6 bottom-6 z-(--z-modal) w-88 max-w-[calc(100vw-3rem)]"
          >
            {/* The whole card is the click target; the close button is a
                sibling (not nested) so both stay valid, focusable buttons. */}
            <button
              type="button"
              onClick={openDialog}
              className="bg-surface-1 text-surface-1-foreground border-surface-3 hover:border-action focusable flex w-full cursor-pointer items-start gap-3 rounded-lg border p-4 pr-10 text-left shadow-xl transition-colors"
            >
              <span className="text-2xl leading-none" aria-hidden>
                🎉
              </span>
              <span className="block">
                <span className="block text-sm font-semibold">
                  Welcome to Architect Web!
                </span>
                <span className="text-surface-1-foreground/70 mt-0.5 block text-sm">
                  Click here to learn more about this software.
                </span>
              </span>
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={dismiss}
              className="text-surface-1-foreground/50 hover:text-surface-1-foreground focusable absolute top-2 right-2 cursor-pointer rounded p-1 transition-colors"
            >
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <WelcomeDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
};

export default WelcomeToast;
