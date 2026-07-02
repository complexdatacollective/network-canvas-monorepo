import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useLocation } from 'wouter';

import Button from '@codaco/fresco-ui/Button';
import CloseButton from '@codaco/fresco-ui/CloseButton';
import { surfaceVariants } from '@codaco/fresco-ui/layout/Surface';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

// The one route where a reload would interrupt data collection. While the
// location is inside it, the prompt is withheld — the update surfaces when
// the researcher leaves the interview.
const isInterviewActive = (location: string): boolean =>
  location.startsWith('/interview/');

// A pending update is NEVER applied automatically: reloading is always the
// researcher's explicit choice via this prompt — a bottom-centre banner
// mirroring Architect's. (An earlier fresh-load silent reload made the app
// appear to restart itself.)
const PwaUpdateBanner = () => {
  const [location] = useLocation();
  const interviewActive = isInterviewActive(location);

  const [registration, setRegistration] = useState<
    ServiceWorkerRegistration | undefined
  >();
  const [dismissed, setDismissed] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_swScriptUrl, swRegistration) => {
      setRegistration(swRegistration);
    },
  });

  // Poll for a new version during long sessions; clear the timer on unmount so
  // it does not leak or keep firing against a stale registration.
  useEffect(() => {
    if (!registration) return undefined;
    const intervalId = window.setInterval(() => {
      void registration.update();
    }, UPDATE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [registration]);

  if (!needRefresh || dismissed || interviewActive) return null;

  return (
    <aside
      aria-label="Update available"
      aria-live="polite"
      className={cx(
        // The chip treatment ToastItem uses: surfaceVariants for padding/
        // radius/shadow (the Surface COMPONENT is a page-width container and
        // collapses a shrink-to-fit fixed element), plus the surface tokens.
        surfaceVariants({ spacing: 'sm' }),
        'bg-surface text-surface-contrast border-outline border bg-clip-padding',
        'flex items-center gap-4',
        // Positioning LAST: surfaceVariants carries `relative`, and cx
        // (tailwind-merge) resolves position conflicts in favour of the
        // later class — `fixed` must win.
        'fixed bottom-6 left-1/2 z-50 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2',
      )}
    >
      <Paragraph margin="none" className="text-sm">
        A new version of Interviewer is available. Your work is saved.
      </Paragraph>
      <Button
        color="primary"
        size="sm"
        onClick={() => void updateServiceWorker(true)}
      >
        Reload
      </Button>
      <CloseButton size="sm" onClick={() => setDismissed(true)} />
    </aside>
  );
};

export default PwaUpdateBanner;
