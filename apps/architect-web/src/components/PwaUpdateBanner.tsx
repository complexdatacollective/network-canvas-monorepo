import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

import { cx } from '~/utils/cva';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly
const OFFLINE_READY_TIMEOUT_MS = 6000;

const PwaUpdateBanner = () => {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_swScriptUrl, registration) => {
      if (!registration) return;
      window.setInterval(() => {
        void registration.update();
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  useEffect(() => {
    if (!offlineReady) return;
    const timer = window.setTimeout(
      () => setOfflineReady(false),
      OFFLINE_READY_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (!offlineReady && !needRefresh) return null;

  const dismiss = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        'fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4',
        'bg-rich-black text-platinum rounded-full border border-white/10 px-5 py-3 shadow-lg',
      )}
    >
      {needRefresh ? (
        <>
          <span>
            A new version of Architect is available. Your work is saved.
          </span>
          <button
            type="button"
            className={cx(
              'bg-sea-green rounded-full px-4 py-1 font-semibold text-white',
            )}
            onClick={() => void updateServiceWorker(true)}
          >
            Reload
          </button>
          <button type="button" aria-label="Dismiss" onClick={dismiss}>
            ✕
          </button>
        </>
      ) : (
        <span>{`Architect v${__APP_VERSION__} is ready to work offline.`}</span>
      )}
    </div>
  );
};

export default PwaUpdateBanner;
