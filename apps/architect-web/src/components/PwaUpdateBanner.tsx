import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

import Button, { IconButton } from '~/lib/legacy-ui/components/Button';
import { cx } from '~/utils/cva';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

const PwaUpdateBanner = () => {
  const [registration, setRegistration] = useState<
    ServiceWorkerRegistration | undefined
  >();

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_swScriptUrl, swRegistration) => {
      setRegistration(swRegistration);
    },
  });

  // Poll for a new version during long editing sessions; clear the timer on
  // unmount so it does not leak or keep firing against a stale registration.
  useEffect(() => {
    if (!registration) return undefined;
    const intervalId = window.setInterval(() => {
      void registration.update();
    }, UPDATE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [registration]);

  if (!needRefresh) return null;

  return (
    <aside
      aria-label="Update available"
      aria-live="polite"
      className={cx(
        'fixed bottom-(--space-md) left-1/2 z-(--z-global-ui) -translate-x-1/2',
        'flex max-w-[calc(100vw-2rem)] items-center gap-(--space-md)',
        'border-border bg-surface-1 text-surface-1-foreground rounded border p-(--space-md) shadow-lg',
      )}
    >
      <p className="m-0 text-sm">
        A new version of Architect is available. Your work is saved.
      </p>
      <Button
        color="sea-green"
        size="small"
        onClick={() => void updateServiceWorker(true)}
      >
        Reload
      </Button>
      <IconButton
        variant="text"
        size="small"
        aria-label="Dismiss"
        onClick={() => setNeedRefresh(false)}
        icon={<X />}
      />
    </aside>
  );
};

export default PwaUpdateBanner;
